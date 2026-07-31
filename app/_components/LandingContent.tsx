'use client'

import Link from 'next/link'
import { useState } from 'react'
import Logo from './Logo'

const AZUL = '#1c52f8'

/* ---------------- dados (edite aqui e vale nos DOIS temas) ---------------- */
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
  { q: 'A IA responde de forma natural?', a: 'Sim. Ela conversa como uma pessoa, entende gíria e vai direto ao ponto: preço, horário e agendamento, sem enrolação.' },
  { q: 'Funciona no iPhone?', a: 'Funciona. A conexão pode ser feita por QR Code ou por um código de 8 dígitos, que é o jeito mais fácil no iPhone.' },
  { q: 'Como funciona o atendimento da minha barbearia?', a: 'O BarberIA cuida da sua barbearia como um todo: você cadastra a barbearia (serviços, preços e horários) e a IA atende os clientes e marca na agenda da barbearia. É a barbearia completa, num só lugar.' },
  { q: 'Preciso entender de tecnologia?', a: 'Não. O cadastro leva 5 minutos e é tudo pelo celular. Depois disso, a IA cuida do atendimento sozinha.' },
  { q: 'Posso mudar meus preços e serviços depois?', a: 'Quando quiser. Alterou no painel, a IA já passa a usar o valor novo na mesma hora.' },
  { q: 'Como funciona o pagamento?', a: 'No plano mensal você paga no cartão de crédito. No plano anual você paga no Pix à vista ou parcela no cartão em até 12x — e ainda economiza 17%.' },
  { q: 'É seguro? Uso o meu WhatsApp mesmo?', a: 'Sim, é o seu número, com uma conexão estável. Se em algum momento cair, você reconecta em segundos sem perder nenhum dado. Recomendamos um número dedicado só da barbearia.' },
]

/* ---------------- componentes ---------------- */
function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm border"
      style={{ background: 'var(--card)', borderColor: 'var(--border)', color: 'var(--muted)' }}
    >
      {children}
    </span>
  )
}
function Bolha({ de, dark, children }: { de: 'cliente' | 'ia'; dark: boolean; children: React.ReactNode }) {
  const meu = de === 'ia'
  return (
    <div className={`flex ${meu ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm leading-snug ${meu ? 'text-white rounded-br-sm' : 'rounded-bl-sm'}`}
        style={meu ? { background: '#25995c' } : { background: dark ? '#1f242b' : '#ffffff', color: 'var(--text)', border: '1px solid var(--border)' }}
      >
        {children}
      </div>
    </div>
  )
}

