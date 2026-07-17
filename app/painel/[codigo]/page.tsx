'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'

const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
const CATEGORIAS = [
  { label: 'Corte', value: 'corte' },
  { label: 'Barba', value: 'barba' },
  { label: 'Combo', value: 'combo' },
  { label: 'Outros', value: 'outros' },
]

type Servico = { id?: string; nome: string; preco: number | string; duracao_minutos: number | string; categoria: string; ativo: boolean }
type Horario = { dia_semana: number; hora_inicio: string; hora_fim: string; ativo: boolean }

export default function PainelPage() {
  const params = useParams<{ codigo: string }>()
  const codigo = (params?.codigo || '').toString().toUpperCase()

  const [aba, setAba] = useState<'servicos' | 'horarios' | 'whatsapp'>('servicos')
  const [nome, setNome] = useState('')
  const [sistemaAtivo, setSistemaAtivo] = useState(true)
  const [whats, setWhats] = useState<{ instancia: string | null; state: string; numero?: string | null }>({ instancia: null, state: '...' })
  const [servicos, setServicos] = useState<Servico[]>([])
  const [horarios, setHorarios] = useState<Horario[]>([])
  const [msg, setMsg] = useState('')
  const [carregando, setCarregando] = useState(true)

  const carregar = useCallback(async () => {
    setCarregando(true)
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

        <div className="flex gap-2 mb-6">
          {(
            [
              ['servicos', '✂️ Serviços'],
              ['horarios', '🗓️ Horários'],
              ['whatsapp', '📱 WhatsApp'],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setAba(k)}
              className={`flex-1 rounded-xl py-3 font-medium ${aba === k ? 'bg-amber-600' : 'bg-gray-900 hover:bg-gray-800'}`}
            >
              {label}
            </button>
          ))}
        </div>

        {msg && <div className="mb-4 bg-gray-900 rounded-xl p-3 text-center text-sm">{msg}</div>}
        {carregando && <p className="text-center text-gray-400 py-10">Carregando...</p>}

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
            <Link
              href={`/qrcode/${codigo}`}
              className="block w-full bg-amber-600 hover:bg-amber-500 rounded-xl py-3 font-semibold"
            >
              {whats.state === 'open' ? '🔄 Gerenciar conexão / Mudei de número' : '📲 Conectar WhatsApp (QR Code)'}
            </Link>
            <p className="text-gray-500 text-xs">
              Seus clientes, agendamentos e relatórios ficam sempre salvos — trocar de número não
              perde nada.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
