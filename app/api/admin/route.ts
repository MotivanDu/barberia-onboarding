import { NextRequest, NextResponse } from 'next/server'
import QRCode from 'qrcode'
import { supabaseAdmin } from '@/lib/supabase'
import { obterQR, estadoInstancia } from '@/lib/evolution'

const INSTANCIA_BARBERIA = 'BarberIA'

function autorizado(senha: string | null) {
  const esperada = process.env.ADMIN_PASSWORD || ''
  return esperada.length > 0 && senha === esperada
}

export async function GET(req: NextRequest) {
  const senha = req.headers.get('x-admin-senha')
  if (!autorizado(senha)) return NextResponse.json({ error: 'Senha inválida' }, { status: 401 })

  const { data: tenants } = await supabaseAdmin
    .from('tenants')
    .select('codigo, nome_barbearia, evolution_instance, evolution_status, sistema_ativo, status_assinatura, criado_em')
    .order('criado_em', { ascending: true })

  const barberia = await estadoInstancia(INSTANCIA_BARBERIA)

  return NextResponse.json({
    barberia_state: barberia?.data?.instance?.state || 'inexistente',
    tenants: tenants || [],
  })
}

export async function POST(req: NextRequest) {
  const senha = req.headers.get('x-admin-senha')
  if (!autorizado(senha)) return NextResponse.json({ error: 'Senha inválida' }, { status: 401 })

  const { acao } = await req.json()

  // Reconexão do número central do BarberIA (canal do barbeiro) — NUNCA deleta a instância,
  // só gera novo QR mantendo o MESMO nome → todos os vínculos e workflows continuam intactos
  if (acao === 'qr-barberia') {
    const conectar = await obterQR(INSTANCIA_BARBERIA)
    const base64 = conectar?.data?.base64 || conectar?.data?.qrcode?.base64 || null
    let qr: string | null = null
    if (base64) {
      qr = base64.startsWith('data:') ? base64 : `data:image/png;base64,${base64}`
    } else {
      const code = conectar?.data?.code || conectar?.data?.qrcode?.code || null
      if (code) qr = await QRCode.toDataURL(code, { width: 320, margin: 2 })
    }
    const estado = await estadoInstancia(INSTANCIA_BARBERIA)
    const state = estado?.data?.instance?.state || 'close'
    if (!qr && state !== 'open') {
      return NextResponse.json({ error: 'Não foi possível gerar o QR', state }, { status: 502 })
    }
    return NextResponse.json({ qr, state })
  }

  return NextResponse.json({ error: 'ação inválida' }, { status: 400 })
}
