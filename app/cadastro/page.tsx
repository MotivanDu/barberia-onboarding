'use client'

import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import Logo from '../_components/Logo'
import StripeCheckout from './StripeCheckout'

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

type Iniciado = {
  codigo: string
  link: string
  stripe_client_secret: string
  stripe_pk: string
  plano: { nome: string; valor: number; anual: boolean; metodos: string }
}

const brl = (v: number) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

export default function CadastroPage() {
  // 1 = dados + pagamento · 2 = serviços · 3 = horários · 4 = sucesso
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')

  const [nomeBarbearia, setNomeBarbearia] = useState('')
  const [nomeBarbeiro, setNomeBarbeiro] = useState('')
  const [telefoneBarbeiro, setTelefoneBarbeiro] = useState('')
  const [cpfCnpj, setCpfCnpj] = useState('')
  const [plano, setPlano] = useState<'mensal' | 'anual'>('anual')

  // pagamento iniciado (tenant + cobrança já criados, aguardando pagar)
  const [iniciado, setIniciado] = useState<Iniciado | null>(null)

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

  const [sucesso, setSucesso] = useState<{ codigo: string; link: string; qrcode: string } | null>(null)

  // pré-seleciona o plano que veio da landing (?plano=mensal|anual)
  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get('plano')
    if (p === 'mensal' || p === 'anual') setPlano(p)
  }, [])

  const addServico = () => setServicos([...servicos, { nome: '', preco: '', duracao_minutos: '30', categoria: 'corte' }])
  const removeServico = (i: number) => setServicos(servicos.filter((_, idx) => idx !== i))
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

  // Cria a barbearia (bloqueada) + a cobrança no Stripe e mostra o checkout na hora.
  const iniciarPagamento = async () => {
    setErro('')
    const cpf = cpfCnpj.replace(/\D/g, '')
    if (!nomeBarbearia || !nomeBarbeiro || !telefoneBarbeiro) {
      setErro('Preencha todos os campos obrigatórios')
      return
    }
    if (cpf.length !== 11 && cpf.length !== 14) {
      setErro('Informe um CPF (11 dígitos) ou CNPJ (14 dígitos) válido')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/cadastro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome_barbearia: nomeBarbearia,
          nome_barbeiro: nomeBarbeiro,
          telefone_barbeiro: telefoneBarbeiro,
          cpf_cnpj: cpfCnpj,
          plano,
          servicos: [],
          horarios: [],
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      if (!data.stripe_client_secret || !data.stripe_pk) throw new Error('Não foi possível iniciar o pagamento agora. Tente de novo.')
      setIniciado({
        codigo: data.codigo,
        link: data.link,
        stripe_client_secret: data.stripe_client_secret,
        stripe_pk: data.stripe_pk,
        plano: data.plano,
      })
    } catch (e: any) {
      setErro(e.message || 'Erro ao iniciar o cadastro')
    } finally {
      setLoading(false)
    }
  }

  // Depois de pagar: salva serviços + horários e mostra o sucesso.
  const concluir = async () => {
    if (!iniciado) return
    setLoading(true)
    setErro('')
    const horariosAtivos = horarios
      .filter(h => h.ativo)
      .map(h => ({ dia_semana: h.dia_semana, hora_inicio: h.hora_inicio, hora_fim: h.hora_fim }))
    try {
      await fetch('/api/cadastro/detalhes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codigo: iniciado.codigo, servicos, horarios: horariosAtivos }),
      })
    } catch {
      // pagou — mesmo se salvar serviços falhar, segue pro sucesso (dá pra ajustar no painel)
    }
    let qr = ''
    try { qr = await QRCode.toDataURL(iniciado.link, { width: 300, margin: 2 }) } catch {}
    setSucesso({ codigo: iniciado.codigo, link: iniciado.link, qrcode: qr })
    setStep(4)
    setLoading(false)
  }

  const panelLink = sucesso ? `${window.location.origin}/painel/${sucesso.codigo}` : ''

  return (
    <div className="min-h-screen bg-[#f6f6f4] text-[#16181d]">
      <div className="max-w-2xl mx-auto px-4 py-10">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="flex justify-center mb-3"><Logo theme="light" className="h-10 w-auto" /></div>
          <p className="text-[#5b6472]">Cadastre sua barbearia e comece a receber agendamentos via WhatsApp</p>
        </div>

        {/* Steps */}
        {step < 4 && (
          <div className="flex items-center justify-center gap-2 mb-8">
            {[1, 2, 3].map(s => (
              <div key={s} className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${step >= s ? 'bg-[#1c52f8] text-white' : 'bg-[#e5e7eb] text-[#5b6472]'}`}>
                  {s}
                </div>
                {s < 3 && <div className={`w-12 h-1 ${step > s ? 'bg-[#1c52f8]' : 'bg-[#e5e7eb]'}`} />}
              </div>
            ))}
          </div>
        )}

        {/* STEP 1 — Dados essenciais + PAGAMENTO (checkout transparente) */}
        {step === 1 && (
          <div className="bg-white border border-[#e5e7eb] rounded-2xl p-6 space-y-5">
            <h2 className="text-xl font-semibold">{iniciado ? 'Pagamento' : 'Seus dados e pagamento'}</h2>

            {/* Campos essenciais (travados depois de iniciar o pagamento) */}
            <div className={iniciado ? 'opacity-60 pointer-events-none' : ''}>
              <div className="space-y-5">
                <div>
                  <label className="block text-sm text-[#5b6472] mb-1">Nome da Barbearia *</label>
                  <input
                    className="w-full bg-white border border-[#e5e7eb] rounded-lg px-4 py-3 text-[#16181d] placeholder-[#9aa1ac] focus:outline-none focus:border-[#1c52f8]"
                    placeholder="Ex: Barbearia do João"
                    value={nomeBarbearia}
                    onChange={e => setNomeBarbearia(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm text-[#5b6472] mb-1">Nome do Barbeiro *</label>
                  <input
                    className="w-full bg-white border border-[#e5e7eb] rounded-lg px-4 py-3 text-[#16181d] placeholder-[#9aa1ac] focus:outline-none focus:border-[#1c52f8]"
                    placeholder="Ex: João Silva"
                    value={nomeBarbeiro}
                    onChange={e => setNomeBarbeiro(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm text-[#5b6472] mb-1">Telefone do Barbeiro (WhatsApp) *</label>
                  <input
                    className="w-full bg-white border border-[#e5e7eb] rounded-lg px-4 py-3 text-[#16181d] placeholder-[#9aa1ac] focus:outline-none focus:border-[#1c52f8]"
                    placeholder="Coloque seu número assim: 19922992222"
                    value={telefoneBarbeiro}
                    onChange={e => setTelefoneBarbeiro(e.target.value)}
                  />
                  <p className="text-xs text-[#5b6472] mt-1">Você receberá os agendamentos e o acesso neste número</p>
                </div>
                <div>
                  <label className="block text-sm text-[#5b6472] mb-1">CPF ou CNPJ *</label>
                  <input
                    className="w-full bg-white border border-[#e5e7eb] rounded-lg px-4 py-3 text-[#16181d] placeholder-[#9aa1ac] focus:outline-none focus:border-[#1c52f8]"
                    placeholder="Somente números"
                    inputMode="numeric"
                    value={cpfCnpj}
                    onChange={e => setCpfCnpj(e.target.value)}
                  />
                </div>

                {/* Plano */}
                <div>
                  <label className="block text-sm text-[#5b6472] mb-2">Escolha o plano *</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setPlano('mensal')}
                      className={`text-left rounded-xl p-4 border-2 transition ${plano === 'mensal' ? 'border-[#1c52f8] bg-[#1c52f8]/10' : 'border-[#e5e7eb] bg-[#f6f6f4]'}`}
                    >
                      <p className="text-sm text-[#5b6472]">Mensal</p>
                      <p className="text-xl font-bold">R$ 100<span className="text-sm font-normal text-[#5b6472]">/mês</span></p>
                      <p className="text-xs text-[#5b6472] mt-1">💳 Cartão de crédito</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPlano('anual')}
                      className={`relative text-left rounded-xl p-4 border-2 transition ${plano === 'anual' ? 'border-amber-500 bg-amber-500/10' : 'border-[#e5e7eb] bg-[#f6f6f4]'}`}
                    >
                      <span className="absolute -top-2 right-2 bg-amber-500 text-gray-950 text-[10px] font-bold rounded-full px-2 py-0.5">17% OFF</span>
                      <p className="text-sm text-amber-500">Anual</p>
                      <p className="text-xl font-bold">R$ 1.000<span className="text-sm font-normal text-[#5b6472]">/ano</span></p>
                      <p className="text-xs text-[#5b6472] mt-1">💠 Pix ou cartão 12x</p>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Botão de continuar OU o checkout transparente */}
            {!iniciado ? (
              <>
                <button
                  onClick={iniciarPagamento}
                  disabled={loading}
                  className="w-full bg-[#1c52f8] hover:bg-[#1746d8] text-white font-semibold py-3 rounded-lg transition disabled:opacity-50"
                >
                  {loading ? 'Preparando pagamento...' : 'Ir para o pagamento →'}
                </button>
                {erro && <p className="text-red-600 text-sm text-center">{erro}</p>}
              </>
            ) : (
              <>
                <div className="bg-[#f6f6f4] border border-[#e5e7eb] rounded-xl p-4 text-center">
                  <p className="text-xs text-[#5b6472]">Plano escolhido</p>
                  <p className="text-xl font-bold mt-1">
                    {iniciado.plano.nome} · {brl(iniciado.plano.valor)}
                    <span className="text-sm font-normal text-[#5b6472]">{iniciado.plano.anual ? '/ano' : '/mês'}</span>
                  </p>
                  <p className="text-xs text-[#5b6472] mt-1">{iniciado.plano.metodos}</p>
                </div>
                <StripeCheckout
                  clientSecret={iniciado.stripe_client_secret}
                  pk={iniciado.stripe_pk}
                  codigo={iniciado.codigo}
                  onPago={() => setStep(2)}
                />
                <p className="text-xs text-[#5b6472] text-center">
                  Assim que o pagamento passar, você configura serviços e horários. ✨
                </p>
              </>
            )}
          </div>
        )}

        {/* STEP 2 — Serviços */}
        {step === 2 && (
          <div className="bg-white border border-[#e5e7eb] rounded-2xl p-6 space-y-5">
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center text-sm text-emerald-700 font-medium">
              ✅ Pagamento recebido! Agora é só configurar sua barbearia.
            </div>
            <h2 className="text-xl font-semibold">Serviços e Preços</h2>
            <div className="space-y-4">
              {servicos.map((s, i) => (
                <div key={i} className="bg-[#f6f6f4] border border-[#e5e7eb] rounded-xl p-4 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-[#5b6472]">Serviço {i + 1}</span>
                    {servicos.length > 1 && (
                      <button onClick={() => removeServico(i)} className="text-red-600 text-sm hover:text-red-300">
                        Remover
                      </button>
                    )}
                  </div>
                  <input
                    className="w-full bg-[#f6f6f4] border border-[#e5e7eb] rounded-lg px-3 py-2 text-[#16181d] placeholder-[#9aa1ac] focus:outline-none focus:border-[#1c52f8]"
                    placeholder="Nome do serviço"
                    value={s.nome}
                    onChange={e => updateServico(i, 'nome', e.target.value)}
                  />
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs text-[#5b6472] mb-1">Preço (R$)</label>
                      <input
                        type="number"
                        className="w-full bg-[#f6f6f4] border border-[#e5e7eb] rounded-lg px-3 py-2 text-[#16181d] focus:outline-none focus:border-[#1c52f8]"
                        placeholder="35"
                        value={s.preco}
                        onChange={e => updateServico(i, 'preco', e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-[#5b6472] mb-1">Duração (min)</label>
                      <input
                        type="number"
                        className="w-full bg-[#f6f6f4] border border-[#e5e7eb] rounded-lg px-3 py-2 text-[#16181d] focus:outline-none focus:border-[#1c52f8]"
                        placeholder="30"
                        value={s.duracao_minutos}
                        onChange={e => updateServico(i, 'duracao_minutos', e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-[#5b6472] mb-1">Categoria</label>
                      <select
                        className="w-full bg-[#f6f6f4] border border-[#e5e7eb] rounded-lg px-3 py-2 text-[#16181d] focus:outline-none focus:border-[#1c52f8]"
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
              className="w-full border border-dashed border-[#c7ccd4] text-[#5b6472] hover:text-[#16181d] hover:border-[#9aa1ac] py-3 rounded-lg transition text-sm"
            >
              + Adicionar serviço
            </button>
            <button
              onClick={() => setStep(3)}
              className="w-full bg-[#1c52f8] hover:bg-[#1746d8] text-white font-semibold py-3 rounded-lg transition"
            >
              Próximo →
            </button>
          </div>
        )}

        {/* STEP 3 — Horários */}
        {step === 3 && (
          <div className="bg-white border border-[#e5e7eb] rounded-2xl p-6 space-y-5">
            <h2 className="text-xl font-semibold">Horários de Atendimento</h2>
            <div className="space-y-3">
              {horarios.map((h, i) => (
                <div key={i} className={`flex items-center gap-3 p-3 rounded-xl border ${h.ativo ? 'bg-[#f6f6f4] border-[#e5e7eb]' : 'bg-[#eef0f4] border-transparent opacity-60'}`}>
                  <button
                    onClick={() => toggleDia(i)}
                    className={`w-12 h-6 rounded-full transition ${h.ativo ? 'bg-[#1c52f8]' : 'bg-[#c7ccd4]'} relative`}
                  >
                    <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${h.ativo ? 'left-7' : 'left-1'}`} />
                  </button>
                  <span className="w-20 text-sm font-medium">{DIAS[i].label}</span>
                  {h.ativo && (
                    <>
                      <input
                        type="time"
                        className="bg-[#f6f6f4] border border-[#e5e7eb] rounded-lg px-3 py-1.5 text-[#16181d] text-sm focus:outline-none focus:border-[#1c52f8]"
                        value={h.hora_inicio}
                        onChange={e => updateHorario(i, 'hora_inicio', e.target.value)}
                      />
                      <span className="text-[#5b6472]">até</span>
                      <input
                        type="time"
                        className="bg-[#f6f6f4] border border-[#e5e7eb] rounded-lg px-3 py-1.5 text-[#16181d] text-sm focus:outline-none focus:border-[#1c52f8]"
                        value={h.hora_fim}
                        onChange={e => updateHorario(i, 'hora_fim', e.target.value)}
                      />
                    </>
                  )}
                </div>
              ))}
            </div>
            {erro && <p className="text-red-600 text-sm text-center">{erro}</p>}
            <div className="flex gap-3">
              <button onClick={() => setStep(2)} className="flex-1 bg-[#e5e7eb] hover:bg-[#d8dbe0] text-[#16181d] py-3 rounded-lg transition">
                ← Voltar
              </button>
              <button
                onClick={concluir}
                disabled={loading}
                className="flex-1 bg-[#1c52f8] hover:bg-[#1746d8] text-white font-semibold py-3 rounded-lg transition disabled:opacity-50"
              >
                {loading ? 'Salvando...' : 'Concluir cadastro ✓'}
              </button>
            </div>
          </div>
        )}

        {/* STEP 4 — Sucesso */}
        {step === 4 && sucesso && (
          <div className="bg-white border border-[#e5e7eb] rounded-2xl p-6 space-y-5 text-center">
            <div className="text-5xl">🎉</div>
            <div>
              <h2 className="text-2xl font-bold text-[#16181d] mb-1">Tudo pronto!</h2>
              <p className="text-[#5b6472]">Sua barbearia está ativa. Enviamos o acesso no seu WhatsApp.</p>
            </div>

            <div className="bg-[#f6f6f4] border border-[#e5e7eb] rounded-xl p-4">
              <p className="text-xs text-[#5b6472]">Seu código de acesso</p>
              <p className="text-2xl font-bold tracking-wider mt-1">{sucesso.codigo}</p>
            </div>

            {sucesso.qrcode && (
              <div>
                <p className="text-sm text-[#5b6472] mb-2">QR Code para seus clientes agendarem:</p>
                <img src={sucesso.qrcode} alt="QR Code" className="mx-auto rounded-xl border border-[#e5e7eb]" width={220} height={220} />
              </div>
            )}

            <a
              href={panelLink}
              className="block bg-[#1c52f8] hover:bg-[#1746d8] text-white font-bold py-3 rounded-xl transition"
            >
              Abrir meu painel →
            </a>

            <div className="bg-[#1c52f8]/5 border border-[#1c52f8]/25 rounded-xl p-4 text-left">
              <p className="text-sm text-[#1c52f8] font-semibold mb-2">Próximos passos</p>
              <ul className="text-sm text-[#5b6472] space-y-1">
                <li>• Abra o painel e conecte o WhatsApp da sua barbearia</li>
                <li>• Divulgue o QR Code / link para os clientes agendarem</li>
                <li>• A IA já começa a atender automaticamente 💈</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
