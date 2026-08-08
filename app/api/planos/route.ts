import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

// Preços dos planos (públicos) — a página usa pra mostrar o valor E pra montar o
// checkout imediato com o MESMO valor que vai ser cobrado (evita descasar).
export const dynamic = 'force-dynamic'

export async function GET() {
  const { data: planos } = await supabaseAdmin.from('planos').select('*').eq('ativo', true)
  const arr = planos || []
  const anual = arr.find(p => p.ciclo === 'YEARLY' || (p.duracao_meses || 1) >= 12)
  const mensal = arr.find(p => p.ciclo === 'MONTHLY' || (p.duracao_meses || 1) < 12)
  const valor = (p: any) => (p ? parseFloat(p.valor_cobranca ?? p.preco_mensal) || 0 : 0)
  return NextResponse.json({
    mensal: { valor: valor(mensal), nome: mensal?.nome || 'Mensal' },
    anual: { valor: valor(anual), nome: anual?.nome || 'Anual' },
  })
}
