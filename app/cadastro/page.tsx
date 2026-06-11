'use client'

import { useState } from 'react'
import QRCode from 'qrcode'

const DIAS = [
  { label: 'Domingo', value: 0 },
  { label: 'Segunda', value: 1 },
  { label: 'Terça', value: 2 },
  { label: 'Quarta', value: 3 },
  { label: 'Quinta', value: 4 },
  { label: 'Sexta', value: 5 },
  { label: 'Sábado', value: 6 },
]

const CATEGORIAS = [
  { label: 'Corte', value: 'corte' },
  { label: 'Barba', value: 'barba' },
  { label: 'Combo (Corte + Barba)', value: 'combo' },
  { label: 'Outros', value: 'outros' },
]

type Servico = { nome: string; preco: string; duracao_minutos: string; categoria: string }
type Horario = { dia_semana: number; hora_inicio: string; hora_fim: string; ativo: boolean }

export default function CadastroPage() {
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [resultado, setResultado] = useState<{ codigo: string; link: string; qrcode: string } | null>(null)
  const [erro, setErro] = useState('')

  const [nomeBarbearia, setNomeBarbearia] = useState('')
  const [nomeBarbeiro, setNomeBarbeiro] = useState('')
  const [telefoneBarbeiro, setTelefoneBarbeiro] = useState('')

  const [servicos, setServicos] = useState<Servico[]>([
    { nome: 'Corte', preco: '', duracao_minutos: '30', categoria: 'corte' },
  ])

  const [horarios, setHorarios] = useState<Horario[]>(
    DIAS.map(d => ({
      dia_semana: d.value,
      hora_inicio: '08:00',
      hora_fim: '18:00',
      ativo: d.value >= 1 && d.value <= 6,
    }))
  )

  const addServico = () => {
    setServicos([...servicos, { nome: '', preco: '', duracao_minutos: '30', categoria: 'corte' }])
  }

  const removeServico = (i: number) => {
    setServicos(servicos.filter((_, idx) => idx !== i))
  }

  const updateServico = (i: number, field: keyof Servico, value: string) => {
    const updated = [...servicos]
    updated[i][field] = value
    setServicos(updated)
  }

  const toggleDia = (i: number) => {
    const updated = [...horarios]
    updated[i].ativo = !updated[i].ativo
    setHorarios(updated)
  }

  const updateHorario = (i: number, field: 'hora_inicio' | 'hora_fim', value: string) => {
    const updated = [...horarios]
    updated[i][field] = value
    setHorarios(updated)
  }

  const handleSubmit = async () => {
    setLoading(true)
    setErro('')
    try {
      const horariosAtivos = horarios
        .filter(h => h.ativo)
        .map(h => ({ dia_semana: h.dia_semana, hora_inicio: h.hora_inicio, hora_fim: h.hora_fim }))

      const res = await fetch('/api/cadastro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome_barbearia: nomeBarbearia,
          nome_barbeiro: nomeBarbeiro,
          telefone_barbeiro: telefoneBarbeiro,
          servicos,
          horarios: horariosAtivos,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      const qr = await QRCode.toDataURL(data.link, { width: 300, margin: 2 })
      setResultado({ codigo: data.codigo, link: data.link, qrcode: qr })
      setStep(4)
    } catch (e: any) {
      setErro(e.message || 'Erro ao cadastrar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-2xl mx-auto px-4 py-10">
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold text-white mb-2">✂️ BarberIA</h1>
          <p className="text-gray-400">Cadastre sua barbearia e comece a receber agendamentos via WhatsApp</p>
        </div>

        {/* Steps */}
        {step < 4 && (
          <div className="flex items-center justify-center gap-2 mb-8">
            {[1, 2, 3].map(s => (
              <div key={s} className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${step >= s ? 'bg-green-500 text-white' : 'bg-gray-700 text-gray-400'}`}>
                  {s}
                </div>
                {s < 3 && <div className={`w-12 h-1 ${step > s ? 'bg-green-500' : 'bg-gray-700'}`} />}
              </div>
            ))}
          </div>
        )}

        {/* STEP 1 — Dados básicos */}
        {step === 1 && (
          <div className="bg-gray-900 rounded-2xl p-6 space-y-5">
            <h2 className="text-xl font-semibold">Dados da Barbearia</h2>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Nome da Barbearia *</label>
              <input
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-green-500"
                placeholder="Ex: Barbearia do João"
                value={nomeBarbearia}
                onChange={e => setNomeBarbearia(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Nome do Barbeiro *</label>
              <input
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-green-500"
                placeholder="Ex: João Silva"
                value={nomeBarbeiro}
                onChange={e => setNomeBarbeiro(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Telefone do Barbeiro (WhatsApp) *</label>
              <input
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-green-500"
                placeholder="Ex: 11 99999-9999"
                value={telefoneBarbeiro}
                onChange={e => setTelefoneBarbeiro(e.target.value)}
              />
              <p className="text-xs text-gray-500 mt-1">Você receberá os agendamentos neste número</p>
            </div>
            <button
              onClick={() => {
                if (!nomeBarbearia || !nomeBarbeiro || !telefoneBarbeiro) {
                  setErro('Preencha todos os campos obrigatórios')
                  return
                }
                setErro('')
                setStep(2)
              }}
              className="w-full bg-green-500 hover:bg-green-600 text-white font-semibold py-3 rounded-lg transition"
            >
              Próximo →
            </button>
            {erro && <p className="text-red-400 text-sm text-center">{erro}</p>}
          </div>
        )}

        {/* STEP 2 — Serviços */}
        {step === 2 && (
          <div className="bg-gray-900 rounded-2xl p-6 space-y-5">
            <h2 className="text-xl font-semibold">Serviços e Preços</h2>
            <div className="space-y-4">
              {servicos.map((s, i) => (
                <div key={i} className="bg-gray-800 rounded-xl p-4 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-gray-300">Serviço {i + 1}</span>
                    {servicos.length > 1 && (
                      <button onClick={() => removeServico(i)} className="text-red-400 text-sm hover:text-red-300">
                        Remover
                      </button>
                    )}
                  </div>
                  <input
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-green-500"
                    placeholder="Nome do serviço"
                    value={s.nome}
                    onChange={e => updateServico(i, 'nome', e.target.value)}
                  />
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Preço (R$)</label>
                      <input
                        type="number"
                        className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-green-500"
                        placeholder="35"
                        value={s.preco}
                        onChange={e => updateServico(i, 'preco', e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Duração (min)</label>
                      <input
                        type="number"
                        className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-green-500"
                        placeholder="30"
                        value={s.duracao_minutos}
                        onChange={e => updateServico(i, 'duracao_minutos', e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Categoria</label>
                      <select
                        className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-green-500"
                        value={s.categoria}
                        onChange={e => updateServico(i, 'categoria', e.target.value)}
                      >
                        {CATEGORIAS.map(c => (
                          <option key={c.value} value={c.value}>{c.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <button
              onClick={addServico}
              className="w-full border border-dashed border-gray-600 text-gray-400 hover:text-white hover:border-gray-400 py-3 rounded-lg transition text-sm"
            >
              + Adicionar serviço
            </button>
            <div className="flex gap-3">
              <button onClick={() => setStep(1)} className="flex-1 bg-gray-700 hover:bg-gray-600 py-3 rounded-lg transition">
                ← Voltar
              </button>
              <button
                onClick={() => setStep(3)}
                className="flex-1 bg-green-500 hover:bg-green-600 font-semibold py-3 rounded-lg transition"
              >
                Próximo →
              </button>
            </div>
          </div>
        )}

        {/* STEP 3 — Horários */}
        {step === 3 && (
          <div className="bg-gray-900 rounded-2xl p-6 space-y-5">
            <h2 className="text-xl font-semibold">Horários de Atendimento</h2>
            <div className="space-y-3">
              {horarios.map((h, i) => (
                <div key={i} className={`flex items-center gap-3 p-3 rounded-xl ${h.ativo ? 'bg-gray-800' : 'bg-gray-900 opacity-50'}`}>
                  <button
                    onClick={() => toggleDia(i)}
                    className={`w-12 h-6 rounded-full transition ${h.ativo ? 'bg-green-500' : 'bg-gray-600'} relative`}
                  >
                    <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${h.ativo ? 'left-7' : 'left-1'}`} />
                  </button>
                  <span className="w-20 text-sm font-medium">{DIAS[i].label}</span>
                  {h.ativo && (
                    <>
                      <input
                        type="time"
                        className="bg-gray-700 border border-gray-600 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-green-500"
                        value={h.hora_inicio}
                        onChange={e => updateHorario(i, 'hora_inicio', e.target.value)}
                      />
                      <span className="text-gray-500">até</span>
                      <input
                        type="time"
                        className="bg-gray-700 border border-gray-600 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-green-500"
                        value={h.hora_fim}
                        onChange={e => updateHorario(i, 'hora_fim', e.target.value)}
                      />
                    </>
                  )}
                </div>
              ))}
            </div>
            {erro && <p className="text-red-400 text-sm text-center">{erro}</p>}
            <div className="flex gap-3">
              <button onClick={() => setStep(2)} className="flex-1 bg-gray-700 hover:bg-gray-600 py-3 rounded-lg transition">
                ← Voltar
              </button>
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="flex-1 bg-green-500 hover:bg-green-600 font-semibold py-3 rounded-lg transition disabled:opacity-50"
              >
                {loading ? 'Cadastrando...' : 'Finalizar Cadastro ✓'}
              </button>
            </div>
          </div>
        )}

        {/* STEP 4 — Sucesso */}
        {step === 4 && resultado && (
          <div className="bg-gray-900 rounded-2xl p-6 space-y-6 text-center">
            <div className="text-5xl">🎉</div>
            <div>
              <h2 className="text-2xl font-bold text-green-400 mb-1">Barbearia cadastrada!</h2>
              <p className="text-gray-400">Seu link exclusivo está pronto para divulgar</p>
            </div>

            {/* Código */}
            <div className="bg-gray-800 rounded-xl p-4">
              <p className="text-xs text-gray-400 mb-1">Seu código exclusivo</p>
              <p className="text-3xl font-bold tracking-widest text-green-400">{resultado.codigo}</p>
            </div>

            {/* Link */}
            <div className="bg-gray-800 rounded-xl p-4">
              <p className="text-xs text-gray-400 mb-2">Link para divulgar</p>
              <p className="text-sm text-green-400 break-all font-mono">{resultado.link}</p>
              <button
                onClick={() => navigator.clipboard.writeText(resultado.link)}
                className="mt-3 bg-green-500 hover:bg-green-600 text-white text-sm px-6 py-2 rounded-lg transition"
              >
                Copiar link
              </button>
            </div>

            {/* QR Code */}
            <div className="bg-gray-800 rounded-xl p-4">
              <p className="text-xs text-gray-400 mb-3">QR Code exclusivo</p>
              <img src={resultado.qrcode} alt="QR Code" className="mx-auto rounded-lg" style={{ width: 200 }} />
              <a
                href={resultado.qrcode}
                download={`qrcode-${resultado.codigo}.png`}
                className="mt-3 inline-block bg-gray-700 hover:bg-gray-600 text-white text-sm px-6 py-2 rounded-lg transition"
              >
                Baixar QR Code
              </a>
            </div>

            <div className="bg-blue-900/30 border border-blue-700 rounded-xl p-4 text-left">
              <p className="text-sm text-blue-300 font-semibold mb-2">📱 Como divulgar</p>
              <ul className="text-sm text-gray-400 space-y-1">
                <li>• Coloque o QR Code na sua barbearia</li>
                <li>• Compartilhe o link nas redes sociais</li>
                <li>• Envie para seus clientes pelo WhatsApp</li>
                <li>• Quando o cliente clicar, o agendamento começa automaticamente</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
