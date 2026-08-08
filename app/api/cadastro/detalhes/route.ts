import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

// Salva serviços + horários DEPOIS do pagamento (fluxo "pagar primeiro").
// Identifica a barbearia pelo código (o tenant já existe, criado no /api/cadastro).
// Substitui (apaga + insere) pra não duplicar se o barbeiro voltar e reenviar.
export async function POST(req: NextRequest) {
  try {
    const { codigo, servicos, horarios } = await req.json()
    if (!codigo) return NextResponse.json({ error: 'código faltando' }, { status: 400 })

    const { data: tenant } = await supabaseAdmin
      .from('tenants').select('id').eq('codigo', codigo).single()
    if (!tenant) return NextResponse.json({ error: 'barbearia não encontrada' }, { status: 404 })

    const { data: barbeiro } = await supabaseAdmin
      .from('barbeiros').select('id').eq('tenant_id', tenant.id).eq('ativo', true).limit(1).maybeSingle()

    // SERVIÇOS — substitui
    if (Array.isArray(servicos)) {
      await supabaseAdmin.from('servicos').delete().eq('tenant_id', tenant.id)
      const linhas = servicos
        .filter((s: any) => s && s.nome)
        .map((s: any) => ({
          tenant_id: tenant.id,
          nome: s.nome,
          preco: parseFloat(s.preco) || 0,
          duracao_minutos: parseInt(s.duracao_minutos) || 30,
          categoria: s.categoria || 'corte',
          ativo: true,
        }))
      if (linhas.length) {
        const { error } = await supabaseAdmin.from('servicos').insert(linhas)
        if (error) throw error
      }
    }

    // HORÁRIOS — substitui (precisa do barbeiro_id)
    if (Array.isArray(horarios) && barbeiro) {
      await supabaseAdmin.from('horarios_funcionamento').delete().eq('tenant_id', tenant.id)
      const linhas = horarios
        .filter((h: any) => h && h.hora_inicio && h.hora_fim)
        .map((h: any) => ({
          tenant_id: tenant.id,
          barbeiro_id: barbeiro.id,
          dia_semana: parseInt(h.dia_semana),
          hora_inicio: h.hora_inicio,
          hora_fim: h.hora_fim,
        }))
      if (linhas.length) {
        const { error } = await supabaseAdmin.from('horarios_funcionamento').insert(linhas)
        if (error) throw error
      }
    }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error('cadastro/detalhes erro:', e)
    return NextResponse.json({ error: e?.message || 'erro interno' }, { status: 500 })
  }
}
