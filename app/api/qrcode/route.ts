import { NextRequest, NextResponse } from 'next/server'
import QRCode from 'qrcode'
import { supabaseAdmin } from '@/lib/supabase'
import {
  criarInstancia,
  configurarWebhook,
  obterQR,
  estadoInstancia,
  desligarInstancia,
  logoutInstancia,
  dadosInstancia,
} from '@/lib/evolution'
import { reiniciarEvolution, easypanelConfigurado } from '@/lib/easypanel'

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
    const { codigo, acao, numero, semRestart } = await req.json()
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
    let criada = await criarInstancia(instancia)
    const hash =
      typeof criada?.data?.hash === 'string'
        ? criada.data.hash
        : criada?.data?.hash?.apikey || null

    // MODO CÓDIGO: se a instância já existia presa em ciclo de QR, o pairing vem vazio.
    // Reciclar é seguro SOMENTE se ela NUNCA teve sessão (ownerJid vazio) — instância que
    // já conectou alguma vez jamais é deletada aqui (a sessão salva permite reconexão).
    if (numeroLimpo && instancia !== INSTANCIA_RESERVADA && !criada.ok) {
      const [dados, estadoAtual] = await Promise.all([dadosInstancia(instancia), estadoInstancia(instancia)])
      const st = estadoAtual?.data?.instance?.state
      const nuncaConectou = !dados?.ownerJid
      if (st !== 'open' && nuncaConectou) {
        await desligarInstancia(instancia)
        criada = await criarInstancia(instancia)
      }
    }
    if (criada.ok) await new Promise(r => setTimeout(r, 2000)) // socket recém-criado precisa de um instante

    // Webhook da instância → n8n (mensagens + status de conexão)
    await configurarWebhook(instancia)

    // Atualiza o tenant (migra de 'BarberIA' para instância própria na primeira conexão)
    const patch: Record<string, unknown> = {
      evolution_instance: instancia,
      evolution_status: 'conectando',
    }
    if (hash) patch.evolution_apikey = hash
    await supabaseAdmin.from('tenants').update(patch).eq('id', tenant.id)

    // Destrava a sessão: instância presa em 'open' morto (aparece conectada mas não
    // envia) não gera QR — deslogar libera um QR/código novo. NÃO apaga a instância.
    await logoutInstancia(instancia).catch(() => {})
    await new Promise(r => setTimeout(r, 1500))

    // Conexão: QR (padrão) e/ou pairing code de 8 dígitos (fallback iPhone) — via /connect
    let conectar = await obterQR(instancia, numeroLimpo)
    let qr = numeroLimpo ? null : await extrairQrDataUrl(conectar)
    let pairing: string | null = conectar?.data?.pairingCode || null

    // se não veio nada, recria a instância do zero (mesmo nome → dados intactos no Supabase)
    if (!qr && !pairing) {
      await desligarInstancia(instancia).catch(() => {})
      await new Promise(r => setTimeout(r, 1500))
      await criarInstancia(instancia).catch(() => {})
      await configurarWebhook(instancia).catch(() => {})
      await new Promise(r => setTimeout(r, 2500))
      conectar = await obterQR(instancia, numeroLimpo)
      qr = numeroLimpo ? null : await extrairQrDataUrl(conectar)
      pairing = conectar?.data?.pairingCode || null
    }

    // pairing pode demorar 1-2s a mais em socket novo: uma retentativa
    if (numeroLimpo && !pairing) {
      await new Promise(r => setTimeout(r, 2500))
      conectar = await obterQR(instancia, numeroLimpo)
      pairing = conectar?.data?.pairingCode || null
    }

    const estado = await estadoInstancia(instancia)
    const state = estado?.data?.instance?.state || 'close'

    if (!qr && !pairing) {
      // Instância travada não gera código nem QR (sessão presa no processo do
      // Evolution). Reinicia o serviço no Easypanel (destrava) e pede pra tentar
      // de novo em ~45s — o retry (semRestart=true) não reinicia de novo.
      if (easypanelConfigurado() && !semRestart) {
        const rst = await reiniciarEvolution()
        if (rst.ok) {
          return NextResponse.json({
            reiniciando: true,
            state,
            aviso: 'A conexão travou. Reiniciei o servidor — aguarde ~45 segundos que eu tento de novo automaticamente.',
          })
        }
      }
      return NextResponse.json(
        {
          error: numeroLimpo
            ? 'Não foi possível gerar o código agora. Aguarde uns segundos e tente de novo.'
            : 'Não foi possível gerar o QR Code. Aguarde uns segundos e tente de novo.',
          state,
        },
        { status: 502 }
      )
    }

    return NextResponse.json({ qr, pairing, instancia, state, nome_barbearia: tenant.nome_barbearia })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'erro inesperado'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
