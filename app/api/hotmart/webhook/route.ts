import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { enviarTexto } from '@/lib/evolution'

// Recebe os avisos de venda da Hotmart (Postback 2.0).
// Fluxo: pessoa compra na Hotmart -> aqui a barbearia é CRIADA e ATIVADA, e o
// comprador recebe no WhatsApp as boas-vindas + o link do passo a passo.
// Segurança: só age quando o hottok bate com HOTMART_HOTTOK. Sempre responde 200
// (pra validação do endereço passar e a Hotmart não reenviar).
export const dynamic = 'force-dynamic'

const CENTRAL = 'BarberIA'
const FELIPE = '555181209727'
const BASE = process.env.NEXT_PUBLIC_APP_URL || 'https://barberia-onboarding.vercel.app'

async function numeroAlerta(): Promise<string> {
  const { data } = await supabaseAdmin.from('configuracoes').select('valor').eq('chave', 'numero_alerta').maybeSingle()
  return data?.valor || '5519992252913'
}

function primeiro<T>(...vals: (T | undefined | null)[]): T | null {
  for (const v of vals) if (v !== undefined && v !== null && String(v).trim() !== '') return v as T
  return null
}

// Extrai os dados do comprador de vários caminhos possíveis do payload.
function extrairComprador(body: any) {
  const d = body?.data || {}
  const b = d.buyer || d.subscriber || {}
  const nome = primeiro<string>(b.name, b.full_name, d.name)
  const email = primeiro<string>(b.email, d.email)
  let tel = String(primeiro<string>(b.checkout_phone, b.phone, b.phone_number, b.ddd_phone) || '').replace(/\D/g, '')
  if (tel && (tel.length === 10 || tel.length === 11)) tel = '55' + tel
  const cpf = String(primeiro<string>(b.document, b.doc, b.cpf) || '').replace(/\D/g, '')
  return { nome: nome || 'Barbeiro', email: email || '', telefone: tel, cpf }
}

// Descobre o plano pela chave de rastreamento "Plano" (Mensal/Anual) ou pela oferta.
function extrairPlano(body: any): 'mensal' | 'anual' {
  // a chave de rastreamento "Plano" (Mensal/Anual) vem em purchase.offer.metadata
  const meta = body?.data?.purchase?.offer?.metadata || {}
  for (const k of Object.keys(meta)) {
    if (k.toLowerCase() === 'plano') {
      const v = String(meta[k]).toLowerCase()
      if (v.includes('anual')) return 'anual'
      if (v.includes('mensal')) return 'mensal'
    }
  }
  const raw = JSON.stringify(body || {}).toLowerCase()
  return raw.includes('mensal') ? 'mensal' : 'anual'
}

function codigoHotmart(body: any): string | null {
  const d = body?.data || {}
  const p = d.purchase || {}
  const s = d.subscription || {}
  return primeiro<string>(
    s.subscriber?.code, s.subscriber_code, s.code,
    p.subscription?.subscriber?.code, p.transaction, d.transaction
  ) as string | null
}

function gerarCodigo(nome: string): string {
  const base = (nome || 'BARBER').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) || 'BARBER'
  return base + Math.floor(Math.random() * 100).toString().padStart(2, '0')
}

