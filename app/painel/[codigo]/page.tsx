'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts'

const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
const CATEGORIAS = [
  { label: 'Corte', value: 'corte' },
  { label: 'Barba', value: 'barba' },
  { label: 'Combo', value: 'combo' },
  { label: 'Outros', value: 'outros' },
]

type Servico = { id?: string; nome: string; preco: number | string; duracao_minutos: number | string; categoria: string; ativo: boolean }
type Horario = { dia_semana: number; hora_inicio: string; hora_fim: string; ativo: boolean }
type DashData = {
  barbearia: string
  barbeiro: string | null
  desde: string
  kpis: Record<string, number>
  series: {
    receita: { mes: string; valor: number }[]
    clientes: { mes: string; qtd: number }[]
    semanas: { label: string; qtd: number; valor: number }[]
  }
  ranking_servicos: { nome: string; qtd: number }[]
}

const brl = (v: number) =>
  (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const tooltipStyle = { backgroundColor: '#111827', border: '1px solid #374151', borderRadius: 12, color: '#fff' }

function Kpi({ titulo, valor, sub, cor, destaque }: { titulo: string; valor: string; sub?: string; cor?: string; destaque?: boolean }) {
  return (
    <div className={`rounded-2xl p-4 ${destaque ? 'bg-amber-600' : 'bg-gray-900'}`}>
      <p className={`text-xs leading-tight ${destaque ? 'text-amber-100' : 'text-gray-400'}`}>{titulo}</p>
      <p className={`text-2xl font-bold mt-1 ${cor || ''}`}>{valor}</p>
      {sub && <p className={`text-[11px] mt-0.5 ${destaque ? 'text-amber-100' : 'text-gray-500'}`}>{sub}</p>}
    </div>
  )
}

function ChartBox({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="bg-gray-900 rounded-2xl p-4">
      <p className="font-medium mb-3 text-gray-300 text-sm">{titulo}</p>
      <div className="h-52">{children}</div>
    </div>
  )
}

export default function PainelPage() {
  const params = useParams<{ codigo: string }>()
  const codigo = (params?.codigo || '').toString().toUpperCase()

  const [aba, setAba] = useState<'relatorio' | 'servicos' | 'horarios' | 'whatsapp'>('relatorio')
  const [nome, setNome] = useState('')
  const [sistemaAtivo, setSistemaAtivo] = useState(true)
  const [whats, setWhats] = useState<{ instancia: string | null; state: string; numero?: string | null }>({ instancia: null, state: '...' })
  const [servicos, setServicos] = useState<Servico[]>([])
  const [horarios, setHorarios] = useState<Horario[]>([])
  const [msg, setMsg] = useState('')
  const [carregando, setCarregando] = useState(true)
  const [qr, setQr] = useState<string | null>(null)
  const [gerandoQr, setGerandoQr] = useState(false)
  const [pairing, setPairing] = useState<string | null>(null)
  const [modoCodigo, setModoCodigo] = useState(false)
  const [numeroPareamento, setNumeroPareamento] = useState('')
  const [clientesTotal, setClientesTotal] = useState(0)
  const [dash, setDash] = useState<DashData | null>(null)

  const carregar = useCallback(async () => {
    setCarregando(true)
    // dashboard carrega em paralelo, sem travar o painel
    fetch(`/api/painel/dashboard?codigo=${codigo}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => d && setDash(d))
      .catch(() => {})
    try {
      const r = await fetch(`/api/painel?codigo=${codigo}`)
      const d = await r.json()
      if (!r.ok) {
        setMsg(d.error || 'Erro ao carregar')
        setCarregando(false)
        return
      }
      setNome(d.tenant.nome_barbearia)
      setSistemaAtivo(d.tenant.sistema_ativo)
      setWhats(d.whatsapp)
      setClientesTotal(d.clientes_total || 0)
      setServicos(d.servicos)
      const grade: Horario[] = DIAS.map((_, dia) => {
        const h = (d.horarios || []).find((x: any) => x.dia_semana === dia)
        return h
          ? { dia_semana: dia, hora_inicio: h.hora_inicio.slice(0, 5), hora_fim: h.hora_fim.slice(0, 5), ativo: true }
          : { dia_semana: dia, hora_inicio: '08:00', hora_fim: '18:00', ativo: false }
      })
      setHorarios(grade)
      setMsg('')
    } catch {
      setMsg('Falha de conexão')
    }
    setCarregando(false)
  }, [codigo])

  useEffect(() => {
    if (codigo) carregar()
  }, [codigo, carregar])

  const flash = (t: string) => {
    setMsg(t)
    setTimeout(() => setMsg(''), 3500)
  }

  const salvarServico = async (s: Servico) => {
    const r = await fetch('/api/servicos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigo, acao: s.id ? 'atualizar' : 'criar', servico: s }),
    })
    const d = await r.json()
    if (!r.ok) return flash('❌ ' + (d.error || 'Erro ao salvar'))
    flash('✅ Salvo! Já valendo no atendimento da IA.')
    carregar()
  }

  const alternarServico = async (s: Servico) => {
    await fetch('/api/servicos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigo, acao: 'atualizar', servico: { id: s.id, ativo: !s.ativo } }),
    })
    carregar()
  }

  const salvarHorarios = async () => {
    const r = await fetch('/api/horarios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigo, horarios }),
    })
    const d = await r.json()
    if (!r.ok) return flash('❌ ' + (d.error || 'Erro ao salvar'))
    flash('✅ Horários atualizados!')
  }

  const updServico = (i: number, campo: keyof Servico, valor: string) => {
    const novo = [...servicos]
    ;(novo[i] as any)[campo] = valor
    setServicos(novo)
  }

  const updHorario = (dia: number, campo: keyof Horario, valor: string | boolean) => {
    setHorarios(hs => hs.map(h => (h.dia_semana === dia ? { ...h, [campo]: valor } : h)))
  }

  const conectarWhats = async (acao: 'conectar' | 'novo-numero', numero?: string) => {
    if (acao === 'novo-numero') {
      const ok = window.confirm(
        'Mudei de número:\n\nIsso desconecta o WhatsApp atual e gera um novo QR Code para o número novo.\n\nSeus clientes, agendamentos e histórico continuam TODOS salvos.\n\nContinuar?'
      )
      if (!ok) return
    }
    setGerandoQr(true)
    setQr(null)
    setPairing(null)
    try {
      const r = await fetch('/api/qrcode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codigo, acao, numero }),
      })
      const d = await r.json()
      setGerandoQr(false)
      if (!r.ok) return flash('❌ ' + (d.error || 'Erro ao gerar QR'))
      if (d.state === 'open' && !d.qr && !d.pairing) {
        flash('✅ WhatsApp já está conectado!')
        carregar()
        return
      }
      setQr(numero ? null : d.qr)
      setPairing(d.pairing || null)
      // poll até conectar
      const intervalo = setInterval(async () => {
        try {
          const rs = await fetch(`/api/qrcode?codigo=${codigo}`)
          const ds = await rs.json()
          if (ds.state === 'open') {
            clearInterval(intervalo)
            setQr(null)
            setPairing(null)
            setModoCodigo(false)
            flash('✅ WhatsApp conectado com sucesso!')
            carregar()
          }
        } catch {}
      }, 3000)
      setTimeout(() => clearInterval(intervalo), 120000)
    } catch {
      setGerandoQr(false)
      flash('❌ Falha de conexão')
    }
  }

  const stateLabel: Record<string, string> = {
    open: '🟢 Conectado',
    connecting: '🟡 Conectando...',
    close: '🔴 Desconectado',
    inexistente: '⚪ Ainda não conectado',
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold">💈 {nome || 'BarberIA'}</h1>
          <p className="text-gray-400 text-sm">
            Código: <span className="font-mono text-amber-500">{codigo}</span>
            {!sistemaAtivo && <span className="ml-2 text-red-400">⏸️ sistema desativado</span>}
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-6">
          {(
            [
              ['relatorio', '📊 Painel'],
              ['servicos', '✂️ Serviços'],
              ['horarios', '🗓️ Horários'],
              ['whatsapp', '📱 WhatsApp'],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setAba(k)}
              className={`rounded-xl py-3 text-sm font-medium ${aba === k ? 'bg-amber-600' : 'bg-gray-900 hover:bg-gray-800'}`}
            >
              {label}
            </button>
          ))}
        </div>

        {msg && <div className="mb-4 bg-gray-900 rounded-xl p-3 text-center text-sm">{msg}</div>}
        {carregando && aba !== 'relatorio' && <p className="text-center text-gray-400 py-10">Carregando...</p>}

        {aba === 'relatorio' && (
          !dash ? (
            <p className="text-center text-gray-400 py-10">Carregando relatório...</p>
          ) : (
            <div className="space-y-5">
              <div className="text-center -mt-2 mb-1">
                <p className="text-gray-400 text-sm">
                  {dash.barbeiro ? `Olá, ${dash.barbeiro.split(' ')[0]}! ` : ''}
                  Aqui está o resultado da sua barbearia com o BarberIA.
                </p>
              </div>

              {/* RECEITA */}
              <div>
                <p className="font-semibold mb-2 text-gray-300 text-sm">💰 Receita gerada</p>
                <div className="grid grid-cols-3 gap-2">
                  <Kpi destaque titulo="Total" valor={brl(dash.kpis.receita_total)} sub={`ticket médio ${brl(dash.kpis.ticket_medio)}`} />
                  <Kpi titulo="Este mês" valor={brl(dash.kpis.receita_mes)} />
                  <Kpi titulo="Últimos 7 dias" valor={brl(dash.kpis.receita_semana)} />
                </div>
              </div>

              {/* IMPACTO DO BARBERIA */}
              <div>
                <p className="font-semibold mb-2 text-gray-300 text-sm">🤖 O BarberIA trabalhando por você</p>
                <div className="grid grid-cols-3 gap-2">
                  <Kpi titulo="Clientes que a IA trouxe" valor={String(dash.kpis.captados_ia)} cor="text-amber-400" sub="captados pelo WhatsApp" />
                  <Kpi titulo="Pessoas atendidas no WhatsApp" valor={String(dash.kpis.alcance_ia)} sub="conversaram com a IA" />
                  <Kpi titulo="Valor gerado pela IA" valor={brl(dash.kpis.receita_ia)} cor="text-amber-400" sub={`${dash.kpis.pct_receita_ia}% da receita`} />
                </div>
              </div>

              {/* CLIENTES */}
              <div>
                <p className="font-semibold mb-2 text-gray-300 text-sm">👥 Clientes</p>
                <div className="grid grid-cols-3 gap-2">
                  <Kpi titulo="Na base" valor={String(dash.kpis.clientes_total)} />
                  <Kpi titulo="Novos no mês" valor={`+${dash.kpis.clientes_novos_mes}`} cor="text-green-400" />
                  <Kpi titulo="Novos na semana" valor={`+${dash.kpis.clientes_novos_semana}`} cor="text-green-400" />
                </div>
              </div>

              {/* AGENDAMENTOS */}
              <div>
                <p className="font-semibold mb-2 text-gray-300 text-sm">📅 Agendamentos</p>
                <div className="grid grid-cols-3 gap-2">
                  <Kpi titulo="Este mês" valor={String(dash.kpis.agendamentos_mes)} />
                  <Kpi titulo="Esta semana" valor={String(dash.kpis.agendamentos_semana)} />
                  <Kpi titulo="Próximos (futuros)" valor={String(dash.kpis.agendamentos_futuros)} cor="text-blue-400" />
                  <Kpi titulo="Concluídos" valor={String(dash.kpis.concluidos)} cor="text-green-400" />
                  <Kpi titulo="Confirmação" valor={`${dash.kpis.taxa_confirmacao}%`} />
                  <Kpi titulo="Total histórico" valor={String(dash.kpis.agendamentos_total)} />
                </div>
              </div>

              {/* GRÁFICOS */}
              <ChartBox titulo="💵 Receita por mês">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dash.series.receita}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                    <XAxis dataKey="mes" stroke="#6b7280" fontSize={11} />
                    <YAxis stroke="#6b7280" fontSize={11} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => brl(Number(v))} />
                    <Bar dataKey="valor" fill="#10b981" radius={[6, 6, 0, 0]} name="Receita" />
                  </BarChart>
                </ResponsiveContainer>
              </ChartBox>

              <ChartBox titulo="📈 Novos clientes por mês">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dash.series.clientes}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                    <XAxis dataKey="mes" stroke="#6b7280" fontSize={11} />
                    <YAxis stroke="#6b7280" fontSize={11} allowDecimals={false} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar dataKey="qtd" fill="#f59e0b" radius={[6, 6, 0, 0]} name="Clientes" />
                  </BarChart>
                </ResponsiveContainer>
              </ChartBox>

              <ChartBox titulo="🗓️ Atendimentos por semana (últimas 8)">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={dash.series.semanas}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                    <XAxis dataKey="label" stroke="#6b7280" fontSize={11} />
                    <YAxis stroke="#6b7280" fontSize={11} allowDecimals={false} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Line type="monotone" dataKey="qtd" stroke="#60a5fa" strokeWidth={2} dot={{ r: 3 }} name="Atendimentos" />
                  </LineChart>
                </ResponsiveContainer>
              </ChartBox>

              <div className="bg-gray-900 rounded-2xl p-4">
                <p className="font-medium mb-3 text-gray-300 text-sm">🏆 Serviços mais pedidos</p>
                {dash.ranking_servicos.length === 0 ? (
                  <p className="text-gray-500 text-sm">Ainda não há serviços concluídos.</p>
                ) : (
                  <div className="space-y-2">
                    {dash.ranking_servicos.map((s, i) => {
                      const max = dash.ranking_servicos[0].qtd || 1
                      return (
                        <div key={i}>
                          <div className="flex justify-between text-sm mb-1">
                            <span className="text-gray-300">{i + 1}. {s.nome}</span>
                            <span className="text-gray-400">{s.qtd}x</span>
                          </div>
                          <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                            <div className="h-full bg-amber-500 rounded-full" style={{ width: `${Math.round((100 * s.qtd) / max)}%` }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              <p className="text-gray-500 text-xs text-center">
                Atualiza automaticamente conforme os atendimentos acontecem.
              </p>
            </div>
          )
        )}

        {!carregando && aba === 'servicos' && (
          <div className="space-y-4">
            {servicos.map((s, i) => (
              <div key={s.id || i} className={`bg-gray-900 rounded-2xl p-4 space-y-3 ${!s.ativo ? 'opacity-50' : ''}`}>
                <div className="grid grid-cols-2 gap-3">
                  <input
                    value={s.nome}
                    onChange={e => updServico(i, 'nome', e.target.value)}
                    className="bg-gray-800 rounded-lg px-3 py-2 col-span-2"
                    placeholder="Nome do serviço"
                  />
                  <input
                    value={String(s.preco)}
                    onChange={e => updServico(i, 'preco', e.target.value)}
                    className="bg-gray-800 rounded-lg px-3 py-2"
                    placeholder="Preço (R$)"
                    inputMode="decimal"
                  />
                  <input
                    value={String(s.duracao_minutos)}
                    onChange={e => updServico(i, 'duracao_minutos', e.target.value)}
                    className="bg-gray-800 rounded-lg px-3 py-2"
                    placeholder="Duração (min)"
                    inputMode="numeric"
                  />
                  <select
                    value={s.categoria}
                    onChange={e => updServico(i, 'categoria', e.target.value)}
                    className="bg-gray-800 rounded-lg px-3 py-2 col-span-2"
                  >
                    {CATEGORIAS.map(c => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => salvarServico(s)} className="flex-1 bg-amber-600 hover:bg-amber-500 rounded-lg py-2 font-medium">
                    💾 Salvar
                  </button>
                  <button onClick={() => alternarServico(s)} className="flex-1 bg-gray-800 hover:bg-gray-700 rounded-lg py-2">
                    {s.ativo ? '🚫 Desativar' : '✅ Reativar'}
                  </button>
                </div>
              </div>
            ))}
            <button
              onClick={() => setServicos([...servicos, { nome: '', preco: '', duracao_minutos: '30', categoria: 'corte', ativo: true }])}
              className="w-full bg-gray-900 hover:bg-gray-800 border border-dashed border-gray-700 rounded-2xl py-4"
            >
              ➕ Novo serviço ou promoção
            </button>
            <p className="text-gray-500 text-xs text-center">
              Alterações valem NA HORA para o atendimento da IA no WhatsApp.
            </p>
          </div>
        )}

        {!carregando && aba === 'horarios' && (
          <div className="bg-gray-900 rounded-2xl p-4 space-y-3">
            {horarios.map(h => (
              <div key={h.dia_semana} className="flex items-center gap-3">
                <label className="flex items-center gap-2 w-28">
                  <input
                    type="checkbox"
                    checked={h.ativo}
                    onChange={e => updHorario(h.dia_semana, 'ativo', e.target.checked)}
                  />
                  <span className={h.ativo ? '' : 'text-gray-500'}>{DIAS[h.dia_semana]}</span>
                </label>
                <input
                  type="time"
                  value={h.hora_inicio}
                  disabled={!h.ativo}
                  onChange={e => updHorario(h.dia_semana, 'hora_inicio', e.target.value)}
                  className="bg-gray-800 rounded-lg px-2 py-1 disabled:opacity-40"
                />
                <span className="text-gray-500">às</span>
                <input
                  type="time"
                  value={h.hora_fim}
                  disabled={!h.ativo}
                  onChange={e => updHorario(h.dia_semana, 'hora_fim', e.target.value)}
                  className="bg-gray-800 rounded-lg px-2 py-1 disabled:opacity-40"
                />
              </div>
            ))}
            <button onClick={salvarHorarios} className="w-full bg-amber-600 hover:bg-amber-500 rounded-xl py-3 font-semibold mt-2">
              💾 Salvar horários
            </button>
          </div>
        )}

        {!carregando && aba === 'whatsapp' && (
          <div className="bg-gray-900 rounded-2xl p-6 text-center space-y-4">
            <p className="text-lg">{stateLabel[whats.state] || whats.state}</p>
            <p className="text-gray-400 text-sm">
              Este é o WhatsApp que os SEUS CLIENTES usam para falar com a barbearia.
            </p>
            {whats.state === 'open' && whats.numero && (
              <div className="bg-gray-800 rounded-xl p-4 space-y-2">
                <p className="text-gray-300 text-sm font-medium">📣 Link para divulgar aos clientes:</p>
                <p className="font-mono text-amber-400 break-all">https://wa.me/{whats.numero}</p>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(`https://wa.me/${whats.numero}`)
                    flash('✅ Link copiado!')
                  }}
                  className="bg-gray-700 hover:bg-gray-600 rounded-lg px-4 py-2 text-sm"
                >
                  📋 Copiar link
                </button>
                <p className="text-gray-500 text-xs">
                  Quem clicar cai direto no WhatsApp da barbearia — a IA atende, apresenta os
                  preços e agenda sozinha.
                </p>
              </div>
            )}
            {qr && !modoCodigo && (
              <div className="space-y-2">
                <p className="text-gray-200 font-medium">Escaneie com o WhatsApp da barbearia:</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qr} alt="QR Code de conexão" className="mx-auto rounded-xl bg-white p-3 w-64 h-64 object-contain" />
                <p className="text-gray-500 text-xs">WhatsApp → Aparelhos conectados → Conectar um aparelho</p>
              </div>
            )}
            {pairing && modoCodigo && (
              <div className="space-y-3 bg-gray-800 rounded-xl p-5">
                <p className="text-gray-200 font-medium">Digite este código no WhatsApp:</p>
                <p className="font-mono text-5xl font-bold tracking-widest text-amber-400">
                  {pairing.slice(0, 4)}-{pairing.slice(4)}
                </p>
                <p className="text-gray-400 text-sm text-left leading-relaxed">
                  No celular da barbearia:<br />
                  1. WhatsApp → <b>Configurações</b> → <b>Aparelhos conectados</b><br />
                  2. <b>Conectar um aparelho</b><br />
                  3. Toque em <b>"Conectar com número de telefone"</b><br />
                  4. Digite o código acima
                </p>
                <p className="text-gray-500 text-xs">O código expira rápido — se não der tempo, gere outro.</p>
              </div>
            )}
            {whats.state !== 'open' && !modoCodigo && (
              <button
                onClick={() => conectarWhats('conectar')}
                disabled={gerandoQr}
                className="w-full bg-amber-600 hover:bg-amber-500 disabled:opacity-50 rounded-xl py-3 font-semibold"
              >
                {gerandoQr ? 'Gerando QR Code...' : qr ? '🔄 Gerar novo QR Code' : '📲 Conectar WhatsApp (QR Code)'}
              </button>
            )}
            {whats.state !== 'open' && (
              <div className="bg-gray-800/60 rounded-xl p-4 space-y-3">
                <button onClick={() => setModoCodigo(!modoCodigo)} className="text-amber-500 hover:underline text-sm">
                  {modoCodigo ? '← Voltar para o QR Code' : '📞 Não consegue escanear? (iPhone) — Conectar com código'}
                </button>
                {modoCodigo && (
                  <div className="space-y-2">
                    <input
                      value={numeroPareamento}
                      onChange={e => setNumeroPareamento(e.target.value)}
                      placeholder="Número do WhatsApp com DDD (ex.: 11 99999-8888)"
                      inputMode="tel"
                      className="w-full bg-gray-900 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-amber-500"
                    />
                    <button
                      onClick={() => numeroPareamento.trim() && conectarWhats('conectar', numeroPareamento)}
                      disabled={gerandoQr || !numeroPareamento.trim()}
                      className="w-full bg-amber-600 hover:bg-amber-500 disabled:opacity-50 rounded-xl py-3 font-semibold"
                    >
                      {gerandoQr ? 'Gerando código...' : '🔢 Gerar código de 8 dígitos'}
                    </button>
                  </div>
                )}
              </div>
            )}
            <div className="border-t border-gray-800 pt-4 mt-2 space-y-3">
              <div className="bg-green-900/20 border border-green-800/50 rounded-xl p-4 text-sm text-green-200 text-left">
                🔒 <b>{clientesTotal} cliente(s) protegido(s) no banco de dados.</b><br />
                Perdeu o chip ou trocou de número? É só colocar o número novo — seus clientes,
                agendamentos, histórico e relatórios continuam TODOS salvos. Nada é perdido.
              </div>
              <button
                onClick={() => conectarWhats('novo-numero')}
                disabled={gerandoQr}
                className="w-full bg-amber-700 hover:bg-amber-600 disabled:opacity-50 rounded-xl py-3 font-semibold"
              >
                📱 Mudei de número (colocar outro)
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
