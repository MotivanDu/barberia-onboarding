import { NextRequest, NextResponse } from 'next/server'
import QRCode from 'qrcode'
import { supabaseAdmin } from '@/lib/supabase'
import { obterQR, estadoInstancia, dadosInstancia } from '@/lib/evolution'

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

  const [barberia, dados, barbeirosCount] = await Promise.all([
    estadoInstancia(INSTANCIA_BARBERIA),
    dadosInstancia(INSTANCIA_BARBERIA),
    supabaseAdmin.from('barbeiros').select('id', { count: 'exact', head: true }).eq('ativo', true),
  ])
  const jid = dados?.ownerJid || ''
  const numeroCentral = jid ? jid.replace('@s.whatsapp.net', '').replace(/\D/g, '') : null

  return NextResponse.json({
    barberia_state: barberia?.data?.instance?.state || 'inexistente',
    barberia_numero: numeroCentral,
    barbeiros_total: barbeirosCount.count || 0,
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
    let numeroLimpo: string | undefined
    if (body.numero) {
      numeroLimpo = String(body.numero).replace(/\D/g, '')
      if (numeroLimpo.length === 10 || numeroLimpo.length === 11) numeroLimpo = '55' + numeroLimpo
      if (numeroLimpo.length < 12 || numeroLimpo.length > 13) {
        return NextResponse.json({ error: 'Número inválido. Use DDD + número.' }, { status: 400 })
      }
    }

    let conectar = await obterQR(INSTANCIA_BARBERIA, numeroLimpo)
    let pairing: string | null = conectar?.data?.pairingCode || null
    let qr: string | null = null
    if (!numeroLimpo) {
      const base64 = conectar?.data?.base64 || conectar?.data?.qrcode?.base64 || null
      if (base64) qr = base64.startsWith('data:') ? base64 : `data:image/png;base64,${base64}`
      else {
        const code = conectar?.data?.code || conectar?.data?.qrcode?.code || null
        if (code) qr = await QRCode.toDataURL(code, { width: 320, margin: 2 })
      }
    }
    // pairing pode demorar 1-2s em socket recém-aberto: uma retentativa
    if (numeroLimpo && !pairing) {
      await new Promise(r => setTimeout(r, 2500))
      conectar = await obterQR(INSTANCIA_BARBERIA, numeroLimpo)
      pairing = conectar?.data?.pairingCode || null
    }

    const estado = await estadoInstancia(INSTANCIA_BARBERIA)
    const state = estado?.data?.instance?.state || 'close'
    if (!qr && !pairing && state !== 'open') {
      return NextResponse.json({ error: 'Não foi possível gerar a conexão. Tente novamente.', state }, { status: 502 })
    }
    return NextResponse.json({ qr, pairing, state })
  }

  return NextResponse.json({ error: 'ação inválida' }, { status: 400 })
}
