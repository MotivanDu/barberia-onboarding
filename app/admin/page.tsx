'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts'

type Plano = { id: string; nome: string; preco_mensal: number; duracao_meses: number }
type Barbearia = {
  codigo: string
  nome_barbearia: string
  status_assinatura: string
  sistema_ativo: boolean
  evolution_status: string
  criado_em: string
  plano: Plano | null
  contrato_inicio: string | null
  meses_restantes: number
  total_clientes: number
  agendamentos_30d: number
  receita_gerada: number
  cpf_cnpj: string | null
  bloqueado_pagamento: boolean
  cobranca_ativa: boolean
}
type Cliente = {
  nome: string
  telefone: string
  barbearia: string
  ultimo_atendimento: string | null
  ultima_conversa: string | null
}
type Dash = {
  atualizado_em: string
  kpis: Record<string, number>
  series: {
    crescimento: { mes: string; novas: number }[]
    gmv: { mes: string; valor: number }[]
    agendamentos: { mes: string; qtd: number }[]
    previsao_receita: { mes: string; valor: number }[]
  }
  barbearias: Barbearia[]
  planos: Plano[]
  clientes: Cliente[]
}

const brl = (v: number) =>
  (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

function Card({ titulo, valor, sub, destaque }: { titulo: string; valor: string; sub?: string; destaque?: boolean }) {
  return (
    <div className={`rounded-2xl p-4 ${destaque ? 'bg-amber-600' : 'bg-gray-900'}`}>
      <p className={`text-xs ${destaque ? 'text-amber-100' : 'text-gray-400'}`}>{titulo}</p>
      <p className="text-2xl font-bold mt-1">{valor}</p>
      {sub && <p className={`text-xs mt-1 ${destaque ? 'text-amber-100' : 'text-gray-500'}`}>{sub}</p>}
    </div>
  )
}

function GraficoBox({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="bg-gray-900 rounded-2xl p-4">
      <p className="font-medium mb-3 text-gray-300">{titulo}</p>
      <div className="h-56">{children}</div>
    </div>
  )
}

const tooltipStyle = { backgroundColor: '#111827', border: '1px solid #374151', borderRadius: 12, color: '#fff' }

export default function AdminPage() {
  const [senha, setSenha] = useState('')
  const [logado, setLogado] = useState(false)
  const [erro, setErro] = useState('')
  const [dash, setDash] = useState<Dash | null>(null)
  const [aba, setAba] = useState<'visao' | 'barbearias' | 'clientes' | 'planos' | 'central'>('visao')
  const [busca, setBusca] = useState('')
  const [qr, setQr] = useState<string | null>(null)
  const [gerandoQr, setGerandoQr] = useState(false)
  const [centralState, setCentralState] = useState('')
  const [salvandoPlano, setSalvandoPlano] = useState(false)
  const senhaRef = useRef('')

  const carregar = useCallback(async (s?: string) => {
    const chave = s || senhaRef.current
    const r = await fetch('/api/admin/dashboard', { headers: { 'x-admin-senha': chave } })
    const d = await r.json()
    if (!r.ok) {
      setErro(d.error || 'Erro')
      return false
    }
    setDash(d)
    setErro('')
    return true
  }, [])

  const entrar = async (e: React.FormEvent) => {
    e.preventDefault()
    senhaRef.current = senha
    const ok = await carregar(senha)
    if (ok) {
      setLogado(true)
      const rc = await fetch('/api/admin', { headers: { 'x-admin-senha': senha } })
      const dc = await rc.json()
      if (rc.ok) setCentralState(dc.barberia_state)
    }
  }

  // atualização automática a cada 60s
  useEffect(() => {
    if (!logado) return
    const i = setInterval(() => carregar(), 60000)
    return () => clearInterval(i)
  }, [logado, carregar])

  const acao = async (body: Record<string, unknown>) => {
    setSalvandoPlano(true)
    const r = await fetch('/api/admin/dashboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-senha': senhaRef.current },
      body: JSON.stringify(body),
    })
    setSalvandoPlano(false)
    if (!r.ok) {
      const d = await r.json()
      setErro(d.error || 'Erro na ação')
      return
    }
    carregar()
  }

  const gerarQrCentral = async () => {
    setGerandoQr(true)
    setQr(null)
    const r = await fetch('/api/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-senha': senhaRef.current },
      body: JSON.stringify({ acao: 'qr-barberia' }),
    })
    const d = await r.json()
    setGerandoQr(false)
    if (!r.ok) {
      setErro(d.error || 'Erro ao gerar QR')
      return
    }
    if (d.state === 'open' && !d.qr) {
      setCentralState('open')
      setErro('')
      return
    }
    setQr(d.qr)
  }

  const exportarCSV = () => {
    if (!dash) return
    const linhas = [
      ['Barbearia', 'Codigo', 'Status', 'Plano', 'Valor mensal', 'Meses restantes', 'Clientes', 'Agendamentos 30d', 'Receita gerada'].join(';'),
      ...dash.barbearias.map(b =>
        [
          b.nome_barbearia,
          b.codigo,
          b.status_assinatura,
          b.plano?.nome || '-',
          b.plano?.preco_mensal || 0,
          b.meses_restantes,
          b.total_clientes,
          b.agendamentos_30d,
          b.receita_gerada,
        ].join(';')
      ),
    ]
    const blob = new Blob(['﻿' + linhas.join('\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `barberia-relatorio-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
  }

  if (!logado) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center px-4">
        <form onSubmit={entrar} className="bg-gray-900 rounded-2xl p-6 w-full max-w-sm space-y-4">
          <h1 className="text-2xl font-bold text-center">🔐 Admin BarberIA</h1>
          <input
            type="password"
            value={senha}
            onChange={e => setSenha(e.target.value)}
            placeholder="Senha de administrador"
            className="w-full bg-gray-800 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-amber-500"
            autoFocus
          />
          {erro && <p className="text-red-400 text-sm">{erro}</p>}
          <button type="submit" className="w-full bg-amber-600 hover:bg-amber-500 rounded-xl py-3 font-semibold">
            Entrar
          </button>
        </form>
      </div>
    )
  }

  const k = dash?.kpis || {}
  const clientesFiltrados = (dash?.clientes || []).filter(c => {
    const q = busca.toLowerCase()
    return !q || (c.nome || '').toLowerCase().includes(q) || (c.telefone || '').includes(q) || (c.barbearia || '').toLowerCase().includes(q)
  })

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-6">
          <h1 className="text-2xl font-bold">💈 BarberIA — Painel do Dono</h1>
          <div className="flex items-center gap-3 text-sm text-gray-400">
            <span>
              atualizado {dash ? new Date(dash.atualizado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '...'}
              {' '}· auto a cada 60s
            </span>
            <button onClick={() => carregar()} className="bg-gray-800 hover:bg-gray-700 rounded-lg px-3 py-1">🔄</button>
            <button onClick={exportarCSV} className="bg-gray-800 hover:bg-gray-700 rounded-lg px-3 py-1">📥 CSV</button>
          </div>
        </div>

        {erro && <div className="mb-4 bg-red-900/40 border border-red-700 rounded-xl p-3 text-sm">{erro}</div>}

        <div className="flex gap-2 mb-6 flex-wrap">
          {(
            [
              ['visao', '📊 Visão Geral'],
              ['barbearias', '🏪 Barbearias'],
              ['clientes', '👥 Clientes'],
              ['planos', '💳 Planos'],
              ['central', '📱 Nº Central'],
            ] as const
          ).map(([kk, label]) => (
            <button
              key={kk}
              onClick={() => setAba(kk)}
              className={`rounded-xl px-4 py-2 font-medium ${aba === kk ? 'bg-amber-600' : 'bg-gray-900 hover:bg-gray-800'}`}
            >
              {label}
            </button>
          ))}
        </div>

        {aba === 'visao' && dash && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Card destaque titulo="MRR (receita mensal)" valor={brl(k.mrr)} sub={`ARR ${brl(k.arr)}`} />
              <Card titulo="Receita contratada (backlog)" valor={brl(k.backlog_contratado)} sub="contratos vigentes até o fim" />
              <Card titulo="LTV médio por contrato" valor={brl(k.ltv_medio)} sub={`churn ${k.churn_pct}%`} />
              <Card
                titulo="Barbearias"
                valor={String(k.barbearias_total)}
                sub={`${k.barbearias_ativas} ativas · ${k.barbearias_trial} trial · ${k.barbearias_canceladas} canc.`}
              />
              <Card titulo="Clientes finais na base" valor={String(k.clientes_finais)} />
              <Card titulo="Agendamentos no mês" valor={String(k.agendamentos_mes)} sub={`${k.agendamentos_concluidos_total} concluídos no total`} />
              <Card titulo="GMV movimentado (total)" valor={brl(k.gmv_total)} sub={`🚀 ${k.gmv_ia_pct}% gerado pela IA`} />
              <Card titulo="Resgates enviados" valor={String(k.resgates_enviados)} sub="convites de retorno" />
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <GraficoBox titulo="📈 Previsão de receita — próximos 12 meses (contratos ativos)">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={dash.series.previsao_receita}>
                    <defs>
                      <linearGradient id="gPrev" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#d97706" stopOpacity={0.7} />
                        <stop offset="100%" stopColor="#d97706" stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                    <XAxis dataKey="mes" stroke="#6b7280" fontSize={11} />
                    <YAxis stroke="#6b7280" fontSize={11} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => brl(Number(v))} />
                    <Area type="monotone" dataKey="valor" stroke="#f59e0b" fill="url(#gPrev)" name="Receita" />
                  </AreaChart>
                </ResponsiveContainer>
              </GraficoBox>

              <GraficoBox titulo="🏪 Novas barbearias por mês">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dash.series.crescimento}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                    <XAxis dataKey="mes" stroke="#6b7280" fontSize={11} />
                    <YAxis stroke="#6b7280" fontSize={11} allowDecimals={false} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar dataKey="novas" fill="#f59e0b" radius={[6, 6, 0, 0]} name="Novas" />
                  </BarChart>
                </ResponsiveContainer>
              </GraficoBox>

              <GraficoBox titulo="💵 GMV das barbearias por mês (serviços concluídos)">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dash.series.gmv}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                    <XAxis dataKey="mes" stroke="#6b7280" fontSize={11} />
                    <YAxis stroke="#6b7280" fontSize={11} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => brl(Number(v))} />
                    <Bar dataKey="valor" fill="#10b981" radius={[6, 6, 0, 0]} name="GMV" />
                  </BarChart>
                </ResponsiveContainer>
              </GraficoBox>

              <GraficoBox titulo="📅 Agendamentos por mês">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={dash.series.agendamentos}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                    <XAxis dataKey="mes" stroke="#6b7280" fontSize={11} />
                    <YAxis stroke="#6b7280" fontSize={11} allowDecimals={false} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Line type="monotone" dataKey="qtd" stroke="#60a5fa" strokeWidth={2} dot={false} name="Agendamentos" />
                  </LineChart>
                </ResponsiveContainer>
              </GraficoBox>
            </div>
          </div>
        )}

        {aba === 'barbearias' && dash && (
          <div className="space-y-3">
            {dash.barbearias.map(b => (
              <div key={b.codigo} className="bg-gray-900 rounded-2xl p-4">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <p className="font-semibold">
                      {b.evolution_status === 'conectado' ? '🟢' : b.evolution_status === 'conectando' ? '🟡' : '🔴'}{' '}
                      {b.nome_barbearia}
                      {!b.sistema_ativo && <span className="text-red-400 text-sm ml-2">⏸️</span>}
                      {b.bloqueado_pagamento && <span className="text-red-400 text-sm ml-2">💳 pagamento pendente</span>}
                      {b.cobranca_ativa && !b.bloqueado_pagamento && <span className="text-green-400 text-sm ml-2">💳 cobrança ativa</span>}
                    </p>
                    <p className="text-gray-400 text-sm font-mono">
                      {b.codigo} · desde {new Date(b.criado_em).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                  <div className="flex gap-4 text-sm text-gray-300">
                    <span>👥 {b.total_clientes}</span>
                    <span>📅 {b.agendamentos_30d}/30d</span>
                    <span>💵 {brl(b.receita_gerada)}</span>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-3 flex-wrap text-sm">
                  <select
                    value={b.plano?.id || ''}
                    disabled={salvandoPlano}
                    onChange={e => acao({ acao: 'definir-plano', codigo: b.codigo, plano_id: e.target.value || null })}
                    className="bg-gray-800 rounded-lg px-3 py-2"
                  >
                    <option value="">— sem plano —</option>
                    {dash.planos.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.nome} · {brl(p.preco_mensal)}/mês · {p.duracao_meses}m
                      </option>
                    ))}
                  </select>
                  <select
                    value={b.status_assinatura}
                    disabled={salvandoPlano}
                    onChange={e => acao({ acao: 'status-assinatura', codigo: b.codigo, status: e.target.value })}
                    className="bg-gray-800 rounded-lg px-3 py-2"
                  >
                    <option value="trial">trial</option>
                    <option value="ativo">ativo</option>
                    <option value="cancelado">cancelado</option>
                  </select>
                  <CpfInput
                    valorInicial={b.cpf_cnpj || ''}
                    onSalvar={cpf => acao({ acao: 'salvar-cpf', codigo: b.codigo, cpf_cnpj: cpf })}
                  />
                  {b.plano && b.meses_restantes > 0 && (
                    <span className="text-gray-400">
                      contrato: {b.meses_restantes} meses restantes ({brl(parseFloat(String(b.plano.preco_mensal)) * b.meses_restantes)} a receber)
                    </span>
                  )}
                  <a href={`/painel/${b.codigo}`} className="text-amber-500 hover:underline ml-auto">
                    painel →
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}

        {aba === 'clientes' && dash && (
          <div className="space-y-3">
            <input
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="🔎 Buscar por nome, telefone ou barbearia..."
              className="w-full bg-gray-900 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-amber-500"
            />
            <p className="text-gray-500 text-sm">{clientesFiltrados.length} cliente(s)</p>
            <div className="bg-gray-900 rounded-2xl overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-400 border-b border-gray-800">
                    <th className="p-3">Cliente</th>
                    <th className="p-3">Telefone</th>
                    <th className="p-3">Barbearia</th>
                    <th className="p-3">Último atendimento</th>
                    <th className="p-3">Última conversa</th>
                  </tr>
                </thead>
                <tbody>
                  {clientesFiltrados.slice(0, 200).map((c, i) => (
                    <tr key={i} className="border-b border-gray-800/50">
                      <td className="p-3">{c.nome}</td>
                      <td className="p-3 font-mono text-gray-400">{c.telefone}</td>
                      <td className="p-3">{c.barbearia}</td>
                      <td className="p-3 text-gray-400">
                        {c.ultimo_atendimento ? new Date(c.ultimo_atendimento).toLocaleDateString('pt-BR') : '—'}
                      </td>
                      <td className="p-3 text-gray-400">
                        {c.ultima_conversa ? new Date(c.ultima_conversa).toLocaleDateString('pt-BR') : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {aba === 'planos' && dash && (
          <div className="space-y-3 max-w-2xl">
            <p className="text-gray-400 text-sm">
              Edite os valores — MRR, backlog e previsão recalculam na hora. (Valores rascunho criados pelo Claude; ajuste ao seu preço real.)
            </p>
            {dash.planos.map(p => (
              <PlanoEditor key={p.id} plano={p} onSalvar={pl => acao({ acao: 'salvar-plano', plano: pl })} />
            ))}
            <PlanoEditor plano={null} onSalvar={pl => acao({ acao: 'salvar-plano', plano: pl })} />
          </div>
        )}

        {aba === 'central' && (
          <div className="bg-gray-900 rounded-2xl p-6 max-w-xl space-y-4">
            <p className="font-semibold">📱 Número central do BarberIA (canal do barbeiro)</p>
            <p className="text-gray-400 text-sm">Estado: {centralState === 'open' ? '🟢 conectado' : `🔴 ${centralState || '...'}`}</p>
            <button
              onClick={gerarQrCentral}
              disabled={gerandoQr}
              className="bg-amber-600 hover:bg-amber-500 disabled:opacity-50 rounded-xl px-4 py-3 font-medium w-full"
            >
              {gerandoQr ? 'Gerando...' : '🔄 Reconectar / Novo número'}
            </button>
            {qr && (
              <div className="text-center space-y-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qr} alt="QR BarberIA" className="mx-auto rounded-xl bg-white p-3 w-64 h-64 object-contain" />
                <p className="text-gray-400 text-sm">Escaneie com o número central. Vínculos e dados são preservados.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function CpfInput({ valorInicial, onSalvar }: { valorInicial: string; onSalvar: (cpf: string) => void }) {
  const [cpf, setCpf] = useState(valorInicial)
  const mudou = cpf.replace(/\D/g, '') !== (valorInicial || '').replace(/\D/g, '')
  return (
    <span className="flex items-center gap-1">
      <input
        value={cpf}
        onChange={e => setCpf(e.target.value)}
        placeholder="CPF/CNPJ (p/ cobrança)"
        inputMode="numeric"
        className="bg-gray-800 rounded-lg px-3 py-2 w-48 text-sm"
      />
      {mudou && cpf.replace(/\D/g, '').length >= 11 && (
        <button onClick={() => onSalvar(cpf)} className="bg-gray-700 hover:bg-gray-600 rounded-lg px-2 py-2 text-sm">
          💾
        </button>
      )}
    </span>
  )
}

function PlanoEditor({ plano, onSalvar }: { plano: Plano | null; onSalvar: (p: Record<string, unknown>) => void }) {
  const [nome, setNome] = useState(plano?.nome || '')
  const [preco, setPreco] = useState(plano ? String(plano.preco_mensal) : '')
  const [meses, setMeses] = useState(plano ? String(plano.duracao_meses) : '12')

  return (
    <div className="bg-gray-900 rounded-2xl p-4 flex items-end gap-3 flex-wrap">
      <div className="flex-1 min-w-32">
        <label className="text-xs text-gray-400">Nome</label>
        <input value={nome} onChange={e => setNome(e.target.value)} placeholder={plano ? '' : 'Novo plano...'} className="w-full bg-gray-800 rounded-lg px-3 py-2 mt-1" />
      </div>
      <div className="w-32">
        <label className="text-xs text-gray-400">R$/mês</label>
        <input value={preco} onChange={e => setPreco(e.target.value)} inputMode="decimal" className="w-full bg-gray-800 rounded-lg px-3 py-2 mt-1" />
      </div>
      <div className="w-28">
        <label className="text-xs text-gray-400">Meses</label>
        <input value={meses} onChange={e => setMeses(e.target.value)} inputMode="numeric" className="w-full bg-gray-800 rounded-lg px-3 py-2 mt-1" />
      </div>
      <button
        onClick={() => nome && preco && onSalvar({ id: plano?.id, nome, preco_mensal: preco, duracao_meses: meses })}
        className="bg-amber-600 hover:bg-amber-500 rounded-lg px-4 py-2 font-medium"
      >
        💾 {plano ? 'Salvar' : 'Criar'}
      </button>
    </div>
  )
}
