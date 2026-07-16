import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  try {
    const { codigo, horarios } = await req.json()
    if (!codigo || !Array.isArray(horarios)) {
      return NextResponse.json({ error: 'dados incompletos' }, { status: 400 })
    }

    const { data: tenant } = await supabaseAdmin
      .from('tenants')
      .select('id')
      .eq('codigo', String(codigo).toUpperCase())
      .single()
    if (!tenant) return NextResponse.json({ error: 'Barbearia não encontrada' }, { status: 404 })

    const { data: barbeiro } = await supabaseAdmin
      .from('barbeiros')
      .select('id')
      .eq('tenant_id', tenant.id)
      .eq('ativo', true)
      .limit(1)
      .single()
    if (!barbeiro) return NextResponse.json({ error: 'Barbeiro não encontrado' }, { status: 404 })

    // substitui a grade inteira (dias desativados simplesmente não entram)
    const { error: delError } = await supabaseAdmin
      .from('horarios_funcionamento')
      .delete()
      .eq('tenant_id', tenant.id)
    if (delError) throw delError

    const ativos = horarios
      .filter((h: any) => h.ativo && h.hora_inicio && h.hora_fim)
      .map((h: any) => ({
        tenant_id: tenant.id,
        barbeiro_id: barbeiro.id,
        dia_semana: parseInt(h.dia_semana),
        hora_inicio: h.hora_inicio,
        hora_fim: h.hora_fim,
      }))
    if (ativos.length > 0) {
      const { error: insError } = await supabaseAdmin.from('horarios_funcionamento').insert(ativos)
      if (insError) throw insError
    }

    return NextResponse.json({ ok: true, dias_ativos: ativos.length })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'erro inesperado'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
