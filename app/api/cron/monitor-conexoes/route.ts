import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { listarInstancias, enviarTexto } from '@/lib/evolution'

// Número do Du que recebe os alertas de conexão
const DU = '5519992252913'

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret')
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'não autorizado' }, { status: 401 })
  }

  const instancias = await listarInstancias()
  if (instancias.length === 0) return NextResponse.json({ ok: true, aviso: 'sem instâncias', alertas: 0 })

  // estado anterior (pra avisar só quando cai/volta, sem spam)
  const { data: anteriores } = await supabaseAdmin.from('alertas_conexao').select('*')
  const prevPorInst: Record<string, { estado: string; avisado: boolean }> = {}
  for (const a of anteriores || []) prevPorInst[a.instancia] = { estado: a.estado, avisado: a.avisado }

  // nomes amigáveis das barbearias
  const { data: tenants } = await supabaseAdmin.from('tenants').select('evolution_instance, nome_barbearia, codigo')
  const tenantPorInst: Record<string, { nome: string; codigo: string }> = {}
  for (const t of tenants || []) if (t.evolution_instance) tenantPorInst[t.evolution_instance] = { nome: t.nome_barbearia, codigo: t.codigo }

  function amigavel(name: string) {
    if (name === 'BarberIA') return 'O número CENTRAL do BarberIA (canal dos barbeiros)'
    const t = tenantPorInst[name]
    return t ? `O WhatsApp da barbearia *${t.nome}* (${t.codigo})` : `A instância *${name}*`
  }

  const quedas: string[] = []
  const voltas: string[] = []
  const upserts: any[] = []

  for (const inst of instancias) {
    const prev = prevPorInst[inst.name]
    if (inst.state === 'close') {
      const novaQueda = !prev || prev.estado !== 'close' || !prev.avisado
      if (novaQueda) {
        quedas.push(amigavel(inst.name))
        upserts.push({ instancia: inst.name, estado: 'close', avisado: true, atualizado_em: new Date().toISOString() })
      }
    } else if (inst.state === 'open') {
      if (prev && prev.estado === 'close' && prev.avisado) voltas.push(amigavel(inst.name))
      upserts.push({ instancia: inst.name, estado: 'open', avisado: false, atualizado_em: new Date().toISOString() })
    }
    // 'connecting'/'unknown' = transitório, não mexe
  }

  // salva os estados novos
  if (upserts.length > 0) {
    await supabaseAdmin.from('alertas_conexao').upsert(upserts, { onConflict: 'instancia' })
  }

  // envia os alertas por QUALQUER instância conectada (se o central caiu, usa outra)
  let enviados = 0
  if (quedas.length > 0 || voltas.length > 0) {
    const conectadas = instancias.filter(i => i.state === 'open')
    const remetente = conectadas.find(i => i.name === 'BarberIA')?.name || conectadas[0]?.name || null
    if (remetente) {
      for (const q of quedas) {
        const msg = `⚠️ *ALERTA DE CONEXÃO*\n\n📵 ${q} *DESCONECTOU* do WhatsApp!\n\nReconecte o quanto antes para não parar o atendimento.`
        const r = await enviarTexto(remetente, DU, msg)
        if (r.ok) enviados++
      }
      for (const v of voltas) {
        const msg = `✅ *Conexão restabelecida*\n\n${v} voltou a conectar no WhatsApp. Tudo normalizado. 💈`
        const r = await enviarTexto(remetente, DU, msg)
        if (r.ok) enviados++
      }
    } else {
      // nenhuma instância conectada pra enviar o alerta
      return NextResponse.json({ ok: true, aviso: 'TODAS as instâncias caídas — não há por onde alertar', quedas: quedas.length })
    }
  }

  return NextResponse.json({
    ok: true,
    total: instancias.length,
    quedas: quedas.length,
    voltas: voltas.length,
    enviados,
    estados: instancias.map(i => ({ nome: i.name, estado: i.state })),
  })
}
