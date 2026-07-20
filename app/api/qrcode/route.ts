import { NextRequest, NextResponse } from 'next/server'
import QRCode from 'qrcode'
import { supabaseAdmin } from '@/lib/supabase'
import {
  criarInstancia,
  configurarWebhook,
  obterQR,
  estadoInstancia,
  desligarInstancia,
} from '@/lib/evolution'

// A instância compartilhada é o canal do BarberIA com os barbeiros — NUNCA apagar/reciclar
const INSTANCIA_RESERVADA = 'BarberIA'

async function buscarTenant(codigo: string) {
  const { data } = await supabaseAdmin
    .from('tenants')
    .select('id, nome_barbearia, codigo, evolution_instance, evolution_status')
    .eq('codigo', codigo.toUpperCase())
    .single()
  return data
}

function nomeInstanciaDoTenant(tenant: { codigo: string; evolution_instance: string }) {
  if (tenant.evolution_instance && tenant.evolution_instance !== INSTANCIA_RESERVADA) {
    return tenant.evolution_instance
  }
  return `inst_${tenant.codigo.toLowerCase()}`
}

async function extrairQrDataUrl(resp: any): Promise<string | null> {
  const base64 =
    resp?.data?.base64 || resp?.data?.qrcode?.base64 || null
  if (base64) return base64.startsWith('data:') ? base64 : `data:image/png;base64,${base64}`
  const code = resp?.data?.code || resp?.data?.qrcode?.code || null
  if (code) return QRCode.toDataURL(code, { width: 320, margin: 2 })
  return null
}

export async function GET(req: NextRequest) {
  const codigo = req.nextUrl.searchParams.get('codigo')
  if (!codigo) return NextResponse.json({ error: 'codigo obrigatório' }, { status: 400 })

  const tenant = await buscarTenant(codigo)
  if (!tenant) return NextResponse.json({ error: 'Barbearia não encontrada' }, { status: 404 })

  const instancia = nomeInstanciaDoTenant(tenant)
  const estado = await estadoInstancia(instancia)
  const state = estado?.data?.instance?.state || 'inexistente'

  return NextResponse.json({
    nome_barbearia: tenant.nome_barbearia,
    codigo: tenant.codigo,
    instancia,
    state,
  })
}

export async function POST(req: NextRequest) {
  try {
    const { codigo, acao, numero } = await req.json()
    if (!codigo) return NextResponse.json({ error: 'codigo obrigatório' }, { status: 400 })

    // Pareamento por código (fallback p/ iPhone): normaliza o número
    let numeroLimpo: string | undefined
    if (numero) {
      numeroLimpo = String(numero).replace(/\D/g, '')
      if (numeroLimpo.length === 10 || numeroLimpo.length === 11) numeroLimpo = '55' + numeroLimpo
      if (numeroLimpo.length < 12 || numeroLimpo.length > 13) {
        return NextResponse.json(
          { error: 'Número inválido. Use DDD + número (ex.: 11 99999-8888).' },
          { status: 400 }
        )
      }
    }

    const tenant = await buscarTenant(codigo)
    if (!tenant) return NextResponse.json({ error: 'Barbearia não encontrada' }, { status: 404 })

    const instancia = nomeInstanciaDoTenant(tenant)

    // "Mudei de número": derruba a instância antiga e recria do zero (mesmo nome → nada mais muda;
    // clientes/agendamentos/histórico ficam intactos no Supabase)
    if (acao === 'novo-numero' && instancia !== INSTANCIA_RESERVADA) {
      await desligarInstancia(instancia)
    }

    // Cria a instância (se já existir, a Evolution recusa — seguimos em frente)
    const criada = await criarInstancia(instancia)
    const hash =
      typeof criada?.data?.hash === 'string'
        ? criada.data.hash
        : criada?.data?.hash?.apikey || null

    // Webhook da instância → n8n (mensagens + status de conexão)
    await configurarWebhook(instancia)

    // Atualiza o tenant (migra de 'BarberIA' para instância própria na primeira conexão)
    const patch: Record<string, unknown> = {
      evolution_instance: instancia,
      evolution_status: 'conectando',
    }
    if (hash) patch.evolution_apikey = hash
    await supabaseAdmin.from('tenants').update(patch).eq('id', tenant.id)

    // Conexão: QR (padrão) e/ou pairing code de 8 dígitos (fallback iPhone)
    let qr = await extrairQrDataUrl(criada)
    let pairing: string | null =
      criada?.data?.qrcode?.pairingCode || criada?.data?.pairingCode || null

    if (numeroLimpo || !qr) {
      const conectar = await obterQR(instancia, numeroLimpo)
      if (!qr) qr = await extrairQrDataUrl(conectar)
      pairing = conectar?.data?.pairingCode || pairing
    }

    const estado = await estadoInstancia(instancia)
    const state = estado?.data?.instance?.state || 'close'

    if (numeroLimpo && !pairing && state !== 'open') {
      return NextResponse.json(
        { error: 'Não foi possível gerar o código. Confira o número (com DDD) e tente novamente.', state },
        { status: 502 }
      )
    }
    if (!qr && !pairing && state !== 'open') {
      return NextResponse.json(
        { error: 'Não foi possível gerar o QR Code. Tente novamente.', state },
        { status: 502 }
      )
    }

    return NextResponse.json({ qr, pairing, instancia, state, nome_barbearia: tenant.nome_barbearia })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'erro inesperado'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
