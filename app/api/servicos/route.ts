import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

async function tenantPorCodigo(codigo: string) {
  const { data } = await supabaseAdmin
    .from('tenants')
    .select('id')
    .eq('codigo', String(codigo).toUpperCase())
    .single()
  return data
}

export async function POST(req: NextRequest) {
  try {
    const { codigo, acao, servico } = await req.json()
    if (!codigo || !acao) return NextResponse.json({ error: 'dados incompletos' }, { status: 400 })

    const tenant = await tenantPorCodigo(codigo)
    if (!tenant) return NextResponse.json({ error: 'Barbearia não encontrada' }, { status: 404 })

    if (acao === 'criar') {
      const { nome, preco, duracao_minutos, categoria } = servico || {}
      if (!nome || preco === undefined) {
        return NextResponse.json({ error: 'Nome e preço são obrigatórios' }, { status: 400 })
      }
      const { data, error } = await supabaseAdmin
        .from('servicos')
        .insert({
          tenant_id: tenant.id,
          nome: String(nome).trim(),
          preco: parseFloat(preco),
          duracao_minutos: parseInt(duracao_minutos) || 30,
          categoria: categoria || 'corte',
          ativo: true,
        })
        .select()
        .single()
      if (error) throw error
      return NextResponse.json({ ok: true, servico: data })
    }

    if (acao === 'atualizar') {
      const { id, nome, preco, duracao_minutos, categoria, ativo } = servico || {}
      if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 })
      const patch: Record<string, unknown> = {}
      if (nome !== undefined) patch.nome = String(nome).trim()
      if (preco !== undefined) patch.preco = parseFloat(preco)
      if (duracao_minutos !== undefined) patch.duracao_minutos = parseInt(duracao_minutos)
      if (categoria !== undefined) patch.categoria = categoria
      if (ativo !== undefined) patch.ativo = !!ativo
      const { error } = await supabaseAdmin
        .from('servicos')
        .update(patch)
        .eq('id', id)
        .eq('tenant_id', tenant.id)
      if (error) throw error
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'ação inválida' }, { status: 400 })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'erro inesperado'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