/* ---------------- conteúdo compartilhado (recebe o tema) ---------------- */
export default function LandingContent({ theme }: { theme: 'light' | 'dark' }) {
  const dark = theme === 'dark'
  const [faqAberta, setFaqAberta] = useState<number | null>(0)

  const t = dark
    ? { bg: '#0a0b0d', soft: '#101216', card: '#16181d', text: '#f5f6f8', muted: '#9aa1ac', border: '#23262b' }
    : { bg: '#f6f6f4', soft: '#eef0f4', card: '#ffffff', text: '#16181d', muted: '#5b6472', border: '#e5e7eb' }

  const vars = {
    ['--bg' as string]: t.bg,
    ['--soft' as string]: t.soft,
    ['--card' as string]: t.card,
    ['--text' as string]: t.text,
    ['--muted' as string]: t.muted,
    ['--border' as string]: t.border,
  } as React.CSSProperties

  const btnPrimary = 'rounded-xl font-semibold text-white transition-colors'
  const primaryStyle = { background: AZUL }

  return (
    <div style={{ ...vars, background: 'var(--bg)', color: 'var(--text)' }} className="min-h-screen">
      {/* NAV */}
      <header className="sticky top-0 z-40 backdrop-blur border-b" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}>
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <Logo theme={theme} className="h-8 w-auto" />
          <nav className="hidden md:flex items-center gap-6 text-sm" style={{ color: 'var(--muted)' }}>
            <a href="#como" className="hover:opacity-70">Como funciona</a>
            <a href="#recursos" className="hover:opacity-70">Recursos</a>
            <a href="#precos" className="hover:opacity-70">Preços</a>
            <Link href="/login" className="hover:opacity-70">Entrar</Link>
          </nav>
          <Link href="/cadastro?plano=anual" className={`${btnPrimary} px-4 py-2 text-sm`} style={primaryStyle}>
            Assinar
          </Link>
        </div>
      </header>

      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="max-w-6xl mx-auto px-4 pt-16 pb-14 grid md:grid-cols-2 gap-10 items-center">
          <div>
            <div className="inline-block rounded-full px-3 py-1 text-xs font-semibold mb-5" style={{ background: 'rgba(28,82,248,0.10)', color: AZUL }}>
              Atendimento automático pra barbearia no WhatsApp
            </div>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight leading-[1.1]">
              Atende, agenda e <span style={{ color: AZUL }}>traz seus clientes de volta</span> — 24h no WhatsApp
            </h1>
            <p className="text-lg mt-5 leading-relaxed" style={{ color: 'var(--muted)' }}>
              Enquanto você está com a máquina na mão, o BarberIA responde cada cliente na hora,
              marca o horário sozinho e ainda chama de volta quem sumiu. Você só corta.
            </p>
            <div className="flex flex-wrap gap-3 mt-7">
              <Link href="/cadastro?plano=anual" className={`${btnPrimary} px-6 py-4 text-lg`} style={primaryStyle}>
                ✂️ Cadastrar minha barbearia
              </Link>
              <a href="#precos" className="rounded-xl px-6 py-4 font-semibold text-lg border" style={{ borderColor: 'var(--border)', color: 'var(--text)', background: 'var(--card)' }}>
                Ver os planos
              </a>
            </div>
            <p className="text-sm mt-4" style={{ color: 'var(--muted)' }}>Ativa em 5 minutos · No seu próprio número</p>
          </div>

          {/* mockup conversa */}
          <div className="mx-auto w-full max-w-sm">
            <div className="rounded-[2rem] p-3 shadow-xl border" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
              <div className="rounded-[1.5rem] overflow-hidden" style={{ background: dark ? '#0b141a' : '#eae6df' }}>
                <div className="px-4 py-3 flex items-center gap-3" style={{ background: '#1f7a52' }}>
                  <div className="w-9 h-9 rounded-full grid place-items-center text-lg" style={{ background: '#155e3f' }}>💈</div>
                  <div>
                    <p className="font-semibold text-sm leading-tight text-white">Barbearia do Zé</p>
                    <p className="text-xs" style={{ color: '#bfe3d0' }}>online agora</p>
                  </div>
                </div>
                <div className="p-3 space-y-2 min-h-[320px]">
                  <Bolha de="cliente" dark={dark}>opa, quanto tá o degradê com barba?</Bolha>
                  <Bolha de="ia" dark={dark}>Fala, Carlos! 💈 Degradê + barba fica <b>R$ 55</b>. Quer que eu já marque? Amanhã tenho 15h ou 16h30.</Bolha>
                  <Bolha de="cliente" dark={dark}>amanhã 16h30 então</Bolha>
                  <Bolha de="ia" dark={dark}>Fechado! ✅ Degradê + barba, amanhã às <b>16h30</b>. Te lembro na véspera. Até lá! 🙌</Bolha>
                </div>
              </div>
            </div>
            <p className="text-center text-sm mt-3" style={{ color: 'var(--muted)' }}>
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
      <section className="border-y" style={{ background: 'var(--soft)', borderColor: 'var(--border)' }}>
        <div className="max-w-6xl mx-auto px-4 py-16">
          <h2 className="text-3xl font-bold text-center">Você conhece essa rotina</h2>
          <p className="text-center mt-2" style={{ color: 'var(--muted)' }}>Cada mensagem sem resposta é um corte que foi pro concorrente.</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-10">
            {DORES.map((d, i) => (
              <div key={i} className="rounded-2xl p-5 border" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
                <div className="text-3xl">{d.i}</div>
                <p className="font-semibold mt-3">{d.t}</p>
                <p className="text-sm mt-1 leading-relaxed" style={{ color: 'var(--muted)' }}>{d.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* COMO FUNCIONA */}
      <section id="como" className="max-w-6xl mx-auto px-4 py-16">
        <h2 className="text-3xl font-bold text-center">Funciona em 3 passos</h2>
        <p className="text-center mt-2" style={{ color: 'var(--muted)' }}>Sem instalar nada. Sem manual. Sem complicação.</p>
        <div className="grid md:grid-cols-3 gap-4 mt-10">
          {PASSOS.map(p => (
            <div key={p.n} className="rounded-2xl p-6 border" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
              <div className="w-11 h-11 rounded-full grid place-items-center font-bold text-lg text-white" style={primaryStyle}>{p.n}</div>
              <p className="font-semibold text-lg mt-4">{p.t}</p>
              <p className="text-sm mt-1 leading-relaxed" style={{ color: 'var(--muted)' }}>{p.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* RECURSOS */}
      <section id="recursos" className="border-y" style={{ background: 'var(--soft)', borderColor: 'var(--border)' }}>
        <div className="max-w-6xl mx-auto px-4 py-16">
          <h2 className="text-3xl font-bold text-center">Tudo que o BarberIA faz por você</h2>
          <p className="text-center mt-2" style={{ color: 'var(--muted)' }}>Não é só um robô que responde. É um funcionário que atende, agenda, lembra e recupera cliente.</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-10">
            {RECURSOS.map((r, i) => (
              <div key={i} className="rounded-2xl p-5 border transition-colors" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
                <div className="text-2xl">{r.i}</div>
                <p className="font-semibold mt-3">{r.t}</p>
                <p className="text-sm mt-1 leading-relaxed" style={{ color: 'var(--muted)' }}>{r.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* DIFERENCIAL: RESGATE */}
      <section className="max-w-6xl mx-auto px-4 py-16 grid md:grid-cols-2 gap-10 items-center">
        <div>
          <div className="inline-block rounded-full px-3 py-1 text-xs font-semibold mb-4" style={{ background: 'rgba(37,153,92,0.12)', color: '#1f7a52' }}>
            O que ninguém mais faz
          </div>
          <h2 className="text-3xl font-bold leading-tight">Ele vai atrás do cliente que sumiu</h2>
          <p className="mt-4 leading-relaxed" style={{ color: 'var(--muted)' }}>
            A maioria dos sistemas só atende quem chama. O BarberIA faz o contrário: quando um cliente
            passa do tempo normal sem aparecer — <b style={{ color: 'var(--text)' }}>barba parada +15 dias, corte +30 dias</b> — ele
            manda uma mensagem e reagenda. Cliente que você já ia perder, de volta na cadeira.
          </p>
          <p className="mt-3 leading-relaxed" style={{ color: 'var(--muted)' }}>
            E você vê tudo separado no painel: <b style={{ color: AZUL }}>quantos clientes novos a IA trouxe</b> e
            <b style={{ color: '#1f7a52' }}> quantos ela resgatou</b>.
          </p>
        </div>
        <div className="rounded-2xl p-6 border space-y-3" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>Exemplo real de resgate:</p>
          <Bolha de="ia" dark={dark}>E aí, Rafael! Faz 32 dias que você não passa aqui 💈 Bora renovar o corte? Tenho horário essa semana.</Bolha>
          <Bolha de="cliente" dark={dark}>opa, verdade! pode ser sexta de tarde?</Bolha>
          <Bolha de="ia" dark={dark}>Fechado! ✅ Sexta às 17h. Te espero!</Bolha>
          <div className="rounded-xl p-3 text-sm" style={{ background: 'rgba(37,153,92,0.10)', color: '#1f7a52' }}>
            ♻️ Cliente recuperado sozinho, sem você mexer um dedo.
          </div>
        </div>
      </section>

      {/* DIFERENCIAL: DASHBOARD */}
      <section className="border-y" style={{ background: 'var(--soft)', borderColor: 'var(--border)' }}>
        <div className="max-w-6xl mx-auto px-4 py-16 grid md:grid-cols-2 gap-10 items-center">
          <div className="order-2 md:order-1 grid grid-cols-2 gap-3">
            {[
              { tl: 'Receita no mês', v: 'R$ 8.450', c: 'var(--text)' },
              { tl: 'Novos clientes pela IA', v: '27', c: AZUL },
              { tl: 'Resgatados pela IA', v: '14', c: '#1f7a52' },
              { tl: 'Valor gerado pela IA', v: 'R$ 3.900', c: AZUL },
            ].map((k, i) => (
              <div key={i} className="rounded-2xl p-4 border" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
                <p className="text-xs" style={{ color: 'var(--muted)' }}>{k.tl}</p>
                <p className="text-2xl font-bold mt-1" style={{ color: k.c }}>{k.v}</p>
              </div>
            ))}
          </div>
          <div className="order-1 md:order-2">
            <div className="inline-block rounded-full px-3 py-1 text-xs font-semibold mb-4" style={{ background: 'rgba(28,82,248,0.10)', color: AZUL }}>
              Prova na tela
            </div>
            <h2 className="text-3xl font-bold leading-tight">Você vê, em reais, o quanto ele te dá de retorno</h2>
            <p className="mt-4 leading-relaxed" style={{ color: 'var(--muted)' }}>
              No seu painel: receita do mês e da semana, clientes que a IA trouxe, clientes que ela
              resgatou, ticket médio e o valor exato que a ferramenta gerou. Sem achismo — o número
              na tela mostra que ela se paga.
            </p>
            <p className="text-sm mt-4" style={{ color: 'var(--muted)' }}>*Valores ilustrativos.</p>
          </div>
        </div>
      </section>

      {/* SERVIÇOS */}
      <section className="max-w-6xl mx-auto px-4 py-16 text-center">
        <h2 className="text-3xl font-bold">Do pezinho ao degradê, tudo vira horário marcado</h2>
        <div className="flex flex-wrap justify-center gap-2 mt-8">
          {SERVICOS.map(s => (
            <span key={s} className="rounded-full px-4 py-2 border" style={{ background: 'var(--card)', borderColor: 'var(--border)', color: 'var(--muted)' }}>
              {s}
            </span>
          ))}
        </div>
      </section>

      {/* PREÇOS */}
      <section id="precos" className="border-y" style={{ background: 'var(--soft)', borderColor: 'var(--border)' }}>
        <div className="max-w-5xl mx-auto px-4 py-16">
          <h2 className="text-3xl font-bold text-center">Um valor. Tudo incluído.</h2>
          <p className="text-center mt-3 max-w-2xl mx-auto" style={{ color: 'var(--muted)' }}>
            Todos os recursos do BarberIA por um preço fixo — sem taxas escondidas, sem surpresa no fim do mês.
          </p>
          <p className="text-center mt-5 text-xl font-bold">
            Você só corta. O BarberIA traz o cliente.
          </p>
          <p className="text-center mt-1 max-w-2xl mx-auto" style={{ color: 'var(--muted)' }}>
            Agenda cheia, clientes voltando sozinhos e atendimento no WhatsApp trabalhando por você.
          </p>
          <p className="text-center mt-4" style={{ color: 'var(--muted)' }}>
            Cancele quando quiser no mensal. No plano anual, ganhe{' '}
            <strong style={{ color: AZUL }}>R$ 200 de desconto</strong>.
          </p>

          <div className="grid md:grid-cols-2 gap-5 mt-10 items-start">
            {/* MENSAL */}
            <div className="rounded-3xl p-7 border" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
              <p className="font-medium" style={{ color: 'var(--muted)' }}>Mensal</p>
              <div className="mt-3 flex items-end gap-1">
                <span className="text-4xl font-bold">R$ 100</span>
                <span className="mb-1" style={{ color: 'var(--muted)' }}>/mês</span>
              </div>
              <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>≈ R$ 3,33 por dia</p>
              <div className="mt-3 inline-block rounded-full px-3 py-1 text-xs" style={{ background: 'var(--soft)', color: 'var(--muted)' }}>
                💳 No cartão de crédito
              </div>
              <Link href="/cadastro?plano=mensal" className="mt-6 block text-center rounded-xl py-3 font-semibold border" style={{ borderColor: 'var(--border)', color: 'var(--text)' }}>
                Assinar o mensal
              </Link>
            </div>

            {/* ANUAL */}
            <div className="relative rounded-3xl p-7 border-2" style={{ background: 'var(--card)', borderColor: AZUL }}>
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 text-xs font-bold rounded-full px-4 py-1 text-white" style={primaryStyle}>
                RECOMENDADO · 17% OFF
              </div>
              <p className="font-medium" style={{ color: AZUL }}>Anual</p>
              <div className="mt-3 flex items-end gap-2">
                <span className="text-4xl font-bold">R$ 1.000</span>
                <span className="mb-1" style={{ color: 'var(--muted)' }}>/ano</span>
              </div>
              <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
                R$ 83,33/mês · <span className="line-through">R$ 1.200</span>{' '}
                <span className="font-semibold" style={{ color: '#1f7a52' }}>economize R$ 200</span>
              </p>
              <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>≈ R$ 2,74 por dia</p>
              <div className="mt-3 inline-block rounded-full px-3 py-1 text-xs" style={{ background: 'rgba(28,82,248,0.10)', color: AZUL }}>
                💠 Pix à vista ou cartão em até 12x
              </div>
              <Link href="/cadastro?plano=anual" className={`mt-6 block text-center ${btnPrimary} py-3`} style={primaryStyle}>
                Quero o anual (17% OFF)
              </Link>
            </div>
          </div>

          <div className="rounded-2xl p-6 mt-6 border" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
            <p className="font-semibold text-center mb-4">✅ Incluído nos dois planos</p>
            <div className="grid sm:grid-cols-2 gap-x-8 gap-y-2 text-sm max-w-2xl mx-auto" style={{ color: 'var(--muted)' }}>
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
                  <span className="mt-0.5" style={{ color: '#1f7a52' }}>✓</span>
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
              <div key={i} className="rounded-2xl overflow-hidden border" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
                <button
                  onClick={() => setFaqAberta(aberta ? null : i)}
                  className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left font-medium"
                >
                  {f.q}
                  <span className="transition-transform" style={{ color: AZUL, transform: aberta ? 'rotate(45deg)' : 'none' }}>＋</span>
                </button>
                {aberta && <p className="px-5 pb-4 text-sm leading-relaxed" style={{ color: 'var(--muted)' }}>{f.a}</p>}
              </div>
            )
          })}
        </div>
      </section>

      {/* CTA FINAL */}
      <section className="border-t" style={{ borderColor: 'var(--border)', background: 'var(--soft)' }}>
        <div className="max-w-3xl mx-auto px-4 py-20 text-center">
          <h2 className="text-3xl md:text-4xl font-bold leading-tight">
            Seu próximo cliente pode estar te chamando agora
          </h2>
          <p className="mt-4 text-lg" style={{ color: 'var(--muted)' }}>
            Deixe o BarberIA responder, agendar e trazer cliente de volta — enquanto você corta.
          </p>
          <Link href="/cadastro?plano=anual" className={`inline-block mt-8 ${btnPrimary} px-8 py-4 text-lg`} style={primaryStyle}>
            ✂️ Cadastrar minha barbearia
          </Link>
          <p className="text-sm mt-4" style={{ color: 'var(--muted)' }}>
            Ativa em 5 minutos · No seu próprio número · Todos os recursos incluídos
          </p>
        </div>
      </section>

      {/* RODAPÉ */}
      <footer className="border-t" style={{ borderColor: 'var(--border)' }}>
        <div className="max-w-6xl mx-auto px-4 py-10 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm" style={{ color: 'var(--muted)' }}>
          <Logo theme={theme} className="h-7 w-auto" />
          <nav className="flex flex-wrap gap-5">
            <a href="#como" className="hover:opacity-70">Como funciona</a>
            <a href="#recursos" className="hover:opacity-70">Recursos</a>
            <a href="#precos" className="hover:opacity-70">Preços</a>
            <Link href="/login" className="hover:opacity-70">Entrar</Link>
          </nav>
          <span>© 2026 BarberIA</span>
        </div>
      </footer>
    </div>
  )
}
