import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

import { usuarioAutorizado } from '@/lib/adminAuth'
import {
  asaasConfigurado,
  obterOuCriarCliente,
  criarAssinatura,
  atualizarValorAssinatura,
  cancelarAssinatura,
} from '@/lib/asaas'

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

export async function GET(req: NextRequest) {
  const senha = req.headers.get('x-admin-senha')
  if (!autorizado(senha)) return NextResponse.json({ error: 'Senha inválida' }, { status: 401 })

  const [{ data: tenants }, { data: planos }, { data: clientes }, { data: agendamentos }, { data: mensagens }] =
    await Promise.all([
      supabaseAdmin
        .from('tenants')
        .select('id, codigo, nome_barbearia, status_assinatura, sistema_ativo, evolution_instance, evolution_status, criado_em, plano_id, contrato_inicio, cpf_cnpj, bloqueado_pagamento, asaas_subscription_id')
        .order('criado_em', { ascending: true }),
      supabaseAdmin.from('planos').select('*').order('preco_mensal', { ascending: true }),
      supabaseAdmin
        .from('clientes')
        .select('id, tenant_id, nome, telefone, ultimo_atendimento_em, ultima_conversa_em, criado_em')
        .order('criado_em', { ascending: false })
        .limit(2000),
      supabaseAdmin
        .from('agendamentos')
        .select('tenant_id, status, valor_cobrado, origem, periodo, confirmado_em, criado_em')
        .limit(5000),
      supabaseAdmin.from('mensagens').select('tenant_id, tipo, enviado_em').limit(5000),
    ])

  const ts = tenants || []
  const ps = planos || []
  const cs = clientes || []
  const ags = agendamentos || []
  const msgs = mensagens || []

  const planoPorId: Record<string, any> = {}
  for (const p of ps) planoPorId[p.id] = p

  const agora = new Date()
  const mesAtual = chaveMes(agora)

  // ---------- séries de 12 meses (passado) e 12 meses (futuro) ----------
  const mesesPassados: string[] = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date(agora.getFullYear(), agora.getMonth() - i, 1)
    mesesPassados.push(chaveMes(d))
  }
  const mesesFuturos: string[] = []
  for (let i = 0; i < 12; i++) {
    const d = new Date(agora.getFullYear(), agora.getMonth() + i, 1)
    mesesFuturos.push(chaveMes(d))
  }

  // novas barbearias por mês
  const novasPorMes: Record<string, number> = {}
  for (const t of ts) {
    const k = chaveMes(new Date(t.criado_em))
    novasPorMes[k] = (novasPorMes[k] || 0) + 1
  }

  // GMV e agendamentos por mês (pelo início do período)
  const gmvPorMes: Record<string, number> = {}
  const agsPorMes: Record<string, number> = {}
  let gmvTotal = 0
  let gmvIA = 0
  let agsMesAtual = 0
  let concluidosTotal = 0
  for (const a of ags) {
    const ini = inicioPeriodo(a.periodo)
    if (!ini) continue
    const k = chaveMes(ini)
    agsPorMes[k] = (agsPorMes[k] || 0) + 1
    if (k === mesAtual) agsMesAtual++
    if (a.status === 'concluido') {
      concluidosTotal++
      const v = parseFloat(a.valor_cobrado) || 0
      gmvPorMes[k] = (gmvPorMes[k] || 0) + v
      gmvTotal += v
      if (a.origem === 'ia') gmvIA += v
    }
  }
  const pctIA = gmvTotal > 0 ? Math.round((100 * gmvIA) / gmvTotal) : 0

  // ---------- receita SaaS (MRR / ARR / backlog / previsão) ----------
  let mrr = 0
  let backlog = 0 // receita contratada ainda não faturada
  const previsaoPorMes: Record<string, number> = {}
  for (const m of mesesFuturos) previsaoPorMes[m] = 0

  const tenantsDetalhe = ts.map(t => {
    const plano = t.plano_id ? planoPorId[t.plano_id] : null
    const cancelado = t.status_assinatura === 'cancelado'
    const contratado = !!plano && !cancelado
    let mesesRestantes = 0
    if (contratado) {
      const inicio = t.contrato_inicio ? new Date(t.contrato_inicio + 'T00:00:00') : new Date(t.criado_em)
      const fim = new Date(inicio.getFullYear(), inicio.getMonth() + (plano.duracao_meses || 1), inicio.getDate())
      const msPorMes = 30.44 * 24 * 60 * 60 * 1000
      mesesRestantes = Math.max(0, Math.ceil((fim.getTime() - agora.getTime()) / msPorMes))
      if (mesesRestantes > 0) {
        mrr += parseFloat(plano.preco_mensal) || 0
        backlog += (parseFloat(plano.preco_mensal) || 0) * mesesRestantes
        for (let i = 0; i < Math.min(12, mesesRestantes); i++) {
          previsaoPorMes[mesesFuturos[i]] += parseFloat(plano.preco_mensal) || 0
        }
      }
    }

    const clientesDoTenant = cs.filter(c => c.tenant_id === t.id)
    const agsDoTenant = ags.filter(a => a.tenant_id === t.id)
    const receitaGerada = agsDoTenant
      .filter(a => a.status === 'concluido')
      .reduce((s, a) => s + (parseFloat(a.valor_cobrado) || 0), 0)
    const trintaDias = Date.now() - 30 * 24 * 60 * 60 * 1000
    const ags30d = agsDoTenant.filter(a => {
      const ini = inicioPeriodo(a.periodo)
      return ini && ini.getTime() >= trintaDias
    }).length

    return {
      codigo: t.codigo,
      nome_barbearia: t.nome_barbearia,
      status_assinatura: t.status_assinatura,
      sistema_ativo: t.sistema_ativo,
      evolution_instance: t.evolution_instance,
      evolution_status: t.evolution_status,
      criado_em: t.criado_em,
      plano: plano ? { id: plano.id, nome: plano.nome, preco_mensal: plano.preco_mensal, duracao_meses: plano.duracao_meses } : null,
      contrato_inicio: t.contrato_inicio,
      cpf_cnpj: t.cpf_cnpj,
      bloqueado_pagamento: t.bloqueado_pagamento,
      cobranca_ativa: !!t.asaas_subscription_id,
      meses_restantes: mesesRestantes,
      total_clientes: clientesDoTenant.length,
      agendamentos_30d: ags30d,
      receita_gerada: Math.round(receitaGerada * 100) / 100,
    }
  })

  const ativos = ts.filter(t => t.status_assinatura === 'ativo').length
  const trial = ts.filter(t => t.status_assinatura === 'trial').length
  const cancelados = ts.filter(t => t.status_assinatura === 'cancelado').length
  const churn = ts.length > 0 ? Math.round((100 * cancelados) / ts.length) : 0

  // LTV médio dos contratos vigentes
  const contratos = tenantsDetalhe.filter(t => t.plano && t.meses_restantes > 0)
  const ltvMedio =
    contratos.length > 0
      ? Math.round(
          contratos.reduce((s, t) => s + parseFloat(t.plano!.preco_mensal) * t.plano!.duracao_meses, 0) /
            contratos.length
        )
      : 0

  const resgatesEnviados = msgs.filter(m => m.tipo === 'reativacao').length

  const nomePorTenantId: Record<string, string> = {}
  for (const t of ts) nomePorTenantId[t.id] = t.nome_barbearia

  return NextResponse.json({
    atualizado_em: new Date().toISOString(),
    kpis: {
      barbearias_total: ts.length,
      barbearias_ativas: ativos,
      barbearias_trial: trial,
      barbearias_canceladas: cancelados,
      churn_pct: churn,
      mrr: Math.round(mrr * 100) / 100,
      arr: Math.round(mrr * 12 * 100) / 100,
      backlog_contratado: Math.round(backlog * 100) / 100,
      ltv_medio: ltvMedio,
      clientes_finais: cs.length,
      agendamentos_mes: agsMesAtual,
      agendamentos_concluidos_total: concluidosTotal,
      gmv_total: Math.round(gmvTotal * 100) / 100,
      gmv_ia_pct: pctIA,
      resgates_enviados: resgatesEnviados,
    },
    series: {
      crescimento: mesesPassados.map(m => ({ mes: m, novas: novasPorMes[m] || 0 })),
      gmv: mesesPassados.map(m => ({ mes: m, valor: Math.round((gmvPorMes[m] || 0) * 100) / 100 })),
      agendamentos: mesesPassados.map(m => ({ mes: m, qtd: agsPorMes[m] || 0 })),
      previsao_receita: mesesFuturos.map(m => ({ mes: m, valor: Math.round(previsaoPorMes[m] * 100) / 100 })),
    },
    barbearias: tenantsDetalhe,
    planos: ps,
    clientes: cs.map(c => ({
      nome: c.nome,
      telefone: c.telefone,
      barbearia: nomePorTenantId[c.tenant_id] || '?',
      ultimo_atendimento: c.ultimo_atendimento_em,
      ultima_conversa: c.ultima_conversa_em,
      cadastrado_em: c.criado_em,
    })),
  })
}

