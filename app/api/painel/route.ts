import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { estadoInstancia } from '@/lib/evolution'

export async function GET(req: NextRequest) {
  const codigo = req.nextUrl.searchParams.get('codigo')
  if (!codigo) return NextResponse.json({ error: 'codigo obrigatório' }, { status: 400 })

  const { data: tenant } = await supabaseAdmin
    .from('tenants')
    .select('id, nome_barbearia, codigo, evolution_instance, evolution_status, sistema_ativo, endereco')
    .eq('codigo', codigo.toUpperCase())
    .single()
  if (!tenant) return NextResponse.json({ error: 'Barbearia não encontrada' }, { status: 404 })

  const [{ data: servicos }, { data: horarios }, { data: barbeiros }] = await Promise.all([
    supabaseAdmin
      .from('servicos')
      .select('id, nome, preco, duracao_minutos, categoria, ativo')
      .eq('tenant_id', tenant.id)
      .order('criado_em', { ascending: true }),
    supabaseAdmin
      .from('horarios_funcionamento')
      .select('id, dia_semana, hora_inicio, hora_fim')
      .eq('tenant_id', tenant.id)
      .order('dia_semana', { ascending: true }),
    supabaseAdmin
      .from('barbeiros')
      .select('id, nome, telefone')
      .eq('tenant_id', tenant.id)
      .eq('ativo', true),
  ])

  let whatsappState = 'inexistente'
  if (tenant.evolution_instance) {
    const estado = await estadoInstancia(tenant.evolution_instance)
    whatsappState = estado?.data?.instance?.state || 'inexistente'
  }

  return NextResponse.json({
    tenant: {
      nome_barbearia: tenant.nome_barbearia,
      codigo: tenant.codigo,
      sistema_ativo: tenant.sistema_ativo,
      endereco: tenant.endereco,
    },
    whatsapp: { instancia: tenant.evolution_instance, state: whatsappState },
    servicos: servicos || [],
    horarios: horarios || [],
    barbeiros: barbeiros || [],
  })
}
