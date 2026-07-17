const EVOLUTION_URL = process.env.EVOLUTION_API_URL || ''
const EVOLUTION_KEY = process.env.EVOLUTION_API_KEY || ''
const N8N_WEBHOOK_URL =
  process.env.N8N_WEBHOOK_URL || 'https://n8n.automacaonocode.online/webhook/barbearia-whatsapp'

async function evo(path: string, init?: RequestInit) {
  const res = await fetch(`${EVOLUTION_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      apikey: EVOLUTION_KEY,
      ...(init?.headers || {}),
    },
    cache: 'no-store',
  })
  const text = await res.text()
  let data: unknown = null
  try {
    data = JSON.parse(text)
  } catch {
    data = text
  }
  return { ok: res.ok, status: res.status, data: data as any }
}

export async function criarInstancia(instanceName: string) {
  return evo('/instance/create', {
    method: 'POST',
    body: JSON.stringify({
      instanceName,
      integration: 'WHATSAPP-BAILEYS',
      qrcode: true,
    }),
  })
}

export async function configurarWebhook(instanceName: string) {
  const eventos = ['MESSAGES_UPSERT', 'CONNECTION_UPDATE']
  // Evolution v2.3 usa o formato aninhado; versões anteriores usam o plano — tenta os dois
  const aninhado = await evo(`/webhook/set/${instanceName}`, {
    method: 'POST',
    body: JSON.stringify({
      webhook: { enabled: true, url: N8N_WEBHOOK_URL, byEvents: false, base64: false, events: eventos },
    }),
  })
  if (aninhado.ok) return aninhado
  return evo(`/webhook/set/${instanceName}`, {
    method: 'POST',
    body: JSON.stringify({ enabled: true, url: N8N_WEBHOOK_URL, events: eventos }),
  })
}

export async function obterQR(instanceName: string) {
  return evo(`/instance/connect/${instanceName}`)
}

export async function estadoInstancia(instanceName: string) {
  return evo(`/instance/connectionState/${instanceName}`)
}

export async function desligarInstancia(instanceName: string) {
  await evo(`/instance/logout/${instanceName}`, { method: 'DELETE' })
  return evo(`/instance/delete/${instanceName}`, { method: 'DELETE' })
}

export async function dadosInstancia(instanceName: string) {
  const r = await evo(`/instance/fetchInstances?instanceName=${encodeURIComponent(instanceName)}`)
  const lista = Array.isArray(r.data) ? r.data : []
  return lista.find((i: any) => i && i.name === instanceName) || null
}