export async function POST(req: NextRequest) {
  const senha = req.headers.get('x-admin-senha')
  if (!autorizado(senha)) return NextResponse.json({ error: 'Senha inválida' }, { status: 401 })

  try {
    const body = await req.json()

    if (body.acao === 'definir-plano') {
      const { codigo, plano_id } = body
      const cod = String(codigo).toUpperCase()

      const { data: tenant } = await supabaseAdmin
        .from('tenants')
        .select('id, nome_barbearia, codigo, cpf_cnpj, asaas_customer_id, asaas_subscription_id, barbeiros(nome, telefone)')
        .eq('codigo', cod)
        .single()
      if (!tenant) return NextResponse.json({ error: 'Barbearia não encontrada' }, { status: 404 })

      const patch: Record<string, unknown> = {
        plano_id: plano_id || null,
        contrato_inicio: plano_id ? new Date().toISOString().slice(0, 10) : null,
      }

      // Integração Asaas (quando configurado)
      if (asaasConfigurado()) {
        if (!plano_id) {
          // removeu o plano → cancela assinatura no Asaas
          if (tenant.asaas_subscription_id) {
            const c = await cancelarAssinatura(tenant.asaas_subscription_id)
            if (!c.ok) return NextResponse.json({ error: `Asaas: ${c.erro}` }, { status: 502 })
            patch.asaas_subscription_id = null
          }
        } else {
          const { data: plano } = await supabaseAdmin.from('planos').select('*').eq('id', plano_id).single()
          if (!plano) return NextResponse.json({ error: 'Plano não encontrado' }, { status: 404 })

          if (!tenant.cpf_cnpj) {
            return NextResponse.json(
              { error: 'Cadastre o CPF/CNPJ da barbearia antes de ativar a cobrança (campo na lista de barbearias).' },
              { status: 400 }
            )
          }

          const barbeiro: any = Array.isArray(tenant.barbeiros) ? tenant.barbeiros[0] : tenant.barbeiros
          let customerId = tenant.asaas_customer_id
          if (!customerId) {
            const cli = await obterOuCriarCliente({
              nome: barbeiro?.nome || tenant.nome_barbearia,
              cpfCnpj: tenant.cpf_cnpj,
              telefone: barbeiro?.telefone || null,
              externalReference: tenant.codigo,
            })
            if (!cli.ok) return NextResponse.json({ error: `Asaas: ${cli.erro}` }, { status: 502 })
            customerId = cli.id
            patch.asaas_customer_id = customerId
          }

          // valor efetivamente cobrado (150 mensal, 1200 anual) e método/ciclo do plano
          const valorCobranca = parseFloat(plano.valor_cobranca ?? plano.preco_mensal)
          // Split automático com o sócio (ativado quando ASAAS_SPLIT_WALLET_ID estiver setado)
          const splitWallet = process.env.ASAAS_SPLIT_WALLET_ID
          const splitPct = parseFloat(process.env.ASAAS_SPLIT_PCT || '50')
          const split = splitWallet ? [{ walletId: splitWallet, percentualValue: splitPct }] : undefined

          if (tenant.asaas_subscription_id) {
            const up = await atualizarValorAssinatura(tenant.asaas_subscription_id, valorCobranca)
            if (!up.ok) return NextResponse.json({ error: `Asaas: ${up.erro}` }, { status: 502 })
          } else {
            const ass = await criarAssinatura({
              customerId: customerId!,
              valor: valorCobranca,
              billingType: plano.billing_type || 'UNDEFINED',
              cycle: plano.ciclo || 'MONTHLY',
              split,
              descricao: `BarberIA — plano ${plano.nome} (${tenant.nome_barbearia})`,
              externalReference: tenant.codigo,
            })
            if (!ass.ok) return NextResponse.json({ error: `Asaas: ${ass.erro}` }, { status: 502 })
            patch.asaas_subscription_id = ass.id
          }
        }
      }

      const { error } = await supabaseAdmin.from('tenants').update(patch).eq('codigo', cod)
      if (error) throw error
      return NextResponse.json({ ok: true, asaas: asaasConfigurado() })
    }

    if (body.acao === 'salvar-cpf') {
      const { codigo, cpf_cnpj } = body
      const limpo = String(cpf_cnpj || '').replace(/\D/g, '')
      if (limpo.length !== 11 && limpo.length !== 14) {
        return NextResponse.json({ error: 'CPF (11 dígitos) ou CNPJ (14 dígitos) inválido' }, { status: 400 })
      }
      const { error } = await supabaseAdmin
        .from('tenants')
        .update({ cpf_cnpj: limpo })
        .eq('codigo', String(codigo).toUpperCase())
      if (error) throw error
      return NextResponse.json({ ok: true })
    }

    if (body.acao === 'salvar-plano') {
      const p = body.plano || {}
      const { id, nome, duracao_meses } = p
      // valor_cobranca é o valor real cobrado (150 mensal, 1200 anual); fallback p/ preco_mensal (compat)
      const valorCobranca = parseFloat(p.valor_cobranca ?? p.preco_mensal)
      if (!nome || isNaN(valorCobranca)) {
        return NextResponse.json({ error: 'Nome e valor obrigatórios' }, { status: 400 })
      }
      const meses = parseInt(duracao_meses) || 1
      const valorCheio = p.valor_cheio ? parseFloat(p.valor_cheio) : null
      const dados: Record<string, unknown> = {
        nome: String(nome).trim(),
        valor_cobranca: valorCobranca,
        preco_mensal: Math.round((valorCobranca / meses) * 100) / 100, // MRR-equivalente
        duracao_meses: meses,
        ciclo: meses >= 12 ? 'YEARLY' : 'MONTHLY',
        billing_type: p.billing_type || (meses >= 12 ? 'UNDEFINED' : 'CREDIT_CARD'),
        metodos_pagamento: p.metodos_pagamento || (meses >= 12 ? 'Pix ou Cartao' : 'Cartao de credito'),
        valor_cheio: valorCheio,
        desconto_pct: valorCheio && valorCheio > valorCobranca ? Math.round((1 - valorCobranca / valorCheio) * 100) : null,
        ativo: true,
      }
      if (id) {
        const { error } = await supabaseAdmin.from('planos').update(dados).eq('id', id)
        if (error) throw error

        // Propaga o novo valor para TODAS as assinaturas Asaas deste plano
        if (asaasConfigurado()) {
          const { data: assinantes } = await supabaseAdmin
            .from('tenants')
            .select('codigo, asaas_subscription_id')
            .eq('plano_id', id)
            .not('asaas_subscription_id', 'is', null)
          const falhas: string[] = []
          for (const t of assinantes || []) {
            const up = await atualizarValorAssinatura(t.asaas_subscription_id!, valorCobranca)
            if (!up.ok) falhas.push(`${t.codigo}: ${up.erro}`)
          }
          if (falhas.length > 0) {
            return NextResponse.json({ ok: true, aviso: `Valor salvo, mas falhou no Asaas para: ${falhas.join('; ')}` })
          }
          return NextResponse.json({ ok: true, sincronizados: (assinantes || []).length })
        }
      } else {
        const { error } = await supabaseAdmin.from('planos').insert(dados)
        if (error) throw error
      }
      return NextResponse.json({ ok: true })
    }

    if (body.acao === 'status-assinatura') {
      const { codigo, status } = body
      if (!['trial', 'ativo', 'cancelado'].includes(status)) {
        return NextResponse.json({ error: 'status inválido' }, { status: 400 })
      }
      const { error } = await supabaseAdmin
        .from('tenants')
        .update({ status_assinatura: status })
        .eq('codigo', String(codigo).toUpperCase())
      if (error) throw error
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'ação inválida' }, { status: 400 })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'erro inesperado'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
