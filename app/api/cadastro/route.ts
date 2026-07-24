import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import QRCode from 'qrcode'
import { asaasConfigurado, obterOuCriarCliente, criarAssinatura, linkCobrancaPendente } from '@/lib/asaas'

function gerarCodigo(nome: string): string {
  const base = nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8)
  const sufixo = Math.floor(Math.random() * 100).toString().padStart(2, '0')
  return base + sufixo
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { nome_barbearia, nome_barbeiro, telefone_barbeiro, cpf_cnpj, plano, servicos, horarios } = body

    if (!nome_barbearia || !nome_barbeiro || !telefone_barbeiro) {
      return NextResponse.json({ error: 'Campos obrigatórios faltando' }, { status: 400 })
    }

    // Pagamento é obrigatório (sem período de teste) → CPF/CNPJ + Asaas configurado
    const cpfLimpo = String(cpf_cnpj || '').replace(/\D/g, '')
    if (cpfLimpo.length !== 11 && cpfLimpo.length !== 14) {
      return NextResponse.json({ error: 'Informe um CPF (11 dígitos) ou CNPJ (14 dígitos) válido para a cobrança.' }, { status: 400 })
    }
    if (!asaasConfigurado()) {
      return NextResponse.json({ error: 'Pagamento indisponível no momento. Tente novamente mais tarde.' }, { status: 503 })
    }

    // Escolhe o plano (mensal x anual)
    const { data: planos } = await supabaseAdmin.from('planos').select('*').eq('ativo', true)
    const anual = String(plano || 'anual').toLowerCase() === 'anual'
    const planoEscolhido = (planos || []).find(p =>
      anual ? p.ciclo === 'YEARLY' || (p.duracao_meses || 1) >= 12 : p.ciclo === 'MONTHLY' || (p.duracao_meses || 1) < 12
    )
    if (!planoEscolhido) {
      return NextResponse.json({ error: 'Plano indisponível no momento.' }, { status: 503 })
    }

    // Gera código único
    let codigo = gerarCodigo(nome_barbearia)
    const { data: existing } = await supabaseAdmin.from('tenants').select('id').eq('codigo', codigo).single()
    if (existing) codigo = gerarCodigo(nome_barbearia + Date.now())

    const whatsappNumber = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER
    const link = `https://wa.me/${whatsappNumber}?text=${codigo}`

    // QR Code no Supabase Storage (para divulgação após ativação)
    const qrBuffer = await QRCode.toBuffer(link, { type: 'png', width: 400, margin: 2, color: { dark: '#000000', light: '#ffffff' } })
    const qrFileName = `${codigo}.png`
    await supabaseAdmin.storage.from('qrcodes').upload(qrFileName, qrBuffer, { contentType: 'image/png', upsert: true })
    const qrUrl = `https://jslqdyjvrhdbuooixfax.supabase.co/storage/v1/object/public/qrcodes/${qrFileName}`

    // Cria tenant BLOQUEADO (só ativa após o pagamento confirmar)
    const { data: tenant, error: tenantError } = await supabaseAdmin
      .from('tenants')
      .insert({
        nome_barbearia,
        evolution_instance: `inst_${codigo.toLowerCase()}`,
        timezone: 'America/Sao_Paulo',
        status_assinatura: 'trial',
        codigo,
        cpf_cnpj: cpfLimpo,
        plano_id: planoEscolhido.id,
        sistema_ativo: false,
        bloqueado_pagamento: true,
        contrato_inicio: new Date().toISOString().slice(0, 10),
      })
      .select()
      .single()
    if (tenantError) throw tenantError

    // Barbeiro
    const telefoneLimpo = telefone_barbeiro.replace(/\D/g, '')
    const { data: barbeiro, error: barbeiroError } = await supabaseAdmin
      .from('barbeiros')
      .insert({ tenant_id: tenant.id, nome: nome_barbeiro, telefone: telefoneLimpo, ativo: true })
      .select()
      .single()
    if (barbeiroError) throw barbeiroError

    // Serviços
    if (servicos && servicos.length > 0) {
      const servicosData = servicos.map((s: any) => ({
        tenant_id: tenant.id,
        nome: s.nome,
        preco: parseFloat(s.preco),
        duracao_minutos: parseInt(s.duracao_minutos),
        categoria: s.categoria,
        ativo: true,
      }))
      const { error: e } = await supabaseAdmin.from('servicos').insert(servicosData)
      if (e) throw e
    }

    // Horários
    if (horarios && horarios.length > 0) {
      const horariosData = horarios.map((h: any) => ({
        tenant_id: tenant.id,
        barbeiro_id: barbeiro.id,
        dia_semana: parseInt(h.dia_semana),
        hora_inicio: h.hora_inicio,
        hora_fim: h.hora_fim,
      }))
      const { error: e } = await supabaseAdmin.from('horarios_funcionamento').insert(horariosData)
      if (e) throw e
    }

    // ---- Asaas: cliente + assinatura + link de pagamento ----
    const cli = await obterOuCriarCliente({
      nome: nome_barbeiro || nome_barbearia,
      cpfCnpj: cpfLimpo,
      telefone: telefoneLimpo,
      externalReference: codigo,
    })
    if (!cli.ok) {
      return NextResponse.json({ error: `Não foi possível iniciar a cobrança: ${cli.erro}`, codigo }, { status: 502 })
    }

    const valorCobranca = parseFloat(planoEscolhido.valor_cobranca ?? planoEscolhido.preco_mensal)
    const splitWallet = process.env.ASAAS_SPLIT_WALLET_ID
    const splitPct = parseFloat(process.env.ASAAS_SPLIT_PCT || '50')
    const split = splitWallet ? [{ walletId: splitWallet, percentualValue: splitPct }] : undefined

    const ass = await criarAssinatura({
      customerId: cli.id,
      valor: valorCobranca,
      billingType: planoEscolhido.billing_type || (anual ? 'UNDEFINED' : 'CREDIT_CARD'),
      cycle: planoEscolhido.ciclo || (anual ? 'YEARLY' : 'MONTHLY'),
      split,
      descricao: `BarberIA — plano ${planoEscolhido.nome} (${nome_barbearia})`,
      externalReference: codigo,
    })
    if (!ass.ok) {
      return NextResponse.json({ error: `Não foi possível gerar a assinatura: ${ass.erro}`, codigo }, { status: 502 })
    }

    const paymentLink = await linkCobrancaPendente(ass.id)

    await supabaseAdmin
      .from('tenants')
      .update({ asaas_customer_id: cli.id, asaas_subscription_id: ass.id, asaas_payment_link: paymentLink })
      .eq('id', tenant.id)

    // Sem boas-vindas aqui: o acesso é liberado e avisado no WhatsApp só quando o
    // pagamento confirmar (workflow n8n "[BarberIA] - Asaas Pagamentos").

    return NextResponse.json({
      success: true,
      tenant_id: tenant.id,
      codigo,
      link,
      qr_url: qrUrl,
      payment_link: paymentLink,
      plano: {
        nome: planoEscolhido.nome,
        valor: valorCobranca,
        anual,
        metodos: anual ? 'Pix ou cartão' : 'Cartão de crédito',
      },
    })
  } catch (error: any) {
    console.error(error)
    return NextResponse.json({ error: error.message || 'Erro interno' }, { status: 500 })
  }
}
