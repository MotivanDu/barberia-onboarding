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
    const { codigo, acao } = await req.json()
    if (!codigo) return NextResponse.json({ error: 'codigo obrigatório' }, { status: 400 })

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

    // QR: primeiro da resposta do create; senão pede via connect
    let qr = await extrairQrDataUrl(criada)
    if (!qr) {
      const conectar = await obterQR(instancia)
      qr = await extrairQrDataUrl(conectar)
    }

    const estado = await estadoInstancia(instancia)
    const state = estado?.data?.instance?.state || 'close'

    if (!qr && state !== 'open') {
      return NextResponse.json(
        { error: 'Não foi possível gerar o QR Code. Tente novamente.', state },
        { status: 502 }
      )
    }

    return NextResponse.json({ qr, instancia, state, nome_barbearia: tenant.nome_barbearia })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'erro inesperado'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
