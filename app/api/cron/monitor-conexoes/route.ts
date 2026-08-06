import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { listarInstancias, enviarTexto, sondarEnvio } from '@/lib/evolution'
import { reiniciarEvolution, easypanelConfigurado } from '@/lib/easypanel'
import { enviarEmailAlerta } from '@/lib/email'

// Número padrão que recebe os alertas de gerência (se o config não estiver setado)
const DU_PADRAO = '5519992252913'

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret')
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'não autorizado' }, { status: 401 })
  }

  // Número de alerta configurável pelo admin (configuracoes.numero_alerta) —
  // trocar no painel muda aqui e no workflow de erro do n8n de uma vez.
  const { data: cfgAlerta } = await supabaseAdmin
    .from('configuracoes').select('valor').eq('chave', 'numero_alerta').maybeSingle()
  const DU = cfgAlerta?.valor || DU_PADRAO

  const instancias = await listarInstancias()
  if (instancias.length === 0) return NextResponse.json({ ok: true, aviso: 'sem instâncias', alertas: 0 })

  // ESTADO REAL: o 'open' do Evolution não garante que ENVIA (chip caído aparece
  // 'open' mas dá "Connection Closed" no envio). Sondamos cada 'open' e, se não
  // estiver realmente viva, tratamos como CAIU — assim o vigia pega o zumbi.
  const estadoReal: Record<string, string> = {}
  const zumbis: string[] = [] // aparecem 'open' mas não enviam — um restart destrava
  await Promise.all(
    instancias.map(async i => {
      if (i.state === 'open') {
        const probe = await sondarEnvio(i.name)
        if (probe.vivo) {
          estadoReal[i.name] = 'open'
        } else {
          estadoReal[i.name] = 'close'
          zumbis.push(i.name)
        }
      } else {
        estadoReal[i.name] = i.state
      }
    })
  )

  // estado anterior (pra avisar só quando cai/volta, sem spam)
  const { data: anteriores } = await supabaseAdmin.from('alertas_conexao').select('*')
  const prevPorInst: Record<string, { estado: string; avisado: boolean }> = {}
  for (const a of anteriores || []) prevPorInst[a.instancia] = { estado: a.estado, avisado: a.avisado }

  // nomes amigáveis + telefone do barbeiro (pra ele reconectar sozinho)
  const BASE = process.env.NEXT_PUBLIC_APP_URL || 'https://barberia-onboarding.vercel.app'
  const [{ data: tenants }, { data: barbeiros }] = await Promise.all([
    supabaseAdmin.from('tenants').select('id, evolution_instance, nome_barbearia, codigo'),
    supabaseAdmin.from('barbeiros').select('tenant_id, telefone').eq('ativo', true),
  ])
  const tenantPorInst: Record<string, { id: string; nome: string; codigo: string }> = {}
  for (const t of tenants || []) if (t.evolution_instance) tenantPorInst[t.evolution_instance] = { id: t.id, nome: t.nome_barbearia, codigo: t.codigo }
  const telefonePorTenant: Record<string, string> = {}
  for (const b of barbeiros || []) if (b.tenant_id && b.telefone && !telefonePorTenant[b.tenant_id]) telefonePorTenant[b.tenant_id] = String(b.telefone).replace(/\D/g, '')

  function amigavel(name: string) {
    if (name === 'BarberIA') return 'O número CENTRAL do BarberIA (canal dos barbeiros)'
    const t = tenantPorInst[name]
    return t ? `O WhatsApp da barbearia *${t.nome}* (${t.codigo})` : `A instância *${name}*`
  }

  // candidatos a remetente: instâncias "open" (central primeiro). Como o "open"
  // do Evolution nem sempre consegue enviar (ex.: Connection Closed), tentamos
  // uma a uma até alguma realmente entregar.
  const remetentes = instancias
    .filter(i => estadoReal[i.name] === 'open')
    .map(i => i.name)
    .sort((a, b) => (a === 'BarberIA' ? -1 : b === 'BarberIA' ? 1 : 0))

  async function enviarPara(destino: string, texto: string): Promise<boolean> {
    for (const r of remetentes) {
      const res = await enviarTexto(r, destino, texto)
      if (res.ok) return true
    }
    return false
  }
  const enviarPorAlguma = (texto: string) => enviarPara(DU, texto)

  const quedas: { name: string; friendly: string }[] = []
  const voltas: { name: string; friendly: string }[] = []
  const upsertsOpen: any[] = []
  const agora = new Date().toISOString()

  // ── GERENTE 2.0 — INSTABILIDADE (flapping) ──────────────────────────────
  // O 'open' que envia não basta: um número pode ficar "piscando" (reconecta
  // sem parar) e aí DUPLICA importação / engole mensagem, mesmo aparecendo no
  // ar — foi o que passou batido antes. O fluxo n8n grava cada evento de
  // conexão em `eventos_conexao`; aqui contamos os da última janela: excesso =
  // instável → avisa o Du + restart (o restart estabiliza, igual fizemos na mão).
  const JANELA_FLAP_MIN = 10
  const LIMITE_FLAP = 8
  const desdeFlap = new Date(Date.now() - JANELA_FLAP_MIN * 60 * 1000).toISOString()
  const { data: eventosFlap } = await supabaseAdmin
    .from('eventos_conexao').select('instancia').gte('criado_em', desdeFlap)
  const flapCount: Record<string, number> = {}
  for (const e of eventosFlap || []) flapCount[e.instancia] = (flapCount[e.instancia] || 0) + 1
  const instaveis = Object.entries(flapCount)
    .filter(([, n]) => n >= LIMITE_FLAP)
    .map(([name, n]) => ({ name, n }))
  // não deixa a tabela crescer: mantém ~2h de histórico
  await supabaseAdmin.from('eventos_conexao')
    .delete().lt('criado_em', new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString())

  // avisa o Du sobre instabilidade — ANTES do restart (Evolution ainda no ar
  // pra conseguir enviar) e no máximo 1x/30min por instância (sem spam)
  const upsertsFlap: any[] = []
  let instabilidadeAvisada = 0
  for (const ins of instaveis) {
    const flapRow = (anteriores || []).find((a: any) => a.instancia === `${ins.name}__flap`)
    const ultimoMs = flapRow?.atualizado_em ? new Date(flapRow.atualizado_em).getTime() : 0
    if (Date.now() - ultimoMs < 30 * 60 * 1000) continue
    const friendly = amigavel(ins.name)
    const wa = await enviarPorAlguma(`⚠️ *INSTABILIDADE DETECTADA*\n\n${friendly} está *instável* — reconectou ${ins.n}x em ${JANELA_FLAP_MIN} min (fica "piscando", mesmo aparecendo no ar). Isso duplica mensagens e pode engolir atendimentos.\n\n🔄 Vou reiniciar o servidor automaticamente pra estabilizar. Se se repetir muito, o chip desse número precisa ser trocado.`)
    const em = await enviarEmailAlerta('⚠️ BarberIA: instância instável (piscando)', `${friendly.replace(/\*/g, '')} reconectou ${ins.n}x em ${JANELA_FLAP_MIN} min. Restart automático a caminho.`)
    if (wa || em.ok) { instabilidadeAvisada++; upsertsFlap.push({ instancia: `${ins.name}__flap`, estado: 'instavel', avisado: true, atualizado_em: agora }) }
  }

  for (const inst of instancias) {
    const prev = prevPorInst[inst.name]
    const st = estadoReal[inst.name]
    if (st === 'close') {
      const novaQueda = !prev || prev.estado !== 'close' || !prev.avisado
      if (novaQueda) quedas.push({ name: inst.name, friendly: amigavel(inst.name) })
    } else if (st === 'open') {
      if (prev && prev.estado === 'close' && prev.avisado) voltas.push({ name: inst.name, friendly: amigavel(inst.name) })
      upsertsOpen.push({ instancia: inst.name, estado: 'open', avisado: false, atualizado_em: agora })
    }
    // 'connecting'/'unknown' = transitório, não mexe
  }

  // AUTO-CURA: QUALQUER instância (central OU barbearia) que vire ZUMBI (aparece
  // 'open' mas não envia) é destravada por 1 restart do serviço Evolution — e um
  // restart cura todas de uma vez. Limitado a 1x/30min. Só ZUMBI dispara restart:
  // queda "limpa" (logout de verdade / device_removed) o restart NÃO resolve —
  // aí é re-scan de QR, e o barbeiro já recebe o link automático (self-service).
  let autoRestart = false
  if ((zumbis.length > 0 || instaveis.length > 0) && easypanelConfigurado()) {
    const lastRst = (anteriores || []).find((a: any) => a.instancia === '__last_restart__')
    const lastMs = lastRst?.atualizado_em ? new Date(lastRst.atualizado_em).getTime() : 0
    if (Date.now() - lastMs > 30 * 60 * 1000) {
      const rst = await reiniciarEvolution()
      autoRestart = rst.ok
      if (rst.ok) upsertsOpen.push({ instancia: '__last_restart__', estado: 'restart', avisado: true, atualizado_em: agora })
    }
  }

  let enviados = 0
  const upsertsClose: any[] = []

  let emails = 0
  let barbeirosAvisados = 0
  for (const q of quedas) {
    const texto = q.friendly.replace(/\*/g, '')
    const wa = await enviarPorAlguma(`⚠️ *ALERTA DE CONEXÃO*\n\n📵 ${q.friendly} *DESCONECTOU* do WhatsApp!\n\nReconecte o quanto antes para não parar o atendimento.`)
    const em = await enviarEmailAlerta('⚠️ BarberIA: conexão desconectou', `${texto} DESCONECTOU do WhatsApp. Reconecte o quanto antes para não parar o atendimento.`)
    if (wa) enviados++
    if (em.ok) emails++

    // AUTO-RECONNECT SELF-SERVICE: se for uma barbearia, avisa o PRÓPRIO barbeiro
    // com o link de reconexão pra ele reescanear sozinho (sem depender do Du).
    // Sai por OUTRA instância que esteja enviando — a dele está caída.
    const t = tenantPorInst[q.name]
    const tel = t ? telefonePorTenant[t.id] : null
    if (t && tel) {
      const link = `${BASE}/qrcode/${t.codigo}`
      const okBarbeiro = await enviarPara(
        tel,
        `⚠️ Ops! O WhatsApp da sua barbearia *${t.nome}* caiu e parou de atender seus clientes. 📵\n\nReconecte agora — leva 30 segundos:\n${link}\n\nAbra o link, escaneie o QR com *este* WhatsApp e pronto. 💈`
      )
      if (okBarbeiro) barbeirosAvisados++
    }

    // marca como "avisado" se ENTREGOU por qualquer canal; senão tenta de novo na próxima rodada
    upsertsClose.push({ instancia: q.name, estado: 'close', avisado: wa || em.ok, atualizado_em: agora })
  }
  for (const v of voltas) {
    const texto = v.friendly.replace(/\*/g, '')
    await enviarPorAlguma(`✅ *Conexão restabelecida*\n\n${v.friendly} voltou a conectar no WhatsApp. Tudo normalizado. 💈`)
    await enviarEmailAlerta('✅ BarberIA: conexão restabelecida', `${texto} voltou a conectar no WhatsApp. Tudo normalizado.`)
    // confirma pro barbeiro (agora pela instância dele, que voltou)
    const t = tenantPorInst[v.name]
    const tel = t ? telefonePorTenant[t.id] : null
    if (t && tel) {
      await enviarPara(tel, `✅ Prontinho! O WhatsApp da sua barbearia *${t.nome}* voltou a atender seus clientes normalmente. 💈`)
    }
  }

  const todosUpserts = [...upsertsOpen, ...upsertsClose, ...upsertsFlap]
  if (todosUpserts.length > 0) {
    await supabaseAdmin.from('alertas_conexao').upsert(todosUpserts, { onConflict: 'instancia' })
  }

  return NextResponse.json({
    ok: true,
    total: instancias.length,
    quedas: quedas.length,
    voltas: voltas.length,
    enviados,
    emails,
    barbeiros_avisados: barbeirosAvisados,
    auto_restart: autoRestart,
    zumbis: zumbis.length,
    instaveis: instaveis.map(i => ({ nome: i.name, eventos: i.n })),
    instabilidade_avisada: instabilidadeAvisada,
    remetentes_disponiveis: remetentes.length,
    estados: instancias.map(i => ({ nome: i.name, estado: i.state, envia: estadoReal[i.name] === 'open' })),
  })
}
