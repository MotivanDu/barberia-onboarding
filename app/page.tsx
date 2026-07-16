import Link from 'next/link'

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center space-y-8">
        <div>
          <h1 className="text-5xl font-bold mb-3">💈 BarberIA</h1>
          <p className="text-gray-400">
            Sua barbearia com atendimento, agendamento e retorno de clientes — tudo automático
            pelo WhatsApp.
          </p>
        </div>
        <div className="space-y-3">
          <Link
            href="/cadastro"
            className="block w-full bg-amber-600 hover:bg-amber-500 rounded-xl py-4 font-semibold text-lg"
          >
            ✂️ Cadastrar minha barbearia
          </Link>
          <Link
            href="/login"
            className="block w-full bg-gray-800 hover:bg-gray-700 rounded-xl py-4 font-semibold text-lg"
          >
            🔑 Já tenho cadastro — Entrar
          </Link>
        </div>
      </div>
    </div>
  )
}
