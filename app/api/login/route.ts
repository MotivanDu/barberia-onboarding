import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  try {
    const { identificador } = await req.json()
    if (!identificador) {
      return NextResponse.json({ error: 'Informe o código ou o telefone' }, { status: 400 })
    }

    const bruto = String(identificador).trim()

    // 1) tenta como código da barbearia
    const { data: porCodigo } = await supabaseAdmin
      .from('tenants')
      .select('codigo, nome_barbearia')
      .eq('codigo', bruto.toUpperCase())
      .single()
    if (porCodigo) {
      return NextResponse.json({ codigo: porCodigo.codigo, nome_barbearia: porCodigo.nome_barbearia })
    }

    // 2) tenta como telefone do barbeiro
    const telefone = bruto.replace(/\D/g, '')
    if (telefone.length >= 10) {
      const { data: barbeiro } = await supabaseAdmin
        .from('barbeiros')
        .select('tenant_id, tenants(codigo, nome_barbearia)')
        .eq('telefone', telefone)
        .eq('ativo', true)
        .single()
      const t = (barbeiro as any)?.tenants
      if (t?.codigo) {
        return NextResponse.json({ codigo: t.codigo, nome_barbearia: t.nome_barbearia })
      }
    }

    return NextResponse.json(
      { error: 'Não encontramos sua barbearia. Confira o código ou o telefone cadastrado.' },
      { status: 404 }
    )
  } catch {
    return NextResponse.json({ error: 'Erro ao entrar. Tente novamente.' }, { status: 500 })
  }
}
