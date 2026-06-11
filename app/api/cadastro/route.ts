import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

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
    const { nome_barbearia, nome_barbeiro, telefone_barbeiro, servicos, horarios } = body

    if (!nome_barbearia || !nome_barbeiro || !telefone_barbeiro) {
      return NextResponse.json({ error: 'Campos obrigatórios faltando' }, { status: 400 })
    }

    // Gera código único
    let codigo = gerarCodigo(nome_barbearia)
    // Verifica se já existe
    const { data: existing } = await supabaseAdmin
      .from('tenants')
      .select('id')
      .eq('codigo', codigo)
      .single()
    if (existing) {
      codigo = gerarCodigo(nome_barbearia + Date.now())
    }

    // Cria tenant
    const { data: tenant, error: tenantError } = await supabaseAdmin
      .from('tenants')
      .insert({
        nome_barbearia,
        evolution_instance: `inst_${codigo.toLowerCase()}`,
        timezone: 'America/Sao_Paulo',
        status_assinatura: 'trial',
        codigo,
      })
      .select()
      .single()

    if (tenantError) throw tenantError

    // Cria barbeiro
    const telefoneLimpo = telefone_barbeiro.replace(/\D/g, '')
    const { data: barbeiro, error: barbeiroError } = await supabaseAdmin
      .from('barbeiros')
      .insert({
        tenant_id: tenant.id,
        nome: nome_barbeiro,
        telefone: telefoneLimpo,
        ativo: true,
      })
      .select()
      .single()

    if (barbeiroError) throw barbeiroError

    // Cria serviços
    if (servicos && servicos.length > 0) {
      const servicosData = servicos.map((s: any) => ({
        tenant_id: tenant.id,
        nome: s.nome,
        preco: parseFloat(s.preco),
        duracao_minutos: parseInt(s.duracao_minutos),
        categoria: s.categoria,
        ativo: true,
      }))
      const { error: servicosError } = await supabaseAdmin.from('servicos').insert(servicosData)
      if (servicosError) throw servicosError
    }

    // Cria horários de funcionamento
    if (horarios && horarios.length > 0) {
      const horariosData = horarios.map((h: any) => ({
        tenant_id: tenant.id,
        barbeiro_id: barbeiro.id,
        dia_semana: parseInt(h.dia_semana),
        hora_inicio: h.hora_inicio,
        hora_fim: h.hora_fim,
      }))
      const { error: horariosError } = await supabaseAdmin.from('horarios_funcionamento').insert(horariosData)
      if (horariosError) throw horariosError
    }

    const whatsappNumber = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER
    const link = `https://wa.me/${whatsappNumber}?text=${codigo}`

    return NextResponse.json({
      success: true,
      tenant_id: tenant.id,
      barbeiro_id: barbeiro.id,
      codigo,
      link,
    })
  } catch (error: any) {
    console.error(error)
    return NextResponse.json({ error: error.message || 'Erro interno' }, { status: 500 })
  }
}
