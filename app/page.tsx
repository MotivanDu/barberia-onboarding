'use client'

import Link from 'next/link'
import { useState } from 'react'

/* ---------------- dados ---------------- */

const DORES = [
  { i: '🔇', t: 'Máquina na mão, celular apitando', d: 'O cliente manda mensagem e fica no vácuo enquanto você atende. Ele desiste e marca em outra.' },
  { i: '🌙', t: 'Chamou de noite, você vê de manhã', d: 'Fora do horário ninguém responde. De manhã o cliente já resolveu com o concorrente.' },
  { i: '🔁', t: '"Quanto é?" e "que horas tem?" o dia todo', d: 'Você repete as mesmas respostas o tempo todo, em vez de cortar cabelo.' },
  { i: '🪑', t: 'Horário marcado, cadeira vazia', d: 'O cliente esqueceu, não avisou, e o seu horário foi pro lixo.' },
  { i: '💸', t: 'Cliente sumiu e você nem percebeu', d: 'Aquele freguês de toda semana parou de vir faz um mês — e ninguém foi atrás.' },
  { i: '📵', t: 'Sozinho pra atender e cortar', d: 'Não dá pra segurar a tesoura e o WhatsApp ao mesmo tempo. Alguém sempre fica esperando.' },
]

const PASSOS = [
  { n: '1', t: 'Cadastre sua barbearia', d: 'Serviços, preços e horários. Leva uns 5 minutos, direto do celular.' },
  { n: '2', t: 'Conecte seu WhatsApp', d: 'O seu número mesmo — por QR Code ou código (funciona até no iPhone).' },
  { n: '3', t: 'A IA começa a atender', d: 'Ela responde, agenda e te avisa de cada cliente. Você só corta.' },
]

const RECURSOS = [
  { i: '🤖', t: 'Atende na hora, 24 horas', d: 'Responde preço, serviço e horário em segundos — de madrugada, domingo, feriado. Com jeito de gente, entende gíria.' },
  { i: '📅', t: 'Agenda sozinho', d: 'Marca o horário direto na agenda e nunca marca dois clientes no mesmo horário.' },
  { i: '⏰', t: 'Lembra o cliente', d: 'Aviso na véspera e 2h antes, com confirmação. Cadeira vazia vira raridade.' },
  { i: '🔔', t: 'Te avisa de tudo', d: 'Cada novo agendamento e cada confirmação cai no SEU WhatsApp na hora.' },
  { i: '♻️', t: 'Resgata quem sumiu', d: 'Traz de volta o cliente de barba parado +15 dias e o de corte +30 dias. Automático.' },
  { i: '📊', t: 'Mostra seus números', d: 'Receita, clientes novos e resgatados pela IA, e quanto ela gerou em reais. No painel.' },
  { i: '✂️', t: 'Preços sempre certos', d: 'Mudou serviço ou preço no painel? A IA já usa na hora, sem retrabalho.' },
  { i: '📇', t: 'Aproveita sua base', d: 'Puxa os contatos do seu WhatsApp e começa a reativar cliente antigo.' },
  { i: '📱', t: 'Seu próprio número', d: 'O cliente fala com a SUA barbearia, não com um número estranho de robô.' },
  { i: '🔒', t: 'Trocou de número? Não perde nada', d: 'Perdeu o chip ou o aparelho? Coloca outro número e clientes, histórico e agenda continuam salvos.' },
]

const SERVICOS = ['Corte', 'Degradê', 'Barba', 'Corte + Barba', 'Pezinho', 'Sobrancelha', 'Platinado', 'Combo completo']

