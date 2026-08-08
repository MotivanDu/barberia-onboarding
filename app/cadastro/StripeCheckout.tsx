'use client'
import { useState } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'

type IntentResp = { clientSecret: string } | { erro: string }

function Form({
  validar,
  criarIntent,
  onPago,
}: {
  validar: () => string | null
  criarIntent: () => Promise<IntentResp>
  onPago: () => void
}) {
  const stripe = useStripe()
  const elements = useElements()
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')

  const pagar = async () => {
    if (!stripe || !elements) return
    setErro('')
    // 1) valida os dados da barbearia ANTES de tudo
    const errDados = validar()
    if (errDados) { setErro(errDados); return }
    setLoading(true)
    // 2) valida o cartão (fluxo deferred exige submit antes de criar a cobrança)
    const { error: submitErr } = await elements.submit()
    if (submitErr) { setErro(submitErr.message || 'Confira os dados do cartão.'); setLoading(false); return }
    // 3) cria a barbearia + a cobrança no servidor
    const r = await criarIntent()
    if ('erro' in r) { setErro(r.erro); setLoading(false); return }
    // 4) confirma o pagamento com o segredo da cobrança recém-criada
    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      clientSecret: r.clientSecret,
      confirmParams: { return_url: `${window.location.origin}/cadastro/sucesso` },
      redirect: 'if_required',
    })
    if (error) { setErro(error.message || 'Não foi possível concluir o pagamento. Tente novamente.'); setLoading(false); return }
    if (paymentIntent && (paymentIntent.status === 'succeeded' || paymentIntent.status === 'processing')) {
      onPago()
      return
    }
    setLoading(false)
  }

  return (
    <div className="space-y-4">
      <PaymentElement options={{ layout: 'tabs' }} />
      {erro && <p className="text-sm text-red-600 text-left">{erro}</p>}
      <button
        onClick={pagar}
        disabled={!stripe || loading}
        className="w-full bg-[#1c52f8] hover:bg-[#1746d8] text-white disabled:opacity-50 rounded-xl py-4 font-bold text-lg"
      >
        {loading ? 'Processando...' : 'Pagar e ativar'}
      </button>
      <p className="text-xs text-[#5b6472] text-center">🔒 Pagamento seguro processado pela Stripe.</p>
    </div>
  )
}

// Checkout "deferred": o campo do cartão aparece JÁ (sem cobrança pré-criada).
// A cobrança nasce no clique "Pagar" (criarIntent) e é confirmada na hora.
export default function StripeCheckout({
  pk,
  mode,
  amountCents,
  validar,
  criarIntent,
  onPago,
}: {
  pk: string
  mode: 'payment' | 'subscription'
  amountCents: number
  validar: () => string | null
  criarIntent: () => Promise<IntentResp>
  onPago: () => void
}) {
  const [stripePromise] = useState(() => loadStripe(pk))
  return (
    <Elements
      stripe={stripePromise}
      options={{
        mode,
        amount: amountCents,
        currency: 'brl',
        appearance: { theme: 'stripe', variables: { colorPrimary: '#1c52f8', borderRadius: '10px' } },
      }}
    >
      <Form validar={validar} criarIntent={criarIntent} onPago={onPago} />
    </Elements>
  )
}
