'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

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
    <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-2">💈 BarberIA</h1>
          <p className="text-gray-400">Entre no painel da sua barbearia</p>
        </div>

        <form onSubmit={entrar} className="bg-gray-900 rounded-2xl p-6 space-y-5">
          <div>
            <label className="block text-gray-300 mb-2 font-medium">
              Código da barbearia ou telefone
            </label>
            <input
              value={identificador}
              onChange={e => setIdentificador(e.target.value)}
              placeholder="Ex.: EDUARDOU73 ou 11999998888"
              className="w-full bg-gray-800 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-amber-500"
              autoFocus
            />
          </div>
          {erro && <p className="text-red-400 text-sm">{erro}</p>}
          <button
            type="submit"
            disabled={loading || !identificador.trim()}
            className="w-full bg-amber-600 hover:bg-amber-500 disabled:opacity-50 rounded-xl py-3 font-semibold"
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
          <p className="text-gray-500 text-sm text-center">
            Ainda não tem cadastro?{' '}
            <Link href="/cadastro" className="text-amber-500 hover:underline">
              Cadastre sua barbearia
            </Link>
          </p>
        </form>
      </div>
    </div>
  )
}
