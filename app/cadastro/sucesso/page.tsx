'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'

export default function SucessoPage() {
  const [codigo, setCodigo] = useState('')
  const [status, setStatus] = useState('')

  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    setCodigo(p.get('codigo') || '')
    setStatus(p.get('redirect_status') || '')
  }, [])

  const falhou = status === 'failed'

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f6f6f4] px-4">
      <div className="bg-white border border-[#e5e7eb] rounded-2xl p-8 max-w-md w-full text-center space-y-4">
        {falhou ? (
          <>
            <p className="text-5xl">❌</p>
            <h1 className="text-2xl font-bold">Pagamento não concluído</h1>
            <p className="text-[#5b6472]">O pagamento não foi aprovado. Tente novamente ou use outro cartão.</p>
            <Link href="/cadastro" className="inline-block bg-[#1c52f8] hover:bg-[#1746d8] text-white rounded-xl px-6 py-3 font-semibold">
              Voltar
            </Link>
          </>
        ) : (
          <>
            <p className="text-5xl">✅</p>
            <h1 className="text-2xl font-bold">Pagamento recebido!</h1>
            <p className="text-[#5b6472]">
              Sua barbearia está sendo ativada. Em instantes você recebe o <b>código de acesso</b> no WhatsApp.
            </p>
            {codigo && (
              <p className="text-[#16181d]">
                Seu código: <b className="font-mono text-[#1c52f8]">{codigo}</b>
              </p>
            )}
            {codigo && (
              <Link
                href={`/painel/${codigo}`}
                className="inline-block bg-[#1c52f8] hover:bg-[#1746d8] text-white rounded-xl px-6 py-3 font-semibold"
              >
                Ir para o meu painel 💈
              </Link>
            )}
          </>
        )}
      </div>
    </div>
  )
}
