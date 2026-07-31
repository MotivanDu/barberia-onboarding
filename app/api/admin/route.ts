import { NextRequest, NextResponse } from 'next/server'
import QRCode from 'qrcode'
import { supabaseAdmin } from '@/lib/supabase'
import { obterQR, estadoInstancia, dadosInstancia, logoutInstancia, desligarInstancia, criarInstancia, configurarWebhook, sondarEnvio } from '@/lib/evolution'
import { reiniciarEvolution, easypanelConfigurado } from '@/lib/easypanel'

import { usuarioAutorizado } from '@/lib/adminAuth'

const INSTANCIA_BARBERIA = 'BarberIA'

function autorizado(senha: string | null) {
  return usuarioAutorizado(senha) !== null
}

export async function GET(req: NextRequest) {
  const senha = req.headers.get('x-admin-senha')
  if (!autorizado(senha)) return NextResponse.json({ error: 'Senha inválida' }, { status: 401 })

  const { data: tenants } = await supabaseAdmin
    .from('tenants')
    .select('codigo, nome_barbearia, evolution_instance, evolution_status, sistema_ativo, status_assinatura, criado_em')
    .order('criado_em', { ascending: true })

  const [barberia, dados, barbeirosCount, cfgAlerta] = await Promise.all([
    estadoInstancia(INSTANCIA_BARBERIA),
    dadosInstancia(INSTANCIA_BARBERIA),
    supabaseAdmin.from('barbeiros').select('id', { count: 'exact', head: true }).eq('ativo', true),
    supabaseAdmin.from('configuracoes').select('valor').eq('chave', 'numero_alerta').maybeSingle(),
  ])
  const jid = dados?.ownerJid || ''
  const numeroCentral = jid ? jid.replace('@s.whatsapp.net', '').replace(/\D/g, '') : null

  const state = barberia?.data?.instance?.state || 'inexistente'
  // 'open' do Evolution não garante que ENVIA. Confirmamos com uma sonda real:
  // se o socket estiver morto (chip caiu), envio_ok = false mesmo com state 'open'.
  let envioOk = false
  if (state === 'open') {
    const probe = await sondarEnvio(INSTANCIA_BARBERIA, numeroCentral || undefined)
    envioOk = probe.vivo
  }

  return NextResponse.json({
    barberia_state: state,
    barberia_envio_ok: envioOk,
    barberia_numero: numeroCentral,
    barbeiros_total: barbeirosCount.count || 0,
    numero_alerta: cfgAlerta?.data?.valor || '5519992252913',
    tenants: tenants || [],
  })
}

