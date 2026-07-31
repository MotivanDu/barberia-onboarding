import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { listarInstancias, enviarTexto, sondarEnvio } from '@/lib/evolution'
import { enviarEmailAlerta } from '@/lib/email'

// Número do Du que recebe os alertas de conexão
const DU = '5519992252913'

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret')
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'não autorizado' }, { status: 401 })
  }

  const instancias = await listarInstancias()
  if (instancias.length === 0) return NextResponse.json({ ok: true, aviso: 'sem instâncias', alertas: 0 })

  // ESTADO REAL: o 'open' do Evolution não garante que ENVIA (chip caído aparece
  // 'open' mas dá "Connection Closed" no envio). Sondamos cada 'open' e, se não
  // estiver realmente viva, tratamos como CAIU — assim o vigia pega o zumbi.
  const estadoReal: Record<string, string> = {}
  await Promise.all(
    instancias.map(async i => {
      if (i.state === 'open') {
        const probe = await sondarEnvio(i.name)
        estadoReal[i.name] = probe.vivo ? 'open' : 'close'
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

  const todosUpserts = [...upsertsOpen, ...upsertsClose]
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
    remetentes_disponiveis: remetentes.length,
    estados: instancias.map(i => ({ nome: i.name, estado: i.state, envia: estadoReal[i.name] === 'open' })),
  })
}
