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
  // SEM ciclo de QR no create: o /instance/connect gera QR e/ou pairing code sob demanda.
  // (Com qrcode:true o socket entra em ciclo de QR e o pairing code vem vazio — testado em 20/07.)
  return evo('/instance/create', {
    method: 'POST',
    body: JSON.stringify({
      instanceName,
      integration: 'WHATSAPP-BAILEYS',
      qrcode: false,
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

export async function obterQR(instanceName: string, numero?: string) {
  const query = numero ? `?number=${encodeURIComponent(numero)}` : ''
  return evo(`/instance/connect/${instanceName}${query}`)
}

export async function estadoInstancia(instanceName: string) {
  return evo(`/instance/connectionState/${instanceName}`)
}

export async function desligarInstancia(instanceName: string) {
  await evo(`/instance/logout/${instanceName}`, { method: 'DELETE' })
  return evo(`/instance/delete/${instanceName}`, { method: 'DELETE' })
}

// Só desloga o WhatsApp (encerra a sessão) SEM apagar a instância — usado para
// destravar uma instância presa em 'open' e conseguir gerar um QR novo.
export async function logoutInstancia(instanceName: string) {
  return evo(`/instance/logout/${instanceName}`, { method: 'DELETE' })
}

// Lista TODAS as instâncias com o estado de conexão (open | connecting | close).
export async function listarInstancias() {
  const r = await evo('/instance/fetchInstances')
  const lista = Array.isArray(r.data) ? r.data : []
  return lista
    .map((i: any) => ({
      name: i?.name || i?.instanceName || i?.instance?.instanceName || '',
      state: i?.connectionStatus || i?.state || i?.connectionState || i?.instance?.state || 'unknown',
    }))
    .filter((i: { name: string }) => i.name)
}

// Envia mensagem de texto pelo WhatsApp (instância central "BarberIA").
export async function enviarTexto(instanceName: string, numero: string, texto: string) {
  return evo(`/message/sendText/${instanceName}`, {
    method: 'POST',
    body: JSON.stringify({ number: numero, text: texto }),
  })
}

// Sonda de VIDA REAL do envio: o /chat/fetchProfile exige o socket do WhatsApp
// realmente vivo. Numa instância "open" zumbi (aparece conectada mas não envia —
// ex.: chip derrubado) isto retorna 500 "Connection Closed". NÃO envia mensagem
// nenhuma (sem spam), então serve de checagem de saúde honesta.
export async function sondarEnvio(instanceName: string, numeroProbe?: string) {
  const num = (numeroProbe || '5519992252913').replace(/\D/g, '')
  const r = await evo(`/chat/fetchProfile/${instanceName}`, {
    method: 'POST',
    body: JSON.stringify({ number: num }),
  })
  const txt = JSON.stringify(r.data ?? '')
  const conexaoMorta = /connection closed/i.test(txt)
  return { vivo: r.ok && !conexaoMorta, status: r.status }
}

export async function dadosInstancia(instanceName: string) {
  const r = await evo(`/instance/fetchInstances?instanceName=${encodeURIComponent(instanceName)}`)
  const lista = Array.isArray(r.data) ? r.data : []
  return lista.find((i: any) => i && i.name === instanceName) || null
}
