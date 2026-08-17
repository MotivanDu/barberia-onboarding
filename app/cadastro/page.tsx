import { redirect } from 'next/navigation'

// A venda agora é 100% na Hotmart (checkout + assinatura + split 50/50 com o Felipe).
// Esta página só existe pra não quebrar links/bookmarks antigos de /cadastro:
// manda direto pro checkout certo da Hotmart conforme o plano.
const HOTMART_MENSAL = 'https://pay.hotmart.com/A107134686T?off=acttv9w0'
const HOTMART_ANUAL = 'https://pay.hotmart.com/A107134686T?off=86tjapw4'

export default async function CadastroRedirect({
  searchParams,
}: {
  searchParams: Promise<{ plano?: string }>
}) {
  const { plano } = await searchParams
  redirect(plano === 'mensal' ? HOTMART_MENSAL : HOTMART_ANUAL)
}
