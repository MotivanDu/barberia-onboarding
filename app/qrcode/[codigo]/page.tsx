'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'

type Status = 'carregando' | 'qr' | 'conectando' | 'conectado' | 'erro'

export default function QrCodePage() {
  const params = useParams<{ codigo: string }>()
  const codigo = (params?.codigo || '').toString().toUpperCase()

  const [status, setStatus] = useState<Status>('carregando')
  const [qr, setQr] = useState<string | null>(null)
  const [nome, setNome] = useState('')
  const [erro, setErro] = useState('')
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
    async (acao: 'conectar' | 'novo-numero') => {
      setStatus('carregando')
      setErro('')
      setQr(null)
      try {
        const r = await fetch('/api/qrcode', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ codigo, acao }),
        })
        const d = await r.json()
        if (!r.ok) {
          setErro(d.error || 'Erro ao gerar o QR Code')
          setStatus('erro')
          return
        }
        if (d.nome_barbearia) setNome(d.nome_barbearia)
        if (d.state === 'open') {
          setStatus('conectado')
          return
        }
        setQr(d.qr)
        setStatus('qr')
        iniciarPoll()
      } catch {
        setErro('Falha de conexão. Tente novamente.')
        setStatus('erro')
      }
    },
    [codigo, iniciarPoll]
  )

  useEffect(() => {
    if (!codigo) return
    // primeiro consulta o estado — se já está conectado, não gera QR à toa
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
        if (d.state === 'open') {
          setStatus('conectado')
        } else {
          conectar('conectar')
        }
      } catch {
        setErro('Falha de conexão. Tente novamente.')
        setStatus('erro')
      }
    })()
    return pararPoll
  }, [codigo, conectar])

  const mudeiDeNumero = () => {
    const ok = window.confirm(
      'Mudei de número:\n\nIsso desconecta o WhatsApp atual e gera um novo QR Code para você conectar o número novo.\n\nSeus clientes, agendamentos e histórico continuam TODOS salvos — nada é perdido.\n\nContinuar?'
    )
    if (ok) conectar('novo-numero')
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-md mx-auto px-4 py-10">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-1">💈 BarberIA</h1>
          <p className="text-gray-400">
            {nome ? `WhatsApp da ${nome}` : 'Conexão do WhatsApp da barbearia'}
          </p>
        </div>

        <div className="bg-gray-900 rounded-2xl p-6 text-center space-y-5">
          {status === 'carregando' && (
            <div className="py-16">
              <div className="animate-pulse text-5xl mb-4">📲</div>
              <p className="text-gray-300">Gerando seu QR Code...</p>
            </div>
          )}

          {status === 'qr' && qr && (
            <>
              <p className="text-gray-200 font-medium">
                Abra o WhatsApp no celular da barbearia e escaneie:
              </p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qr}
                alt="QR Code de conexão"
                className="mx-auto rounded-xl bg-white p-3 w-72 h-72 object-contain"
              />
              <p className="text-gray-400 text-sm">
                WhatsApp → Aparelhos conectados → Conectar um aparelho
              </p>
              <p className="text-gray-500 text-xs">
                O QR expira rápido — se não funcionar, gere outro abaixo.
              </p>
              <button
                onClick={() => conectar('conectar')}
                className="w-full bg-gray-800 hover:bg-gray-700 rounded-xl py-3 font-medium"
              >
                🔄 Gerar novo QR Code
              </button>
            </>
          )}

          {status === 'conectado' && (
            <div className="py-10 space-y-3">
              <div className="text-6xl">✅</div>
              <p className="text-xl font-bold text-green-400">WhatsApp conectado!</p>
              <p className="text-gray-300">
                Sua barbearia já está atendendo com o BarberIA. Pode fechar esta página. 🚀
              </p>
            </div>
          )}

          {status === 'erro' && (
            <div className="py-10 space-y-4">
              <div className="text-5xl">😕</div>
              <p className="text-red-400">{erro}</p>
              <button
                onClick={() => conectar('conectar')}
                className="w-full bg-gray-800 hover:bg-gray-700 rounded-xl py-3 font-medium"
              >
                Tentar novamente
              </button>
            </div>
          )}
        </div>

        <div className="mt-6 bg-gray-900 rounded-2xl p-5 space-y-3">
          <p className="text-gray-300 font-medium">📱 Trocou de chip ou de celular?</p>
          <p className="text-gray-500 text-sm">
            Conecte o número novo sem perder nada: todos os seus clientes, agendamentos e
            relatórios continuam salvos (é o seu backup automático).
          </p>
          <button
            onClick={mudeiDeNumero}
            className="w-full bg-amber-600 hover:bg-amber-500 rounded-xl py-3 font-semibold"
          >
            Mudei de número
          </button>
        </div>
      </div>
    </div>
  )
}
