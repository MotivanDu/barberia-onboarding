'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Logo from '../_components/Logo'

const AZUL = '#1c52f8'

export default function LoginPage() {
  const router = useRouter()
  const [identificador, setIdentificador] = useState('')
  const [erro, setErro] = useState('')
  const [loading, setLoading] = useState(false)

  const entrar = async (e: React.FormEvent) => {
    e.preventDefault()
    setErro('')
    setLoading(true)
    try {
      const r = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identificador }),
      })
      const d = await r.json()
      if (!r.ok) {
        setErro(d.error || 'Erro ao entrar')
        setLoading(false)
        return
      }
      router.push(`/painel/${d.codigo}`)
    } catch {
      setErro('Falha de conexão. Tente novamente.')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#f6f6f4] text-[#16181d] flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-3"><Logo theme="light" className="h-10 w-auto" /></div>
          <p className="text-[#5b6472]">Entre no painel da sua barbearia</p>
        </div>

        <form onSubmit={entrar} className="bg-white border border-[#e5e7eb] rounded-2xl p-6 space-y-5 shadow-sm">
          <div>
            <label className="block mb-2 font-medium">Código da barbearia ou telefone</label>
            <input
              value={identificador}
              onChange={e => setIdentificador(e.target.value)}
              placeholder="Ex.: EDUARDOU73 ou 11999998888"
              className="w-full bg-[#f6f6f4] border border-[#e5e7eb] rounded-xl px-4 py-3 outline-none focus:border-[#1c52f8]"
              autoFocus
            />
          </div>
          {erro && <p className="text-red-600 text-sm">{erro}</p>}
          <button
            type="submit"
            disabled={loading || !identificador.trim()}
            className="w-full rounded-xl py-3 font-semibold text-white disabled:opacity-50"
            style={{ background: AZUL }}
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
          <p className="text-[#5b6472] text-sm text-center">
            Ainda não tem cadastro?{' '}
            <Link href="/cadastro" className="hover:underline" style={{ color: AZUL }}>
              Cadastre sua barbearia
            </Link>
          </p>
        </form>
      </div>
    </div>
  )
}
