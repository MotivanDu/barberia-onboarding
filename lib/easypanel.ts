// Controle do Easypanel (VPS) via API por token — usado para REINICIAR o serviço
// da Evolution quando uma instância trava em "zumbi" (aparece open mas não envia,
// e logout/delete/restart da própria Evolution falham com "Connection Closed").
// O restart do serviço recarrega as instâncias limpas do banco. NÃO perde nada:
// barbearias/clientes/histórico ficam no Supabase; as sessões salvas reconectam.
const EASYPANEL_URL = process.env.EASYPANEL_URL || 'https://ecf8b1.easypanel.host'
const EASYPANEL_TOKEN = process.env.EASYPANEL_TOKEN || ''
const EVO_PROJECT = process.env.EASYPANEL_EVOLUTION_PROJECT || 'evolutionapi'
const EVO_SERVICE = process.env.EASYPANEL_EVOLUTION_SERVICE || 'evolution-api'

export function easypanelConfigurado() {
  return !!EASYPANEL_TOKEN
}

// Reinicia SÓ o serviço da Evolution (não toca em n8n nem em outros serviços).
export async function reiniciarEvolution(): Promise<{ ok: boolean; status: number; body: string }> {
  if (!EASYPANEL_TOKEN) return { ok: false, status: 0, body: 'EASYPANEL_TOKEN ausente' }
  try {
    const res = await fetch(`${EASYPANEL_URL}/api/trpc/services.app.restartService`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${EASYPANEL_TOKEN}` },
      body: JSON.stringify({ json: { projectName: EVO_PROJECT, serviceName: EVO_SERVICE } }),
      cache: 'no-store',
    })
    const body = (await res.text()).slice(0, 300)
    return { ok: res.ok, status: res.status, body }
  } catch (e) {
    return { ok: false, status: 0, body: e instanceof Error ? e.message : 'erro' }
  }
}