const FAQ = [
  { q: 'Preciso trocar o número da barbearia?', a: 'Não. O BarberIA usa o SEU número atual. O cliente continua falando com a sua barbearia de sempre.' },
  { q: 'E se eu perder o celular ou trocar de chip?', a: 'É só conectar o número novo no painel. Seus clientes, agendamentos, histórico e relatórios continuam todos salvos — nada é perdido.' },
  { q: 'A IA responde de forma natural?', a: 'Sim. Ela conversa como uma pessoa, entende gíria e "vai direto ao ponto": preço, horário e agendamento, sem enrolação.' },
  { q: 'Funciona no iPhone?', a: 'Funciona. A conexão pode ser feita por QR Code ou por um código de 8 dígitos, que é o jeito mais fácil no iPhone.' },
  { q: 'Tenho mais de um barbeiro. Dá pra usar?', a: 'Dá. Você cadastra a barbearia e o atendimento funciona pra todos. O painel mostra os números do negócio inteiro.' },
  { q: 'Preciso entender de tecnologia?', a: 'Não. O cadastro leva 5 minutos e é tudo pelo celular. Depois disso, a IA cuida do atendimento sozinha.' },
  { q: 'Posso mudar meus preços e serviços depois?', a: 'Quando quiser. Alterou no painel, a IA já passa a usar o valor novo na mesma hora.' },
  { q: 'Como funciona o pagamento?', a: 'No plano mensal você paga no cartão de crédito. No plano anual você paga no Pix ou no cartão — e ainda economiza 17%.' },
  { q: 'É seguro? Uso o meu WhatsApp mesmo?', a: 'Sim, é o seu número, com uma conexão estável. Se em algum momento cair, você reconecta em segundos sem perder nenhum dado. Recomendamos um número dedicado só da barbearia.' },
]

/* ---------------- componentes ---------------- */

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 bg-gray-900/80 border border-gray-800 rounded-full px-3 py-1.5 text-sm text-gray-300">
      {children}
    </span>
  )
}

function Bolha({ de, children }: { de: 'cliente' | 'ia'; children: React.ReactNode }) {
  const meu = de === 'ia'
  return (
    <div className={`flex ${meu ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm leading-snug ${
          meu ? 'bg-emerald-600 text-white rounded-br-sm' : 'bg-gray-700 text-gray-100 rounded-bl-sm'
        }`}
      >
        {children}
      </div>
    </div>
  )
}

/* ---------------- página ---------------- */

