import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { stripe, construirEvento } from '@/lib/stripe'
import { enviarTexto } from '@/lib/evolution'

export const dynamic = 'force-dynamic'

const CENTRAL = 'BarberIA'
const FELIPE = '555181209727'
const BASE = process.env.NEXT_PUBLIC_APP_URL || 'https://barberia-onboarding.vercel.app'

// Descobre o código do tenant a partir do cliente do Stripe (metadata.codigo).
async function codigoDoCliente(customerId: string | null): Promise<string | null> {
  if (!customerId) return null
  try {
    const c = await stripe.customers.retrieve(customerId)
    if (c && !('deleted' in c && c.deleted)) {
      return (c as { metadata?: Record<string, string> }).metadata?.codigo || null
    }
  } catch {}
  return null
}

async function numeroAlerta(): Promise<string> {
  const { data } = await supabaseAdmin
    .from('configuracoes').select('valor').eq('chave', 'numero_alerta').maybeSingle()
  return data?.valor || '5519992252913'
}

// Ativa a barbearia (só na transição bloqueado->ativo) + boas-vindas + avisa sócios.
async function ativarPago(codigo: string, valorReais: number) {
  const { data: tenant } = await supabaseAdmin
    .from('tenants')
    .select('id, codigo, nome_barbearia, bloqueado_pagamento')
    .eq('codigo', codigo)
    .single()
  if (!tenant) return
  // idempotência: se já estava ativo, não reprocessa (evita boas-vindas dupla)
  if (tenant.bloqueado_pagamento === false) return

  await supabaseAdmin
    .from('tenants')
    .update({ sistema_ativo: true, bloqueado_pagamento: false, status_assinatura: 'ativo' })
    .eq('id', tenant.id)

  // boas-vindas ao barbeiro (código + link do painel)
  const { data: barbeiro } = await supabaseAdmin
    .from('barbeiros').select('telefone').eq('tenant_id', tenant.id).eq('ativo', true).limit(1).maybeSingle()
  if (barbeiro?.telefone) {
    const msg =
      `✅ *Pagamento confirmado! Bem-vindo ao BarberIA* 💈\n\n` +
      `Sua barbearia *${tenant.nome_barbearia}* está ATIVA!\n\n` +
      `🔑 Código de acesso: *${tenant.codigo}*\n` +
      `📲 Seu painel: ${BASE}/painel/${tenant.codigo}\n\n` +
      `No painel você conecta o WhatsApp da barbearia, cadastra serviços e horários. Bora começar! 💈`
    await enviarTexto(CENTRAL, String(barbeiro.telefone).replace(/\D/g, ''), msg).catch(() => {})
  }

  // avisa os sócios da venda
  const aviso =
    `💰 *Nova venda no BarberIA!*\n\nBarbearia *${tenant.nome_barbearia}* efetuou o pagamento.\n\n` +
    `💵 Valor: R$ ${valorReais}\n\n💈 BarberIA`
  const du = await numeroAlerta()
  await enviarTexto(CENTRAL, du, aviso).catch(() => {})
  await enviarTexto(CENTRAL, FELIPE, aviso).catch(() => {})
}

// Assinatura mensal não paga (cartão falhou) → bloqueia TUDO + manda o link pra
// religar (a fatura hospedada do Stripe onde o barbeiro atualiza o cartão e paga).
async function bloquearFalha(customerId: string | null, hostedUrl: string | null) {
  const codigo = await codigoDoCliente(customerId)
  if (!codigo) return
  const { data: tenant } = await supabaseAdmin
    .from('tenants').select('id, nome_barbearia').eq('codigo', codigo).single()
  if (!tenant) return
  await supabaseAdmin
    .from('tenants')
    .update({ sistema_ativo: false, bloqueado_pagamento: true })
    .eq('id', tenant.id)
  const { data: barbeiro } = await supabaseAdmin
    .from('barbeiros').select('telefone').eq('tenant_id', tenant.id).eq('ativo', true).limit(1).maybeSingle()
  if (barbeiro?.telefone) {
    const msg =
      `⚠️ *Pagamento não aprovado* — sua barbearia *${tenant.nome_barbearia}* foi pausada.\n\n` +
      `Seu atendimento por IA está desligado até regularizar.` +
      (hostedUrl ? `\n\n💳 Pague/atualize o cartão aqui pra religar na hora:\n${hostedUrl}` : '') +
      `\n\n💈 BarberIA`
    await enviarTexto(CENTRAL, String(barbeiro.telefone).replace(/\D/g, ''), msg).catch(() => {})
  }
}

export async function POST(req: NextRequest) {
  const assinatura = req.headers.get('stripe-signature') || ''
  const raw = await req.text()
  let evento
  try {
    evento = construirEvento(raw, assinatura)
  } catch (e) {
    return NextResponse.json({ error: `Assinatura inválida: ${e instanceof Error ? e.message : ''}` }, { status: 400 })
  }

  try {
    if (evento.type === 'payment_intent.succeeded') {
      const pi = evento.data.object as { customer: string | null; amount: number; invoice?: string | null }
      // pagamento de assinatura vem com invoice -> deixa o invoice.paid tratar (evita duplo)
      if (!pi.invoice) {
        const codigo = (evento.data.object as { metadata?: Record<string, string> }).metadata?.codigo
          || (await codigoDoCliente(pi.customer))
        if (codigo) await ativarPago(codigo, pi.amount / 100)
      }
    } else if (evento.type === 'invoice.paid' || evento.type === 'invoice.payment_succeeded') {
      const inv = evento.data.object as { customer: string | null; amount_paid: number }
      const codigo = await codigoDoCliente(inv.customer)
      if (codigo) await ativarPago(codigo, inv.amount_paid / 100)
    } else if (evento.type === 'invoice.payment_failed') {
      const inv = evento.data.object as { customer: string | null; hosted_invoice_url?: string | null }
      await bloquearFalha(inv.customer, inv.hosted_invoice_url || null)
    }
  } catch (e) {
    // não estoura pro Stripe (senão ele reenvia): loga e responde 200
    console.error('stripe webhook erro:', e)
  }

  return NextResponse.json({ received: true })
}
