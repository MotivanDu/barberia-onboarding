// Integração Stripe (checkout embutido no próprio site via Payment Element).
// Substitui o Asaas. Roda em PARALELO até validar — a virada é só trocar o /cadastro.
import Stripe from 'stripe'

const KEY = process.env.STRIPE_SECRET_KEY || ''

// SDK usa a versão de API fixada nele; não pinamos pra evitar mismatch.
// Placeholder evita throw na instanciação em build sem a env (as chamadas reais
// só rodam em runtime, onde a env existe).
export const stripe = new Stripe(KEY || 'sk_placeholder_build')

export function stripeConfigurado() {
  return KEY.length > 0
}

// Cliente Stripe idempotente pelo código do tenant (metadata.codigo).
export async function obterOuCriarClienteStripe(params: {
  nome: string
  cpfCnpj: string
  telefone?: string | null
  codigo: string
}): Promise<string> {
  try {
    const busca = await stripe.customers.search({
      query: `metadata['codigo']:'${params.codigo}'`,
      limit: 1,
    })
    if (busca.data[0]) return busca.data[0].id
  } catch {
    // search pode não estar habilitado imediatamente em conta nova — segue e cria
  }
  const c = await stripe.customers.create({
    name: params.nome,
    phone: params.telefone || undefined,
    metadata: { codigo: params.codigo, cpf_cnpj: params.cpfCnpj.replace(/\D/g, '') },
  })
  return c.id
}

// MENSAL — assinatura recorrente. Cria "incompleta" e devolve o client_secret do
// 1º pagamento pra confirmar no Payment Element. Ativa a conta quando o webhook
// invoice.paid/payment_intent.succeeded chegar.
export async function criarAssinaturaMensal(params: {
  customerId: string
  codigo: string
}): Promise<{ ok: true; id: string; clientSecret: string } | { ok: false; erro: string }> {
  const priceId = process.env.STRIPE_PRICE_MENSAL || ''
  if (!priceId) return { ok: false, erro: 'STRIPE_PRICE_MENSAL não configurado' }
  try {
    const sub = await stripe.subscriptions.create({
      customer: params.customerId,
      items: [{ price: priceId }],
      payment_behavior: 'default_incomplete',
      payment_settings: { save_default_payment_method: 'on_subscription' },
      expand: ['latest_invoice.payment_intent'],
      metadata: { codigo: params.codigo, plano: 'mensal' },
    })
    const invoice = sub.latest_invoice as unknown as { payment_intent?: { client_secret?: string } }
    const cs = invoice?.payment_intent?.client_secret
    if (!cs) return { ok: false, erro: 'Stripe não retornou o client_secret da assinatura' }
    return { ok: true, id: sub.id, clientSecret: cs }
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : 'erro Stripe' }
  }
}

// ANUAL — cobrança única (permite parcelar no cartão). Devolve o client_secret.
export async function criarPagamentoAnual(params: {
  customerId: string
  codigo: string
  valorCentavos: number
}): Promise<{ ok: true; id: string; clientSecret: string } | { ok: false; erro: string }> {
  try {
    const pi = await stripe.paymentIntents.create({
      customer: params.customerId,
      amount: params.valorCentavos,
      currency: 'brl',
      automatic_payment_methods: { enabled: true },
      metadata: { codigo: params.codigo, plano: 'anual' },
    })
    if (!pi.client_secret) return { ok: false, erro: 'Stripe não retornou o client_secret' }
    return { ok: true, id: pi.id, clientSecret: pi.client_secret }
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : 'erro Stripe' }
  }
}

// Verifica a assinatura do webhook (garante que o evento veio mesmo do Stripe).
export function construirEvento(rawBody: string, assinatura: string): Stripe.Event {
  const segredo = process.env.STRIPE_WEBHOOK_SECRET || ''
  return stripe.webhooks.constructEvent(rawBody, assinatura, segredo)
}