export default function Home() {
  const [faqAberta, setFaqAberta] = useState<number | null>(0)

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* NAV */}
      <header className="sticky top-0 z-40 backdrop-blur bg-gray-950/80 border-b border-gray-900">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <span className="text-xl font-bold">💈 BarberIA</span>
          <nav className="hidden md:flex items-center gap-6 text-sm text-gray-300">
            <a href="#como" className="hover:text-white">Como funciona</a>
            <a href="#recursos" className="hover:text-white">Recursos</a>
            <a href="#precos" className="hover:text-white">Preços</a>
            <Link href="/login" className="hover:text-white">Entrar</Link>
          </nav>
          <Link href="/cadastro" className="bg-amber-600 hover:bg-amber-500 rounded-xl px-4 py-2 text-sm font-semibold">
            Assinar
          </Link>
        </div>
      </header>

      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-amber-600/10 via-transparent to-transparent" />
        <div className="relative max-w-6xl mx-auto px-4 pt-16 pb-14 grid md:grid-cols-2 gap-10 items-center">
          <div>
            <div className="inline-block bg-amber-600/15 text-amber-400 rounded-full px-3 py-1 text-xs font-semibold mb-5">
              Atendimento automático pra barbearia no WhatsApp
            </div>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight leading-[1.1]">
              Atende, agenda e <span className="text-amber-500">traz seus clientes de volta</span> — 24h no WhatsApp
            </h1>
            <p className="text-gray-400 text-lg mt-5 leading-relaxed">
              Enquanto você está com a máquina na mão, o BarberIA responde cada cliente na hora,
              marca o horário sozinho e ainda chama de volta quem sumiu. Você só corta.
            </p>
            <div className="flex flex-wrap gap-3 mt-7">
              <Link href="/cadastro" className="bg-amber-600 hover:bg-amber-500 rounded-xl px-6 py-4 font-semibold text-lg">
                ✂️ Cadastrar minha barbearia
              </Link>
              <a href="#precos" className="bg-gray-800 hover:bg-gray-700 rounded-xl px-6 py-4 font-semibold text-lg">
                Ver os planos
              </a>
            </div>
            <p className="text-gray-500 text-sm mt-4">Ativa em 5 minutos · No seu próprio número</p>
          </div>

          {/* mockup conversa */}
          <div className="mx-auto w-full max-w-sm">
            <div className="bg-gray-900 border border-gray-800 rounded-[2rem] p-3 shadow-2xl">
              <div className="bg-gray-950 rounded-[1.5rem] overflow-hidden">
                <div className="bg-emerald-700/90 px-4 py-3 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-emerald-900 grid place-items-center text-lg">💈</div>
                  <div>
                    <p className="font-semibold text-sm leading-tight">Barbearia do Zé</p>
                    <p className="text-emerald-200 text-xs">online agora</p>
                  </div>
                </div>
                <div className="p-3 space-y-2 bg-[#0b141a] min-h-[320px]">
                  <Bolha de="cliente">opa, quanto tá o degradê com barba?</Bolha>
                  <Bolha de="ia">Fala, Carlos! 💈 Degradê + barba fica <b>R$ 55</b>. Quer que eu já marque? Amanhã tenho 15h ou 16h30.</Bolha>
                  <Bolha de="cliente">amanhã 16h30 então</Bolha>
                  <Bolha de="ia">Fechado! ✅ Degradê + barba, amanhã (25/07) às <b>16h30</b>. Te lembro na véspera. Até lá! 🙌</Bolha>
                </div>
              </div>
            </div>
            <p className="text-center text-gray-500 text-sm mt-3">
              A conversa virou horário na agenda. Sem você tocar no celular.
            </p>
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-4 pb-10 flex flex-wrap gap-2 justify-center">
          <Badge>⚡ Responde em segundos</Badge>
          <Badge>🕐 Atende 24/7</Badge>
          <Badge>📅 Agenda sozinho</Badge>
          <Badge>♻️ Resgata cliente sumido</Badge>
          <Badge>📱 No seu número</Badge>
        </div>
      </section>

      {/* DORES */}
      <section className="bg-gray-900/40 border-y border-gray-900">
        <div className="max-w-6xl mx-auto px-4 py-16">
          <h2 className="text-3xl font-bold text-center">Você conhece essa rotina</h2>
          <p className="text-gray-400 text-center mt-2">Cada mensagem sem resposta é um corte que foi pro concorrente.</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-10">
            {DORES.map((d, i) => (
              <div key={i} className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
                <div className="text-3xl">{d.i}</div>
                <p className="font-semibold mt-3">{d.t}</p>
                <p className="text-gray-400 text-sm mt-1 leading-relaxed">{d.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* COMO FUNCIONA */}
      <section id="como" className="max-w-6xl mx-auto px-4 py-16">
        <h2 className="text-3xl font-bold text-center">Funciona em 3 passos</h2>
        <p className="text-gray-400 text-center mt-2">Sem instalar nada. Sem manual. Sem complicação.</p>
        <div className="grid md:grid-cols-3 gap-4 mt-10">
          {PASSOS.map(p => (
            <div key={p.n} className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
              <div className="w-11 h-11 rounded-full bg-amber-600 grid place-items-center font-bold text-lg">{p.n}</div>
              <p className="font-semibold text-lg mt-4">{p.t}</p>
              <p className="text-gray-400 text-sm mt-1 leading-relaxed">{p.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* RECURSOS */}
      <section id="recursos" className="bg-gray-900/40 border-y border-gray-900">
        <div className="max-w-6xl mx-auto px-4 py-16">
          <h2 className="text-3xl font-bold text-center">Tudo que o BarberIA faz por você</h2>
          <p className="text-gray-400 text-center mt-2">Não é só um robô que responde. É um funcionário que atende, agenda, lembra e recupera cliente.</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-10">
            {RECURSOS.map((r, i) => (
              <div key={i} className="bg-gray-900 border border-gray-800 rounded-2xl p-5 hover:border-amber-700/60 transition-colors">
                <div className="text-2xl">{r.i}</div>
                <p className="font-semibold mt-3">{r.t}</p>
                <p className="text-gray-400 text-sm mt-1 leading-relaxed">{r.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* DIFERENCIAL: RESGATE */}
      <section className="max-w-6xl mx-auto px-4 py-16 grid md:grid-cols-2 gap-10 items-center">
        <div>
          <div className="inline-block bg-emerald-600/15 text-emerald-400 rounded-full px-3 py-1 text-xs font-semibold mb-4">
            O que ninguém mais faz
          </div>
          <h2 className="text-3xl font-bold leading-tight">Ele vai atrás do cliente que sumiu</h2>
          <p className="text-gray-400 mt-4 leading-relaxed">
            A maioria dos sistemas só atende quem chama. O BarberIA faz o contrário: quando um cliente
            passa do tempo normal sem aparecer — <b className="text-white">barba parada +15 dias, corte +30 dias</b> — ele
            manda uma mensagem e reagenda. Cliente que você já ia perder, de volta na cadeira.
          </p>
          <p className="text-gray-400 mt-3 leading-relaxed">
            E você vê tudo separado no painel: <b className="text-amber-400">quantos clientes novos a IA trouxe</b> e
            <b className="text-emerald-400"> quantos ela resgatou</b>.
          </p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-3">
          <p className="text-gray-400 text-sm">Exemplo real de resgate:</p>
          <Bolha de="ia">E aí, Rafael! Faz 32 dias que você não passa aqui 💈 Bora renovar o corte? Tenho horário essa semana.</Bolha>
          <Bolha de="cliente">opa, verdade! pode ser sexta de tarde?</Bolha>
          <Bolha de="ia">Fechado! ✅ Sexta às 17h. Te espero!</Bolha>
          <div className="bg-emerald-900/20 border border-emerald-800/50 rounded-xl p-3 text-emerald-200 text-sm mt-2">
            ♻️ Cliente recuperado sozinho, sem você mexer um dedo.
          </div>
        </div>
      </section>

      {/* DIFERENCIAL: DASHBOARD */}
      <section className="bg-gray-900/40 border-y border-gray-900">
        <div className="max-w-6xl mx-auto px-4 py-16 grid md:grid-cols-2 gap-10 items-center">
          <div className="order-2 md:order-1 grid grid-cols-2 gap-3">
            {[
              { t: 'Receita no mês', v: 'R$ 8.450', c: 'text-white' },
              { t: 'Novos clientes pela IA', v: '27', c: 'text-amber-400' },
              { t: 'Resgatados pela IA', v: '14', c: 'text-emerald-400' },
              { t: 'Valor gerado pela IA', v: 'R$ 3.900', c: 'text-amber-400' },
            ].map((k, i) => (
              <div key={i} className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
                <p className="text-xs text-gray-400">{k.t}</p>
                <p className={`text-2xl font-bold mt-1 ${k.c}`}>{k.v}</p>
              </div>
            ))}
          </div>
          <div className="order-1 md:order-2">
            <div className="inline-block bg-amber-600/15 text-amber-400 rounded-full px-3 py-1 text-xs font-semibold mb-4">
              Prova na tela
            </div>
            <h2 className="text-3xl font-bold leading-tight">Você vê, em reais, o quanto ele te dá de retorno</h2>
            <p className="text-gray-400 mt-4 leading-relaxed">
              No seu painel: receita do mês e da semana, clientes que a IA trouxe, clientes que ela
              resgatou, ticket médio e o valor exato que a ferramenta gerou. Sem achismo — o número
              na tela mostra que ela se paga.
            </p>
            <p className="text-gray-500 text-sm mt-4">*Valores ilustrativos.</p>
          </div>
        </div>
      </section>

      {/* SERVIÇOS */}
      <section className="max-w-6xl mx-auto px-4 py-16 text-center">
        <h2 className="text-3xl font-bold">Do pezinho ao degradê, tudo vira horário marcado</h2>
        <div className="flex flex-wrap justify-center gap-2 mt-8">
          {SERVICOS.map(s => (
            <span key={s} className="bg-gray-900 border border-gray-800 rounded-full px-4 py-2 text-gray-300">
              {s}
            </span>
          ))}
        </div>
      </section>

      {/* PREÇOS */}
      <section id="precos" className="bg-gray-900/40 border-y border-gray-900">
        <div className="max-w-5xl mx-auto px-4 py-16">
          <h2 className="text-3xl font-bold text-center">Um preço só. A barbearia inteira.</h2>
          <p className="text-gray-400 text-center mt-2">
            Todos os recursos incluídos, sem cobrar “por profissional”. Cancele quando quiser no mensal.
          </p>

          <div className="grid md:grid-cols-2 gap-5 mt-10 items-start">
            {/* MENSAL */}
            <div className="bg-gray-900 border border-gray-800 rounded-3xl p-7">
              <p className="text-gray-400 font-medium">Mensal</p>
              <div className="mt-3 flex items-end gap-1">
                <span className="text-4xl font-bold">R$ 100</span>
                <span className="text-gray-400 mb-1">/mês</span>
              </div>
              <p className="text-gray-500 text-sm mt-1">≈ R$ 3,33 por dia</p>
              <div className="mt-3 inline-block bg-gray-800 rounded-full px-3 py-1 text-xs text-gray-300">
                💳 No cartão de crédito
              </div>
              <Link href="/cadastro" className="mt-6 block text-center bg-gray-800 hover:bg-gray-700 rounded-xl py-3 font-semibold">
                Começar no mensal
              </Link>
            </div>

            {/* ANUAL */}
            <div className="relative bg-gradient-to-b from-amber-600/15 to-gray-900 border-2 border-amber-500 rounded-3xl p-7">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-amber-500 text-gray-950 text-xs font-bold rounded-full px-4 py-1">
                RECOMENDADO · 17% OFF
              </div>
              <p className="text-amber-400 font-medium">Anual</p>
              <div className="mt-3 flex items-end gap-2">
                <span className="text-4xl font-bold">R$ 1.000</span>
                <span className="text-gray-400 mb-1">/ano</span>
              </div>
              <p className="text-gray-300 text-sm mt-1">
                R$ 83,33/mês · <span className="line-through text-gray-500">R$ 1.200</span>{' '}
                <span className="text-emerald-400 font-semibold">economize R$ 200</span>
              </p>
              <p className="text-gray-500 text-sm mt-1">≈ R$ 2,74 por dia</p>
              <div className="mt-3 inline-block bg-emerald-900/40 text-emerald-300 rounded-full px-3 py-1 text-xs">
                💠 No Pix ou no cartão
              </div>
              <Link href="/cadastro" className="mt-6 block text-center bg-amber-600 hover:bg-amber-500 rounded-xl py-3 font-semibold">
                Quero o anual (17% OFF)
              </Link>
            </div>
          </div>

          {/* incluído em ambos */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 mt-6">
            <p className="font-semibold text-center mb-4">✅ Incluído nos dois planos</p>
            <div className="grid sm:grid-cols-2 gap-x-8 gap-y-2 text-sm text-gray-300 max-w-2xl mx-auto">
              {[
                'Atendimento por IA 24/7 no WhatsApp',
                'Agendamento automático sem choque de horário',
                'Lembretes de véspera e 2h antes + confirmação',
                'Aviso pra você a cada agendamento',
                'Resgate automático de clientes sumidos',
                'Painel com receita e resultados da IA',
                'Cadastro livre de serviços e preços',
                'Importação e reativação da sua base',
                'Seu próprio número (QR ou código)',
                'Troca de número sem perder nada',
              ].map(x => (
                <div key={x} className="flex items-start gap-2">
                  <span className="text-emerald-400 mt-0.5">✓</span>
                  <span>{x}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="max-w-3xl mx-auto px-4 py-16">
        <h2 className="text-3xl font-bold text-center">Perguntas frequentes</h2>
        <div className="mt-8 space-y-3">
          {FAQ.map((f, i) => {
            const aberta = faqAberta === i
            return (
              <div key={i} className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                <button
                  onClick={() => setFaqAberta(aberta ? null : i)}
                  className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left font-medium hover:bg-gray-800/50"
                >
                  {f.q}
                  <span className={`text-amber-500 transition-transform ${aberta ? 'rotate-45' : ''}`}>＋</span>
                </button>
                {aberta && <p className="px-5 pb-4 text-gray-400 text-sm leading-relaxed">{f.a}</p>}
              </div>
            )
          })}
        </div>
      </section>

      {/* CTA FINAL */}
      <section className="relative overflow-hidden border-t border-gray-900">
        <div className="absolute inset-0 bg-gradient-to-t from-amber-600/10 to-transparent" />
        <div className="relative max-w-3xl mx-auto px-4 py-20 text-center">
          <h2 className="text-3xl md:text-4xl font-bold leading-tight">
            Seu próximo cliente pode estar te chamando agora
          </h2>
          <p className="text-gray-400 mt-4 text-lg">
            Deixe o BarberIA responder, agendar e trazer cliente de volta — enquanto você corta.
          </p>
          <Link
            href="/cadastro"
            className="inline-block mt-8 bg-amber-600 hover:bg-amber-500 rounded-xl px-8 py-4 font-semibold text-lg"
          >
            ✂️ Cadastrar minha barbearia
          </Link>
          <p className="text-gray-500 text-sm mt-4">
            Ativa em 5 minutos · No seu próprio número · Todos os recursos incluídos
          </p>
        </div>
      </section>

      {/* RODAPÉ */}
      <footer className="border-t border-gray-900">
        <div className="max-w-6xl mx-auto px-4 py-10 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-gray-500">
          <span className="text-gray-300 font-semibold">💈 BarberIA</span>
          <nav className="flex flex-wrap gap-5">
            <a href="#como" className="hover:text-white">Como funciona</a>
            <a href="#recursos" className="hover:text-white">Recursos</a>
            <a href="#precos" className="hover:text-white">Preços</a>
            <Link href="/login" className="hover:text-white">Entrar</Link>
          </nav>
          <span>© 2026 BarberIA</span>
        </div>
      </footer>
    </div>
  )
}