// Cria a barbearia (ATIVA, pois já foi paga na Hotmart) + manda boas-vindas + link.
async function criarEAtivar(body: any) {
  const comprador = extrairComprador(body)
  const plano = extrairPlano(body)
  const hotmartCod = codigoHotmart(body)

  // se já existe uma barbearia pra essa assinatura da Hotmart, não duplica
  if (hotmartCod) {
    const { data: existe } = await supabaseAdmin.from('tenants').select('id').eq('asaas_subscription_id', hotmartCod).maybeSingle()
    if (existe) return
  }

  const { data: planos } = await supabaseAdmin.from('planos').select('*').eq('ativo', true)
  const planoRow = (planos || []).find(p =>
    plano === 'anual' ? (p.ciclo === 'YEARLY' || (p.duracao_meses || 1) >= 12) : (p.ciclo === 'MONTHLY' || (p.duracao_meses || 1) < 12)
  )

  let codigo = gerarCodigo(comprador.nome)
  const { data: jaTem } = await supabaseAdmin.from('tenants').select('id').eq('codigo', codigo).maybeSingle()
  if (jaTem) codigo = gerarCodigo(comprador.nome + Date.now())

  const { data: tenant, error } = await supabaseAdmin.from('tenants').insert({
    nome_barbearia: comprador.nome ? `Barbearia de ${comprador.nome.split(' ')[0]}` : 'Minha Barbearia',
    evolution_instance: `inst_${codigo.toLowerCase()}`,
    timezone: 'America/Sao_Paulo',
    status_assinatura: 'ativo',
    codigo,
    cpf_cnpj: comprador.cpf || null,
    plano_id: planoRow?.id || null,
    sistema_ativo: true,
    bloqueado_pagamento: false,
    contrato_inicio: new Date().toISOString().slice(0, 10),
    asaas_subscription_id: hotmartCod || null, // guarda o código da assinatura Hotmart p/ cancelamento
  }).select().single()
  if (error || !tenant) { console.error('hotmart criar tenant erro:', error); return }

  if (comprador.telefone) {
    await supabaseAdmin.from('barbeiros').insert({ tenant_id: tenant.id, nome: comprador.nome, telefone: comprador.telefone, ativo: true })
  }

  // boas-vindas + link do passo a passo (configurar a barbearia no site)
  if (comprador.telefone) {
    const setup = `${BASE}/painel/${codigo}`
    const msg = `✅ *Pagamento confirmado! Bem-vindo ao BarberIA* 💈\n\n` +
      `Agora falta só configurar sua barbearia (leva 2 min):\n${setup}\n\n` +
      `🔑 Seu código de acesso: *${codigo}*\n\n` +
      `No link você coloca o nome da barbearia, os serviços, os horários e conecta o WhatsApp. Bora! 💈`
    await enviarTexto(CENTRAL, comprador.telefone, msg).catch(() => {})
  }

  const aviso = `💰 *Nova venda no BarberIA!* (via Hotmart)\n\nComprador: *${comprador.nome}*\n📱 ${comprador.telefone || '—'}\nPlano: ${plano}\nCódigo: *${codigo}*\n\n💈`
  await enviarTexto(CENTRAL, await numeroAlerta(), aviso).catch(() => {})
  await enviarTexto(CENTRAL, FELIPE, aviso).catch(() => {})
}

async function bloquear(body: any) {
  const hotmartCod = codigoHotmart(body)
  const email = extrairComprador(body).email
  let tenant: any = null
  if (hotmartCod) {
    const r = await supabaseAdmin.from('tenants').select('id, nome_barbearia').eq('asaas_subscription_id', hotmartCod).maybeSingle()
    tenant = r.data
  }
  if (!tenant) { console.log('hotmart bloquear: barbearia não encontrada (cod:', hotmartCod, 'email:', email, ')'); return }
  await supabaseAdmin.from('tenants').update({ sistema_ativo: false, bloqueado_pagamento: true }).eq('id', tenant.id)
  const { data: barbeiro } = await supabaseAdmin.from('barbeiros').select('telefone').eq('tenant_id', tenant.id).eq('ativo', true).limit(1).maybeSingle()
  if (barbeiro?.telefone) {
    await enviarTexto(CENTRAL, String(barbeiro.telefone).replace(/\D/g, ''),
      `⚠️ *Sua barbearia foi pausada.* O atendimento por IA está desligado até regularizar o pagamento.\n\n💈 BarberIA`).catch(() => {})
  }
}

export async function GET() {
  return NextResponse.json({ ok: true }) // validação do endereço
}

export async function POST(req: NextRequest) {
  const raw = await req.text()
  const hdrHottok = req.headers.get('x-hotmart-hottok') || ''
  let body: any = {}
  try { body = JSON.parse(raw) } catch {}

  const hottok = hdrHottok || body?.hottok || ''
  const esperado = process.env.HOTMART_HOTTOK || ''
  const hottokOk = !!esperado && hottok === esperado

  const event = String(body?.event || body?.data?.event || '').toUpperCase()
  // loga sempre — assim eu confiro os campos exatos ao ver um webhook real
  console.log('HOTMART webhook | event:', event, '| hottokOk:', hottokOk, '| raw:', raw.slice(0, 2000))

  if (!hottokOk) return NextResponse.json({ received: true })

  try {
    if (/APPROVED|COMPLETE/.test(event)) {
      await criarEAtivar(body)
    } else if (/REFUND|CHARGEBACK|CANCELLATION|CANCELED|CANCELADA/.test(event)) {
      await bloquear(body)
    }
    // power-ups (abandono de carrinho, compra atrasada/expirada, pedido de reembolso):
    // por ora só logados — ligo cada função em etapas.
  } catch (e) {
    console.error('hotmart webhook erro:', e)
  }
  return NextResponse.json({ received: true })
}
