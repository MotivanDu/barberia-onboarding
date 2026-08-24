const PASSOS: [string, string][] = [
  ['1️⃣', 'Abra o seu WhatsApp e ache a mensagem do BarberIA 💈'],
  ['2️⃣', 'Toque no link que a gente te mandou'],
  ['3️⃣', 'Escreva o nome da barbearia, os serviços e os horários (leva 2 minutinhos)'],
  ['4️⃣', 'Ligue o WhatsApp da sua barbearia digitando o código que aparece na tela (é rapidinho — o site te ensina certinho)'],
  ['✅', 'Pronto! A partir daí a IA atende seus clientes sozinha, dia e noite'],
]

export default function ObrigadoPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10" style={{ background: '#f6f6f4' }}>
      <div
        className="bg-white rounded-3xl p-8 max-w-lg w-full text-center"
        style={{ border: '1px solid #e5e7eb', boxShadow: '0 10px 40px rgba(0,0,0,0.06)' }}
      >
        <p className="text-6xl mb-1">🎉</p>
        <h1 className="text-3xl font-extrabold" style={{ color: '#16181d' }}>
          Deu certo! 💈
        </h1>
        <p className="mt-2 text-lg" style={{ color: '#5b6472' }}>
          Seu pagamento foi confirmado e a sua barbearia já está sendo ativada.
        </p>

        {/* Destaque: olhe o WhatsApp */}
        <div
          className="mt-6 rounded-2xl p-5 text-left"
          style={{ background: 'rgba(37,153,92,0.12)', border: '1px solid rgba(37,153,92,0.28)' }}
        >
          <p className="text-lg font-bold" style={{ color: '#1f7a52' }}>
            📱 Olha o seu WhatsApp agora!
          </p>
          <p className="mt-1" style={{ color: '#16181d' }}>
            A gente <b>já te chamou lá</b> com o seu código e o link pra começar. É só abrir o WhatsApp
            do número que você usou na compra. 😊
          </p>
        </div>

        {/* Passo a passo bem simples */}
        <div className="mt-6 text-left">
          <p className="font-bold text-center mb-3" style={{ color: '#16181d' }}>
            Agora é só seguir estes passinhos:
          </p>
          <div className="space-y-2">
            {PASSOS.map(([n, t], i) => (
              <div
                key={i}
                className="flex items-start gap-3 rounded-xl p-3"
                style={{ background: '#f6f6f4' }}
              >
                <span className="text-xl leading-6 shrink-0">{n}</span>
                <span style={{ color: '#16181d' }}>{t}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="mt-6 text-sm" style={{ color: '#5b6472' }}>
          Não achou a mensagem? Espera 1 minutinho e olha de novo no WhatsApp do número da compra. 💚
        </p>
      </div>
    </div>
  )
}
