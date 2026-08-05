import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { criarSessaoRenovacao } from '@/lib/stripe'
import { enviarTexto } from '@/lib/evolution'

const DIA_MS = 24 * 60 * 60 * 1000

function addMeses(d: Date, m: number) {
  const x = new Date(d)
  x.setMonth(x.getMonth() + m)
  return x
}

// Regra de escalonamento pedida pelo Du:
//  - começa 1 mês antes (30 dias)
//  - semanal até a última semana (30, 23, 16, 9 dias)
//  - última semana (0..7 dias): diário
function deveEnviar(dias: number) {
  if (dias < 0) return false
  if (dias <= 7) return true
  if (dias <= 30) return dias % 7 === 2
  return false
}

function montarMensagem(nome: string, barbearia: string, dias: number, dataFmt: string, link: string) {
  const primeiro = (nome || '').split(' ')[0] || ''
  const rodape = `\n\n👉 Renove agora (Pix à vista ou cartão em até 12x):\n${link}\n\nÉ o seu link exclusivo de renovação — assim que pagar, seu BarberIA segue rodando sem parar. 💈`
  if (dias <= 0) {
    return `⚠️ *Seu plano do BarberIA vence HOJE!*\n\n${primeiro ? primeiro + ', a' : 'A'} tenção: o plano anual da *${barbearia}* vence hoje (${dataFmt}). Pra não interromper o atendimento automático, os lembretes e os relatórios, renove agora.${rodape}`
  }
  if (dias <= 7) {
    return `⚠️ *Faltam ${dias} dia(s) pro seu plano vencer!*\n\n${primeiro ? primeiro + ', o' : 'O'} plano anual da *${barbearia}* vence em ${dias} dia(s) (${dataFmt}). Renove pra não parar o atendimento.${rodape}`
  }
  return `📅 *Renovação do seu BarberIA*\n\nOlá${primeiro ? ' ' + primeiro : ''}! O plano anual da *${barbearia}* vence em *${dias} dias* (${dataFmt}). Pra manter tudo funcionando — IA atendendo, lembretes, resgates e relatórios — já deixe sua renovação garantida.${rodape}`
}

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret')
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'não autorizado' }, { status: 401 })
  }

  // plano anual
  const { data: planos } = await supabaseAdmin.from('planos').select('*').eq('ativo', true)
  const anual = (planos || []).find(p => p.ciclo === 'YEARLY' || (p.duracao_meses || 1) >= 12)
  if (!anual) return NextResponse.json({ ok: true, aviso: 'sem plano anual', enviados: 0 })
  const valorAnual = parseFloat(anual.valor_cobranca ?? anual.preco_mensal)

  // barbearias anuais ativas
  const { data: tenants } = await supabaseAdmin
    .from('tenants')
    .select('id, codigo, nome_barbearia, contrato_inicio, asaas_customer_id')
    .eq('plano_id', anual.id)
    .eq('sistema_ativo', true)
  const lista = (tenants || []).filter(t => t.contrato_inicio && t.asaas_customer_id)
  if (lista.length === 0) return NextResponse.json({ ok: true, enviados: 0, total: 0 })

  // barbeiros (telefone) por tenant
  const { data: barbeiros } = await supabaseAdmin
    .from('barbeiros')
    .select('tenant_id, nome, telefone')
    .in('tenant_id', lista.map(t => t.id))
    .eq('ativo', true)
  const barbPorTenant: Record<string, { nome: string; telefone: string }> = {}
  for (const b of barbeiros || []) if (!barbPorTenant[b.tenant_id]) barbPorTenant[b.tenant_id] = { nome: b.nome, telefone: b.telefone }

  const hoje = new Date()
  const hoje0 = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())
  const resultados: any[] = []
  let enviados = 0
  let renovados = 0

  for (const t of lista) {
    try {
      const inicio = new Date(t.contrato_inicio + 'T00:00:00')
      const vencimento = addMeses(inicio, anual.duracao_meses || 12)
      const venc0 = new Date(vencimento.getFullYear(), vencimento.getMonth(), vencimento.getDate())
      const dias = Math.round((venc0.getTime() - hoje0.getTime()) / DIA_MS)

      if (dias > 30) continue // ainda longe do vencimento

      if (!deveEnviar(dias)) continue

      const barb = barbPorTenant[t.id]
      if (!barb?.telefone) {
        resultados.push({ codigo: t.codigo, erro: 'sem telefone' })
        continue
      }

      // link de renovação: Checkout Session hospedada do Stripe (paga → webhook ativa)
      const link = await criarSessaoRenovacao({
        customerId: t.asaas_customer_id!,
        codigo: t.codigo,
        valorCentavos: Math.round(valorAnual * 100),
        nomeBarbearia: t.nome_barbearia,
      })
      if (!link) {
        resultados.push({ codigo: t.codigo, erro: 'falha ao gerar link de renovação' })
        continue
      }

      const dataFmt = venc0.toLocaleDateString('pt-BR')
      const msg = montarMensagem(barb.nome, t.nome_barbearia, dias, dataFmt, link)
      const env = await enviarTexto('BarberIA', barb.telefone, msg)
      if (env.ok) {
        enviados++
        resultados.push({ codigo: t.codigo, dias, acao: 'lembrete enviado' })
      } else {
        resultados.push({ codigo: t.codigo, dias, erro: `whatsapp ${env.status}` })
      }
    } catch (e: any) {
      resultados.push({ codigo: t.codigo, erro: e?.message || 'erro' })
    }
  }

  return NextResponse.json({ ok: true, total: lista.length, enviados, renovados, resultados })
}