export async function POST(req: NextRequest) {
  const senha = req.headers.get('x-admin-senha')
  if (!autorizado(senha)) return NextResponse.json({ error: 'Senha inválida' }, { status: 401 })

  const body = await req.json()
  const { acao } = body

  // Reconexão/troca de número do BarberIA central — NUNCA deleta a instância, só reconecta
  // a MESMA instância "BarberIA" → todos os barbeiros, vínculos e workflows continuam intactos.
  // Aceita número (opcional) para gerar código de pareamento de 8 dígitos (mais fácil que QR).
  if (acao === 'qr-barberia') {
    const semRestart = !!body.semRestart
    let numeroLimpo: string | undefined
    if (body.numero) {
      numeroLimpo = String(body.numero).replace(/\D/g, '')
      if (numeroLimpo.length === 10 || numeroLimpo.length === 11) numeroLimpo = '55' + numeroLimpo
      if (numeroLimpo.length < 12 || numeroLimpo.length > 13) {
        return NextResponse.json({ error: 'Número inválido. Use DDD + número.' }, { status: 400 })
      }
    }

    const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
    const extrair = async (r: any): Promise<{ qr: string | null; pairing: string | null }> => {
      const pairing = r?.data?.pairingCode || null
      let qr: string | null = null
      if (!numeroLimpo) {
        const base64 = r?.data?.base64 || r?.data?.qrcode?.base64 || null
        if (base64) qr = base64.startsWith('data:') ? base64 : `data:image/png;base64,${base64}`
        else {
          const code = r?.data?.code || r?.data?.qrcode?.code || null
          if (code) qr = await QRCode.toDataURL(code, { width: 320, margin: 2 })
        }
      }
      return { qr, pairing }
    }

    // 1) desloga a sessão atual — destrava a instância presa em 'open' (que aparece
    //    conectada mas está morta) e libera um QR/código novo. NÃO apaga a instância.
    await logoutInstancia(INSTANCIA_BARBERIA).catch(() => {})
    await sleep(2000)
    let conectar = await obterQR(INSTANCIA_BARBERIA, numeroLimpo)
    let { qr, pairing } = await extrair(conectar)

    // 2) se ainda não veio QR/código, recria a instância do ZERO (mesmo nome →
    //    barbeiros, vínculos e workflows continuam intactos) e reconfigura o webhook.
    if (!qr && !pairing) {
      await desligarInstancia(INSTANCIA_BARBERIA).catch(() => {})
      await sleep(1500)
      await criarInstancia(INSTANCIA_BARBERIA).catch(() => {})
      await configurarWebhook(INSTANCIA_BARBERIA).catch(() => {})
      await sleep(2500)
      conectar = await obterQR(INSTANCIA_BARBERIA, numeroLimpo)
      ;({ qr, pairing } = await extrair(conectar))
    }

    // 3) o código de pareamento pode demorar 1-2s num socket recém-aberto: uma retentativa
    if (numeroLimpo && !pairing) {
      await sleep(2500)
      conectar = await obterQR(INSTANCIA_BARBERIA, numeroLimpo)
      pairing = conectar?.data?.pairingCode || null
    }

    const estado = await estadoInstancia(INSTANCIA_BARBERIA)
    const state = estado?.data?.instance?.state || 'close'
    if (!qr && !pairing) {
      // Instância travada (zumbi): logout/delete/connect não geram QR porque a
      // sessão está presa no processo do Evolution. Reinicia o serviço Evolution
      // no Easypanel (destrava; recarrega instâncias limpas do banco) e pede pra
      // tentar de novo em ~45s — o retry (semRestart=true) não reinicia de novo.
      if (easypanelConfigurado() && !semRestart) {
        const rst = await reiniciarEvolution()
        if (rst.ok) {
          return NextResponse.json({
            reiniciando: true,
            state,
            aviso: 'A conexão estava travada. Reiniciei o servidor do WhatsApp — aguarde ~45 segundos que eu gero o QR automaticamente.',
          })
        }
        return NextResponse.json(
          { error: `Não consegui reiniciar o servidor automaticamente (status ${rst.status}). ${rst.body}`, state },
          { status: 502 }
        )
      }
      return NextResponse.json({ error: 'Não foi possível gerar a conexão agora. Aguarde uns segundos e tente de novo.', state }, { status: 502 })
    }
    return NextResponse.json({ qr, pairing, state })
  }

  // Trocar o número que recebe os alertas de gerência (erro no fluxo + queda de
  // conexão). Guardado em configuracoes.numero_alerta; o vigia e o workflow de
  // erro do n8n leem daqui → trocar aqui muda em TUDO.
  if (acao === 'salvar-numero-alerta') {
    let n = String(body.numero || '').replace(/\D/g, '')
    if (n.length === 10 || n.length === 11) n = '55' + n
    if (n.length < 12 || n.length > 13) {
      return NextResponse.json({ error: 'Número inválido. Use DDD + número (ex.: 11 99999-8888).' }, { status: 400 })
    }
    const { error } = await supabaseAdmin
      .from('configuracoes')
      .upsert({ chave: 'numero_alerta', valor: n, atualizado_em: new Date().toISOString() }, { onConflict: 'chave' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, numero_alerta: n })
  }

  return NextResponse.json({ error: 'ação inválida' }, { status: 400 })
}
