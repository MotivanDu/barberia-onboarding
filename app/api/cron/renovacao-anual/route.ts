import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { criarCobrancaAvulsa, buscarCobrancaPorRef } from '@/lib/asaas'
import { enviarTexto } from '@/lib/evolution'

const DIA_MS = 24 * 60 * 60 * 1000
const PAGO = ['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH']

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

  const splitWallet = process.env.ASAAS_SPLIT_WALLET_ID
  const splitPct = parseFloat(process.env.ASAAS_SPLIT_PCT || '50')
  const split = splitWallet ? [{ walletId: splitWallet, percentualValue: splitPct }] : undefined

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

      const ref = `RENOV-${t.codigo}-${vencimento.getFullYear()}${String(vencimento.getMonth() + 1).padStart(2, '0')}`
      const cobranca = await buscarCobrancaPorRef(ref)

      // já renovou? estende o contrato por mais 1 ciclo e não cobra de novo
      if (cobranca && PAGO.includes(cobranca.status)) {
        await supabaseAdmin
          .from('tenants')
          .update({ contrato_inicio: venc0.toISOString().slice(0, 10) })
          .eq('id', t.id)
        renovados++
        resultados.push({ codigo: t.codigo, acao: 'renovado (contrato estendido)' })
        continue
      }

      if (!deveEnviar(dias)) continue

      // link de renovação (reusa o pendente ou cria um novo)
      let link = cobranca?.invoiceUrl || null
      if (!link) {
        const cob = await criarCobrancaAvulsa({
          customerId: t.asaas_customer_id!,
          valor: valorAnual,
          split,
          descricao: `BarberIA — renovação anual (${t.nome_barbearia})`,
          externalReference: ref,
        })
        if (!cob.ok) {
          resultados.push({ codigo: t.codigo, erro: `cobrança: ${cob.erro}` })
          continue
        }
        link = cob.invoiceUrl
      }

      const barb = barbPorTenant[t.id]
      if (!barb?.telefone || !link) {
        resultados.push({ codigo: t.codigo, erro: 'sem telefone ou link' })
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
