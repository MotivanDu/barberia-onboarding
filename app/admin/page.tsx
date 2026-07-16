'use client'

import { useState } from 'react'

type Tenant = {
  codigo: string
  nome_barbearia: string
  evolution_instance: string
  evolution_status: string
  sistema_ativo: boolean
  status_assinatura: string
}

export default function AdminPage() {
  const [senha, setSenha] = useState('')
  const [logado, setLogado] = useState(false)
  const [erro, setErro] = useState('')
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [barberiaState, setBarberiaState] = useState('')
  const [qr, setQr] = useState<string | null>(null)
  const [gerandoQr, setGerandoQr] = useState(false)

  const entrar = async (e: React.FormEvent) => {
    e.preventDefault()
    setErro('')
    const r = await fetch('/api/admin', { headers: { 'x-admin-senha': senha } })
    const d = await r.json()
    if (!r.ok) {
      setErro(d.error || 'Erro')
      return
    }
    setTenants(d.tenants)
    setBarberiaState(d.barberia_state)
    setLogado(true)
  }

  const gerarQrBarberia = async () => {
    setGerandoQr(true)
    setQr(null)
    const r = await fetch('/api/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-senha': senha },
      body: JSON.stringify({ acao: 'qr-barberia' }),
    })
    const d = await r.json()
    setGerandoQr(false)
    if (!r.ok) {
      setErro(d.error || 'Erro ao gerar QR')
      return
    }
    if (d.state === 'open' && !d.qr) {
      setErro('O número do BarberIA já está conectado ✅')
      return
    }
    setQr(d.qr)
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

  const statusEmoji: Record<string, string> = {
    conectado: '🟢',
    conectando: '🟡',
    desconectado: '🔴',
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        <h1 className="text-3xl font-bold text-center">🔐 Admin BarberIA</h1>

        <div className="bg-gray-900 rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold">📱 Número central do BarberIA (canal do barbeiro)</p>
              <p className="text-gray-400 text-sm">
                Estado: {barberiaState === 'open' ? '🟢 conectado' : `🔴 ${barberiaState}`}
              </p>
            </div>
            <button
              onClick={gerarQrBarberia}
              disabled={gerandoQr}
              className="bg-amber-600 hover:bg-amber-500 disabled:opacity-50 rounded-xl px-4 py-2 font-medium"
            >
              {gerandoQr ? 'Gerando...' : '🔄 Reconectar / Novo número'}
            </button>
          </div>
          {qr && (
            <div className="text-center space-y-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr} alt="QR BarberIA" className="mx-auto rounded-xl bg-white p-3 w-64 h-64 object-contain" />
              <p className="text-gray-400 text-sm">
                Escaneie com o número do BarberIA. Todos os barbeiros e vínculos são preservados.
              </p>
            </div>
          )}
        </div>

        <div className="bg-gray-900 rounded-2xl p-5">
          <p className="font-semibold mb-4">✂️ Barbearias cadastradas ({tenants.length})</p>
          <div className="space-y-3">
            {tenants.map(t => (
              <div key={t.codigo} className="bg-gray-800 rounded-xl p-4 flex items-center justify-between flex-wrap gap-2">
                <div>
                  <p className="font-medium">
                    {statusEmoji[t.evolution_status] || '⚪'} {t.nome_barbearia}
                    {!t.sistema_ativo && <span className="text-red-400 text-sm ml-2">⏸️ desativado</span>}
                  </p>
                  <p className="text-gray-400 text-sm font-mono">
                    {t.codigo} · {t.evolution_instance} · {t.status_assinatura}
                  </p>
                </div>
                <a href={`/painel/${t.codigo}`} className="text-amber-500 hover:underline text-sm">
                  abrir painel →
                </a>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
