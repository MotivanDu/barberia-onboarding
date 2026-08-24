'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'

type Status = 'carregando' | 'form' | 'conectado' | 'erro'

export default function ConexaoPage() {
  const params = useParams<{ codigo: string }>()
  const codigo = (params?.codigo || '').toString().toUpperCase()

  const [status, setStatus] = useState<Status>('carregando')
  const [qr, setQr] = useState<string | null>(null)
  const [pairing, setPairing] = useState<string | null>(null)
  const [modoQR, setModoQR] = useState(false) // false = conectar por CÓDIGO (padrão, mais fácil)
  const [numero, setNumero] = useState('')
  const [nome, setNome] = useState('')
  const [erro, setErro] = useState('')
  const [gerando, setGerando] = useState(false)
  const [copiado, setCopiado] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const pararPoll = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }

  const iniciarPoll = useCallback(() => {
    pararPoll()
    pollRef.current = setInterval(async () => {
      try {
        const r = await fetch(`/api/qrcode?codigo=${codigo}`)
        const d = await r.json()
        if (d.nome_barbearia) setNome(d.nome_barbearia)
        if (d.state === 'open') {
          setStatus('conectado')
          pararPoll()
        }
      } catch {}
    }, 3000)
  }, [codigo])

  const conectar = useCallback(
    async (num?: string) => {
      setGerando(true)
      setErro('')
      setQr(null)
      setPairing(null)
      try {
        const r = await fetch('/api/qrcode', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ codigo, acao: 'conectar', numero: num }),
        })
        const d = await r.json()
        if (!r.ok) {
          setErro(d.error || 'Não foi possível gerar o código. Tente de novo.')
          setGerando(false)
          return
        }
        if (d.nome_barbearia) setNome(d.nome_barbearia)
        if (d.state === 'open' && !d.qr && !d.pairing) {
          setStatus('conectado')
          setGerando(false)
          return
        }
        setQr(num ? null : d.qr)
        setPairing(d.pairing || null)
        setStatus('form')
        iniciarPoll()
      } catch {
        setErro('Falha de conexão. Tente de novo.')
      }
      setGerando(false)
    },
    [codigo, iniciarPoll]
  )

  useEffect(() => {
    if (!codigo) return
    ;(async () => {
      try {
        const r = await fetch(`/api/qrcode?codigo=${codigo}`)
        const d = await r.json()
        if (!r.ok) {
          setErro(d.error || 'Barbearia não encontrada')
          setStatus('erro')
          return
        }
        setNome(d.nome_barbearia)
        setStatus(d.state === 'open' ? 'conectado' : 'form')
      } catch {
        setErro('Falha de conexão. Tente de novo.')
        setStatus('erro')
      }
    })()
    return pararPoll
  }, [codigo])

  return (
    <div className="min-h-screen px-4 py-10" style={{ background: '#f6f6f4' }}>
      <div className="max-w-md mx-auto">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-extrabold" style={{ color: '#16181d' }}>💈 BarberIA</h1>
          <p style={{ color: '#5b6472' }}>{nome ? `WhatsApp da ${nome}` : 'Conexão do WhatsApp da barbearia'}</p>
        </div>

        <div className="bg-white rounded-2xl p-6 text-center space-y-5" style={{ border: '1px solid #e5e7eb' }}>
          {status === 'carregando' && (
            <div className="py-16">
              <div className="animate-pulse text-5xl mb-4">📲</div>
              <p style={{ color: '#5b6472' }}>Carregando...</p>
            </div>
          )}

          {status === 'conectado' && (
            <div className="py-10 space-y-3">
              <div className="text-6xl">✅</div>
              <p className="text-xl font-bold" style={{ color: '#1f7a52' }}>WhatsApp conectado!</p>
              <p style={{ color: '#5b6472' }}>
                Sua barbearia já está atendendo com o BarberIA. Pode fechar esta página. 🚀
              </p>
            </div>
          )}

          {/* CONECTAR POR CÓDIGO — método principal */}
          {status === 'form' && !modoQR && (
            <div className="space-y-3">
              {!pairing ? (
                <>
                  <p className="text-lg font-semibold" style={{ color: '#16181d' }}>📲 Conecte aqui o seu WhatsApp</p>
                  <p className="text-sm" style={{ color: '#5b6472' }}>
                    Digite o número da barbearia e conecte pelo próprio celular — rápido e sem precisar de outro aparelho.
                  </p>
                  <input
                    value={numero}
                    onChange={e => setNumero(e.target.value)}
                    placeholder="Coloque seu número assim: 19922992222"
                    inputMode="tel"
                    className="w-full rounded-lg px-4 py-3 text-sm outline-none focus:ring-2"
                    style={{ background: '#fff', border: '1px solid #e5e7eb' }}
                  />
                  <button
                    onClick={() => numero.trim() && conectar(numero)}
                    disabled={gerando || !numero.trim()}
                    className="w-full text-white disabled:opacity-50 rounded-xl py-4 font-bold text-lg"
                    style={{ background: '#1c52f8' }}
                  >
                    {gerando ? 'Gerando código...' : '🔗 Conectar WhatsApp'}
                  </button>
                </>
              ) : (
                <div className="space-y-3 rounded-xl p-5" style={{ background: '#f6f6f4', border: '2px solid #1c52f8' }}>
                  <p className="font-medium" style={{ color: '#16181d' }}>Seu código de conexão:</p>
                  <p className="font-mono text-4xl font-bold tracking-wide whitespace-nowrap" style={{ color: '#1c52f8' }}>
                    {pairing.slice(0, 4)}-{pairing.slice(4)}
                  </p>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(pairing)
                      setCopiado(true)
                      setTimeout(() => setCopiado(false), 5000)
                    }}
                    className="w-full rounded-xl py-3 font-semibold text-white"
                    style={{ background: copiado ? '#25995c' : '#1c52f8' }}
                  >
                    {copiado ? '✅ Código copiado' : '📋 Copiar código'}
                  </button>
                  {numero && (
                    <div className="rounded-lg p-3 text-sm text-left" style={{ background: '#fff7ed', border: '1px solid #fdba74', color: '#92400e' }}>
                      ⚠️ Coloque no celular do número <b>{numero}</b> — tem que ser o WhatsApp <b>desse mesmo número</b>, senão o WhatsApp recusa.
                    </div>
                  )}
                  <p className="text-sm text-left leading-relaxed" style={{ color: '#5b6472' }}>
                    Nesse celular, no WhatsApp:<br />
                    1. <b>Android:</b> Configurações (⋮) → <b>Aparelhos conectados</b><br />
                    &nbsp;&nbsp;&nbsp;<b>iPhone:</b> Ajustes → <b>Aparelhos conectados</b><br />
                    2. <b>Conectar um aparelho</b><br />
                    3. Toque em <b>&quot;Conectar com número de telefone&quot;</b> (embaixo)<br />
                    4. Cole ou digite o código acima
                  </p>
                  <p className="text-xs" style={{ color: '#9aa1ac' }}>O código expira rápido — se não der tempo, gere outro.</p>
                  <button
                    onClick={() => numero.trim() && conectar(numero)}
                    disabled={gerando}
                    className="text-sm hover:underline disabled:opacity-50"
                    style={{ color: '#1c52f8' }}
                  >
                    🔄 Gerar outro código
                  </button>
                </div>
              )}
              <button
                onClick={() => { setModoQR(true); setPairing(null); if (!qr) conectar() }}
                className="text-sm underline w-full text-center"
                style={{ color: '#5b6472' }}
              >
                Prefere QR Code? (precisa de outro aparelho pra escanear)
              </button>
            </div>
          )}

          {/* CONECTAR POR QR — método secundário */}
          {status === 'form' && modoQR && (
            <div className="space-y-3">
              {qr ? (
                <>
                  <p className="font-medium" style={{ color: '#16181d' }}>Escaneie com o WhatsApp da barbearia:</p>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={qr} alt="Código de conexão em imagem" className="mx-auto rounded-xl bg-white p-3 w-64 h-64 object-contain" />
                  <p className="text-xs" style={{ color: '#5b6472' }}>WhatsApp → Aparelhos conectados → Conectar um aparelho</p>
                </>
              ) : (
                <button
                  onClick={() => conectar()}
                  disabled={gerando}
                  className="w-full disabled:opacity-50 rounded-xl py-3 font-medium"
                  style={{ background: '#eef0f4', color: '#16181d' }}
                >
                  {gerando ? 'Gerando...' : '📷 Gerar imagem pra escanear'}
                </button>
              )}
              <button
                onClick={() => { setModoQR(false); setQr(null) }}
                className="text-sm hover:underline w-full text-center"
                style={{ color: '#1c52f8' }}
              >
                ← Voltar para o código (mais fácil)
              </button>
            </div>
          )}

          {status === 'erro' && (
            <div className="py-10 space-y-4">
              <div className="text-5xl">😕</div>
              <p style={{ color: '#dc2626' }}>{erro}</p>
              <button
                onClick={() => setStatus('form')}
                className="w-full rounded-xl py-3 font-medium"
                style={{ background: '#eef0f4', color: '#16181d' }}
              >
                Tentar de novo
              </button>
            </div>
          )}

          {status === 'form' && erro && (
            <p className="text-sm" style={{ color: '#dc2626' }}>{erro}</p>
          )}
        </div>

        <div className="mt-6 bg-white rounded-2xl p-5 space-y-3" style={{ border: '1px solid #e5e7eb' }}>
          <p className="font-medium" style={{ color: '#16181d' }}>📱 Trocou de chip ou de celular?</p>
          <p className="text-sm" style={{ color: '#5b6472' }}>
            É só conectar o número novo aqui em cima — todos os seus clientes, agendamentos e
            relatórios continuam salvos (é o seu backup automático).
          </p>
        </div>
      </div>
    </div>
  )
}
