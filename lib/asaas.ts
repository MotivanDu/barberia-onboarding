// Integração Asaas (assinaturas do SaaS)
// Docs: https://docs.asaas.com/reference
// ASAAS_BASE_URL: https://api-sandbox.asaas.com/v3 (teste) ou https://api.asaas.com/v3 (produção)

const BASE = process.env.ASAAS_BASE_URL || 'https://api-sandbox.asaas.com/v3'
const KEY = process.env.ASAAS_API_KEY || ''

export function asaasConfigurado() {
  return KEY.length > 0
}

async function asaas(path: string, init?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      access_token: KEY,
      'User-Agent': 'BarberIA',
      ...(init?.headers || {}),
    },
    cache: 'no-store',
  })
  const text = await res.text()
  let data: any = null
  try {
    data = JSON.parse(text)
  } catch {
    data = text
  }
  return { ok: res.ok, status: res.status, data }
}

function erroAsaas(r: { data: any; status: number }): string {
  const desc = r?.data?.errors?.[0]?.description
  return desc || `Asaas retornou ${r.status}`
}

// Busca cliente por referência externa (nosso tenant.codigo) ou cria
export async function obterOuCriarCliente(params: {
  nome: string
  cpfCnpj: string
  telefone?: string | null
  externalReference: string
}) {
  const busca = await asaas(`/customers?externalReference=${encodeURIComponent(params.externalReference)}`)
  const existente = busca?.data?.data?.[0]
  if (existente?.id) return { ok: true as const, id: existente.id as string }

  const criado = await asaas('/customers', {
    method: 'POST',
    body: JSON.stringify({
      name: params.nome,
      cpfCnpj: params.cpfCnpj.replace(/\D/g, ''),
      mobilePhone: params.telefone || undefined,
      externalReference: params.externalReference,
    }),
  })
  if (!criado.ok) return { ok: false as const, erro: erroAsaas(criado) }
  return { ok: true as const, id: criado.data.id as string }
}

// Assinatura recorrente. billingType: CREDIT_CARD (cobra sozinho no cartão),
// UNDEFINED (cliente escolhe Pix/cartão/boleto no link), PIX, BOLETO.
// cycle: MONTHLY | YEARLY. Split opcional (divisão automática entre contas Asaas).
export async function criarAssinatura(params: {
  customerId: string
  valor: number
  descricao: string
  externalReference: string
  billingType?: string
  cycle?: string
  split?: { walletId: string; percentualValue: number }[]
}) {
  const hoje = new Date()
  const vencimento = new Date(hoje.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const body: Record<string, unknown> = {
    customer: params.customerId,
    billingType: params.billingType || 'UNDEFINED',
    value: params.valor,
    nextDueDate: vencimento,
    cycle: params.cycle || 'MONTHLY',
    description: params.descricao,
    externalReference: params.externalReference,
  }
  if (params.split && params.split.length > 0) body.split = params.split
  const r = await asaas('/subscriptions', { method: 'POST', body: JSON.stringify(body) })
  if (!r.ok) return { ok: false as const, erro: erroAsaas(r) }
  return { ok: true as const, id: r.data.id as string }
}

export async function atualizarValorAssinatura(subscriptionId: string, valor: number) {
  const r = await asaas(`/subscriptions/${subscriptionId}`, {
    method: 'PUT',
    body: JSON.stringify({ value: valor, updatePendingPayments: true }),
  })
  if (!r.ok) return { ok: false as const, erro: erroAsaas(r) }
  return { ok: true as const }
}

export async function cancelarAssinatura(subscriptionId: string) {
  const r = await asaas(`/subscriptions/${subscriptionId}`, { method: 'DELETE' })
  if (!r.ok) return { ok: false as const, erro: erroAsaas(r) }
  return { ok: true as const }
}

// Link da cobrança pendente mais recente da assinatura (para reenvio manual)
export async function linkCobrancaPendente(subscriptionId: string) {
  const r = await asaas(`/subscriptions/${subscriptionId}/payments?status=PENDING`)
  const p = r?.data?.data?.[0]
  return p?.invoiceUrl || null
}

// Registra o webhook do Asaas apontando para o n8n (idempotente por nome)
export async function registrarWebhook(url: string, authToken: string) {
  const lista = await asaas('/webhooks')
  const jaExiste = (lista?.data?.data || []).find((w: any) => w.url === url)
  if (jaExiste) return { ok: true as const, id: jaExiste.id }
  const r = await asaas('/webhooks', {
    method: 'POST',
    body: JSON.stringify({
      name: 'BarberIA n8n',
      url,
      email: 'contatoubeda@gmail.com',
      enabled: true,
      interrupted: false,
      apiVersion: 3,
      authToken,
      sendType: 'SEQUENTIALLY',
      events: ['PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED', 'PAYMENT_OVERDUE'],
    }),
  })
  if (!r.ok) return { ok: false as const, erro: erroAsaas(r) }
  return { ok: true as const, id: r.data.id }
}
