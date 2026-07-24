import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

function chaveMes(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
function rotuloMes(k: string) {
  const [, m] = k.split('-')
  return ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][parseInt(m) - 1] || k
}
function inicioPeriodo(p: string | null): Date | null {
  if (!p) return null
  try {
    const s = p.replace('[', '').replace('(', '').split(',')[0].replace(/"/g, '').trim()
    const d = new Date(s)
    return isNaN(d.getTime()) ? null : d
  } catch {
    return null
  }
}
const DIA_MS = 24 * 60 * 60 * 1000

// ciclo natural do serviço: barba/combo ~15 dias, corte/outros ~30 dias.
// Se o cliente voltou (pela IA) depois de ficar parado além desse ciclo, foi um RESGATE.
function cicloDias(cat: string | null | undefined) {
  return cat === 'barba' || cat === 'combo' ? 15 : 30
}
function catPorNome(nome: string | null): string {
  const n = (nome || '').toLowerCase()
  if (n.includes('combo')) return 'combo'
  if (n.includes('barba')) return 'barba'
  return 'corte'
}

export async function GET(req: NextRequest) {
  const codigo = req.nextUrl.searchParams.get('codigo')
  if (!codigo) return NextResponse.json({ error: 'codigo obrigatório' }, { status: 400 })

  const { data: tenant } = await supabaseAdmin
    .from('tenants')
    .select('id, nome_barbearia, codigo, criado_em')
    .eq('codigo', codigo.toUpperCase())
    .single()
  if (!tenant) return NextResponse.json({ error: 'Barbearia não encontrada' }, { status: 404 })

  const [{ data: agendamentos }, { data: clientes }, { data: conversas }, { data: barbeiros }, { data: servicos }] = await Promise.all([
    supabaseAdmin
      .from('agendamentos')
      .select('status, valor_cobrado, origem, periodo, confirmado_em, servico_nome, servico_id, telefone_cliente')
      .eq('tenant_id', tenant.id),
    supabaseAdmin.from('clientes').select('criado_em, telefone').eq('tenant_id', tenant.id),
    supabaseAdmin.from('conversas_ia').select('telefone, tipo').eq('tenant_id', tenant.id),
    supabaseAdmin.from('barbeiros').select('nome').eq('tenant_id', tenant.id).eq('ativo', true),
    supabaseAdmin.from('servicos').select('id, categoria').eq('tenant_id', tenant.id),
  ])

  const catPorServico: Record<string, string> = {}
  for (const s of servicos || []) catPorServico[s.id] = s.categoria

  const ags = agendamentos || []
  const cs = clientes || []
  const conv = conversas || []
  const agora = Date.now()
  const mesAtual = chaveMes(new Date())
  const seteDias = agora - 7 * DIA_MS
  const trintaDias = agora - 30 * DIA_MS

  // ---- receita / agendamentos ----
  let receitaTotal = 0, receitaMes = 0, receitaSemana = 0, receitaIA = 0
  let concluidos = 0, cancelados = 0, confirmados = 0, futuros = 0
  let agsMes = 0, agsSemana = 0
  const captadosIA = new Set<string>()
  const porCliente: Record<string, { t: number; origem: string; cat: string }[]> = {}
  const rankServ: Record<string, number> = {}
  const receitaPorMes: Record<string, number> = {}
  const clientesPorMes: Record<string, number> = {}

  // séries de 6 meses
  const meses: string[] = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date()
    d.setMonth(d.getMonth() - i)
    meses.push(chaveMes(d))
  }

  for (const a of ags) {
    const ini = inicioPeriodo(a.periodo)
    const km = ini ? chaveMes(ini) : null
    const naoCancelado = a.status !== 'cancelado'

    if (a.origem === 'ia' && naoCancelado && a.telefone_cliente) captadosIA.add(a.telefone_cliente)
    if (naoCancelado && ini && a.telefone_cliente) {
      const cat = (a.servico_id && catPorServico[a.servico_id]) || catPorNome(a.servico_nome)
      ;(porCliente[a.telefone_cliente] ||= []).push({ t: ini.getTime(), origem: a.origem, cat })
    }
    if (a.confirmado_em) confirmados++
    if (a.status === 'cancelado') cancelados++

    if (naoCancelado && ini && ini.getTime() > agora) futuros++
    if (km === mesAtual) agsMes++
    if (ini && ini.getTime() >= seteDias && ini.getTime() <= agora) agsSemana++

    if (a.status === 'concluido') {
      concluidos++
      const v = parseFloat(a.valor_cobrado) || 0
      receitaTotal += v
      if (a.origem === 'ia') receitaIA += v
      if (km) receitaPorMes[km] = (receitaPorMes[km] || 0) + v
      if (km === mesAtual) receitaMes += v
      if (ini && ini.getTime() >= seteDias && ini.getTime() <= agora) receitaSemana += v
      if (a.servico_nome) rankServ[a.servico_nome] = (rankServ[a.servico_nome] || 0) + 1
    }
  }

  // ---- clientes ----
  let novosMes = 0, novosSemana = 0
  for (const c of cs) {
    const t = new Date(c.criado_em).getTime()
    const km = chaveMes(new Date(c.criado_em))
    clientesPorMes[km] = (clientesPorMes[km] || 0) + 1
    if (km === mesAtual) novosMes++
    if (t >= seteDias) novosSemana++
  }

  // pessoas que conversaram com a IA (alcance no WhatsApp)
  const alcanceIA = new Set(conv.filter(c => (c.tipo || 'cliente') === 'cliente').map(c => c.telefone)).size

  // atendimentos por semana (últimas 8 semanas)
  const semanas: { label: string; qtd: number; valor: number }[] = []
  for (let i = 7; i >= 0; i--) {
    const fim = agora - i * 7 * DIA_MS
    const ini = fim - 7 * DIA_MS
    let qtd = 0, valor = 0
    for (const a of ags) {
      if (a.status !== 'concluido') continue
      const p = inicioPeriodo(a.periodo)
      if (!p) continue
      const tt = p.getTime()
      if (tt >= ini && tt < fim) {
        qtd++
        valor += parseFloat(a.valor_cobrado) || 0
      }
    }
    const dLabel = new Date(ini)
    semanas.push({
      label: `${String(dLabel.getDate()).padStart(2, '0')}/${String(dLabel.getMonth() + 1).padStart(2, '0')}`,
      qtd,
      valor: Math.round(valor * 100) / 100,
    })
  }

  // novos captados pela IA (1º agendamento veio pela IA) x resgatados
  // (voltou pela IA depois de ficar parado além do ciclo do serviço: barba 15d, corte 30d)
  let novosIA = 0
  let resgatadosIA = 0
  for (const tel in porCliente) {
    const evs = porCliente[tel].sort((a, b) => a.t - b.t)
    if (evs[0].origem === 'ia') novosIA++
    for (let i = 1; i < evs.length; i++) {
      const gap = evs[i].t - evs[i - 1].t
      if (evs[i].origem === 'ia' && gap >= cicloDias(evs[i].cat) * DIA_MS) {
        resgatadosIA++
        break
      }
    }
  }

  const totalNaoCancelado = ags.filter(a => a.status !== 'cancelado').length
  const ticketMedio = concluidos > 0 ? receitaTotal / concluidos : 0
  const ranking = Object.entries(rankServ).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([nome, qtd]) => ({ nome, qtd }))

  return NextResponse.json({
    barbearia: tenant.nome_barbearia,
    barbeiro: (barbeiros || [])[0]?.nome || null,
    desde: tenant.criado_em,
    kpis: {
      receita_total: Math.round(receitaTotal * 100) / 100,
      receita_mes: Math.round(receitaMes * 100) / 100,
      receita_semana: Math.round(receitaSemana * 100) / 100,
      receita_ia: Math.round(receitaIA * 100) / 100,
      pct_receita_ia: receitaTotal > 0 ? Math.round((100 * receitaIA) / receitaTotal) : 0,
      ticket_medio: Math.round(ticketMedio * 100) / 100,
      clientes_total: cs.length,
      clientes_novos_mes: novosMes,
      clientes_novos_semana: novosSemana,
      captados_ia: captadosIA.size,
      novos_ia: novosIA,
      resgatados_ia: resgatadosIA,
      alcance_ia: alcanceIA,
      agendamentos_total: ags.length,
      agendamentos_mes: agsMes,
      agendamentos_semana: agsSemana,
      agendamentos_futuros: futuros,
      concluidos,
      cancelados,
      taxa_confirmacao: totalNaoCancelado > 0 ? Math.round((100 * confirmados) / totalNaoCancelado) : 0,
    },
    series: {
      receita: meses.map(m => ({ mes: rotuloMes(m), valor: Math.round((receitaPorMes[m] || 0) * 100) / 100 })),
      clientes: meses.map(m => ({ mes: rotuloMes(m), qtd: clientesPorMes[m] || 0 })),
      semanas,
    },
    ranking_servicos: ranking,
  })
}
