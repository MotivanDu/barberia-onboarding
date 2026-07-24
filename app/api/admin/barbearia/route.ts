import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { usuarioAutorizado } from '@/lib/adminAuth'
import { estadoInstancia } from '@/lib/evolution'

function autorizado(senha: string | null) {
  return usuarioAutorizado(senha) !== null
}

function chaveMes(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
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

export async function GET(req: NextRequest) {
  const senha = req.headers.get('x-admin-senha')
  if (!autorizado(senha)) return NextResponse.json({ error: 'Senha inválida' }, { status: 401 })

  const codigo = req.nextUrl.searchParams.get('codigo')
  if (!codigo) return NextResponse.json({ error: 'codigo obrigatório' }, { status: 400 })

  const { data: tenant } = await supabaseAdmin
    .from('tenants')
    .select('id, codigo, nome_barbearia, status_assinatura, sistema_ativo, evolution_instance, evolution_status, criado_em, plano_id, contrato_inicio, cpf_cnpj, bloqueado_pagamento, endereco')
    .eq('codigo', codigo.toUpperCase())
    .single()
  if (!tenant) return NextResponse.json({ error: 'Barbearia não encontrada' }, { status: 404 })

  const [{ data: clientes }, { data: agendamentos }, { data: servicos }, { data: horarios }, { data: mensagens }, { data: barbeiros }, plano] =
    await Promise.all([
      supabaseAdmin.from('clientes').select('id, nome, telefone, criado_em, ultima_conversa_em, ultimo_atendimento_em').eq('tenant_id', tenant.id),
      supabaseAdmin.from('agendamentos').select('status, valor_cobrado, origem, periodo, confirmado_em, criado_em, servico_nome, telefone_cliente').eq('tenant_id', tenant.id),
      supabaseAdmin.from('servicos').select('nome, preco, ativo').eq('tenant_id', tenant.id),
      supabaseAdmin.from('horarios_funcionamento').select('dia_semana').eq('tenant_id', tenant.id),
      supabaseAdmin.from('mensagens').select('tipo, enviado_em').eq('tenant_id', tenant.id),
      supabaseAdmin.from('barbeiros').select('nome, telefone').eq('tenant_id', tenant.id).eq('ativo', true),
      tenant.plano_id ? supabaseAdmin.from('planos').select('nome, valor_cobranca, duracao_meses').eq('id', tenant.plano_id).single() : Promise.resolve({ data: null }),
    ])

  const cs = clientes || []
  const ags = agendamentos || []
  const sv = (servicos || []).filter(s => s.ativo)
  const diasConfig = new Set((horarios || []).map(h => h.dia_semana)).size
  const msgs = mensagens || []
  const agora = Date.now()
  const mesAtual = chaveMes(new Date())

  // estado do WhatsApp ao vivo
  let whatsappState = tenant.evolution_status || 'desconhecido'
  if (tenant.evolution_instance) {
    const est = await estadoInstancia(tenant.evolution_instance)
    whatsappState = est?.data?.instance?.state || whatsappState
  }

  // ---- séries de 6 meses ----
  const meses: string[] = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date()
    d.setMonth(d.getMonth() - i)
    meses.push(chaveMes(d))
  }
  const clientesMes: Record<string, number> = {}
  for (const c of cs) {
    const k = chaveMes(new Date(c.criado_em))
    clientesMes[k] = (clientesMes[k] || 0) + 1
  }
  const agsMes: Record<string, number> = {}
  const fatMes: Record<string, number> = {}
  let gmvTotal = 0, gmvIA = 0, concluidos = 0, cancelados = 0, agendadosFuturos = 0, confirmados = 0
  const rankServ: Record<string, number> = {}
  let agsMesAtual = 0
  for (const a of ags) {
    const ini = inicioPeriodo(a.periodo)
    const km = ini ? chaveMes(ini) : null
    if (km) agsMes[km] = (agsMes[km] || 0) + 1
    if (km === mesAtual) agsMesAtual++
    if (a.status === 'cancelado') cancelados++
    else if (a.status === 'concluido') {
      concluidos++
      const v = parseFloat(a.valor_cobrado) || 0
      gmvTotal += v
      if (a.origem === 'ia') gmvIA += v
      if (km) fatMes[km] = (fatMes[km] || 0) + v
      rankServ[a.servico_nome] = (rankServ[a.servico_nome] || 0) + 1
    } else if (a.status === 'agendado') {
      if (ini && ini.getTime() > agora) agendadosFuturos++
    }
    if (a.confirmado_em) confirmados++
  }
  const totalNaoCancelado = ags.filter(a => a.status !== 'cancelado').length
  const pctIA = gmvTotal > 0 ? Math.round((100 * gmvIA) / gmvTotal) : 0
  const agsViaIA = ags.filter(a => a.origem === 'ia' && a.status !== 'cancelado').length
  const pctAgsIA = totalNaoCancelado > 0 ? Math.round((100 * agsViaIA) / totalNaoCancelado) : 0
  const taxaCancelamento = ags.length > 0 ? Math.round((100 * cancelados) / ags.length) : 0
  const taxaConfirmacao = totalNaoCancelado > 0 ? Math.round((100 * confirmados) / totalNaoCancelado) : 0

  // clientes novos 30d e inativos (>30d sem atendimento/conversa)
  const trintaAtras = agora - 30 * DIA_MS
  const clientesNovos30 = cs.filter(c => new Date(c.criado_em).getTime() >= trintaAtras).length
  const inativos = cs.filter(c => {
    const ref = c.ultimo_atendimento_em || c.ultima_conversa_em
    if (!ref) return false
    return new Date(ref).getTime() < trintaAtras
  }).length
  const resgatesEnviados = msgs.filter(m => m.tipo === 'reativacao').length

  // clientes que voltaram (2+ agendamentos)
  const contPorTel: Record<string, number> = {}
  ags.filter(a => a.status !== 'cancelado').forEach(a => { if (a.telefone_cliente) contPorTel[a.telefone_cliente] = (contPorTel[a.telefone_cliente] || 0) + 1 })
  const fidelizados = Object.values(contPorTel).filter(n => n >= 2).length

  const ranking = Object.entries(rankServ).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([nome, qtd]) => ({ nome, qtd }))

  // ---- INSIGHTS / O QUE PODE MELHORAR ----
  const insights: { nivel: 'alerta' | 'atencao' | 'dica' | 'bom'; titulo: string; detalhe: string }[] = []
  if (whatsappState !== 'open') insights.push({ nivel: 'alerta', titulo: 'WhatsApp desconectado', detalhe: 'Os clientes não estão sendo atendidos. Reconecte o WhatsApp da barbearia.' })
  if (tenant.bloqueado_pagamento) insights.push({ nivel: 'alerta', titulo: 'Pagamento pendente', detalhe: 'O sistema está pausado por falta de pagamento.' })
  if (!tenant.plano_id) insights.push({ nivel: 'atencao', titulo: 'Sem plano ativo', detalhe: 'Barbearia sem plano/cobrança. Atribua um plano para começar a faturar.' })
  if (!tenant.cpf_cnpj) insights.push({ nivel: 'atencao', titulo: 'Sem CPF/CNPJ', detalhe: 'Cadastre o CPF/CNPJ para poder ativar a cobrança.' })
  if (sv.length < 2) insights.push({ nivel: 'atencao', titulo: 'Poucos serviços', detalhe: `Só ${sv.length} serviço(s) cadastrado(s). Cadastre mais para a IA oferecer opções.` })
  if (diasConfig < 5) insights.push({ nivel: 'atencao', titulo: 'Horários incompletos', detalhe: `Só ${diasConfig} dia(s) de atendimento configurado(s). Configure a semana toda.` })
  if (taxaCancelamento > 20) insights.push({ nivel: 'atencao', titulo: 'Cancelamentos altos', detalhe: `${taxaCancelamento}% dos agendamentos foram cancelados. Investigar o motivo.` })
  if (inativos >= 5) insights.push({ nivel: 'dica', titulo: 'Clientes para resgatar', detalhe: `${inativos} cliente(s) sem voltar há +30 dias. O resgate automático pode trazê-los de volta.` })
  if (pctAgsIA < 40 && ags.length >= 5) insights.push({ nivel: 'dica', titulo: 'IA pouco usada', detalhe: `Só ${pctAgsIA}% dos agendamentos vieram pela IA. Divulgue o link do WhatsApp aos clientes.` })
  if (agsMesAtual === 0) insights.push({ nivel: 'dica', titulo: 'Nenhum agendamento no mês', detalhe: 'Ative divulgação e resgate para movimentar a agenda.' })
  if (cs.length === 0) insights.push({ nivel: 'dica', titulo: 'Base de clientes vazia', detalhe: 'Conecte o WhatsApp para importar os contatos e começar o resgate.' })
  if (insights.length === 0 || (whatsappState === 'open' && tenant.plano_id && pctAgsIA >= 40)) {
    insights.unshift({ nivel: 'bom', titulo: 'Barbearia saudável', detalhe: 'Conectada, com plano ativo e boa adesão à IA. Continue divulgando o link!' })
  }

  return NextResponse.json({
    tenant: {
      nome_barbearia: tenant.nome_barbearia,
      codigo: tenant.codigo,
      status_assinatura: tenant.status_assinatura,
      sistema_ativo: tenant.sistema_ativo,
      bloqueado_pagamento: tenant.bloqueado_pagamento,
      criado_em: tenant.criado_em,
      whatsapp_state: whatsappState,
      plano: plano.data,
      barbeiro: (barbeiros || [])[0] || null,
      cpf_cnpj: tenant.cpf_cnpj,
    },
    kpis: {
      clientes_total: cs.length,
      clientes_novos_30d: clientesNovos30,
      clientes_inativos: inativos,
      clientes_fidelizados: fidelizados,
      agendamentos_total: ags.length,
      agendamentos_mes: agsMesAtual,
      agendamentos_futuros: agendadosFuturos,
      concluidos,
      cancelados,
      taxa_cancelamento: taxaCancelamento,
      taxa_confirmacao: taxaConfirmacao,
      gmv_total: Math.round(gmvTotal * 100) / 100,
      gmv_ia: Math.round(gmvIA * 100) / 100,
      pct_gmv_ia: pctIA,
      pct_ags_ia: pctAgsIA,
      resgates_enviados: resgatesEnviados,
      servicos_ativos: sv.length,
      dias_configurados: diasConfig,
    },
    series: {
      clientes: meses.map(m => ({ mes: m, qtd: clientesMes[m] || 0 })),
      agendamentos: meses.map(m => ({ mes: m, qtd: agsMes[m] || 0 })),
      faturamento: meses.map(m => ({ mes: m, valor: Math.round((fatMes[m] || 0) * 100) / 100 })),
    },
    ranking_servicos: ranking,
    insights,
  })
}
