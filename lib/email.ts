// Envio de e-mail de alerta via Resend (https://resend.com).
// Precisa da env RESEND_API_KEY. Sem domínio verificado, envia de
// onboarding@resend.dev para o e-mail dono da conta Resend.
export async function enviarEmailAlerta(assunto: string, texto: string) {
  const key = process.env.RESEND_API_KEY
  const para = process.env.ALERT_EMAIL || 'contatoubeda@gmail.com'
  if (!key) return { ok: false as const, motivo: 'RESEND_API_KEY ausente' }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'BarberIA Alertas <onboarding@resend.dev>',
        to: [para],
        subject: assunto,
        text: texto,
      }),
      cache: 'no-store',
    })
    return { ok: res.ok as boolean }
  } catch {
    return { ok: false as const, motivo: 'falha de rede' }
  }
}
