'use client'
import { useState } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'

function Form({ codigo, onPago }: { codigo: string; onPago: () => void }) {
  const stripe = useStripe()
  const elements = useElements()
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')

  const pagar = async () => {
    if (!stripe || !elements) return
    setLoading(true)
    setErro('')
    // redirect: 'if_required' → cartão confirma SEM sair do site (o fluxo continua
    // aqui mesmo, indo pras próximas telas). Só métodos que exigem redirect (ex.: Pix)
    // usam o return_url — e aí caem na página de sucesso.
    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/cadastro/sucesso?codigo=${codigo}`,
      },
      redirect: 'if_required',
    })
    if (error) {
      setErro(error.message || 'Não foi possível concluir o pagamento. Tente novamente.')
      setLoading(false)
      return
    }
    // Cartão aprovado (ou em processamento) sem redirect → segue o cadastro
    if (paymentIntent && (paymentIntent.status === 'succeeded' || paymentIntent.status === 'processing')) {
      onPago()
      return
    }
    setLoading(false)
  }

  return (
    <div className="space-y-4">
      <PaymentElement />
      {erro && <p className="text-sm text-red-600 text-left">{erro}</p>}
      <button
        onClick={pagar}
        disabled={!stripe || loading}
        className="w-full bg-[#1c52f8] hover:bg-[#1746d8] text-white disabled:opacity-50 rounded-xl py-4 font-bold text-lg"
      >
        {loading ? 'Processando...' : 'Pagar e continuar'}
      </button>
      <p className="text-xs text-[#5b6472] text-center">🔒 Pagamento seguro processado pela Stripe.</p>
    </div>
  )
}

export default function StripeCheckout({
  clientSecret,
  pk,
  codigo,
  onPago,
}: {
  clientSecret: string
  pk: string
  codigo: string
  onPago: () => void
}) {
  const [stripePromise] = useState(() => loadStripe(pk))
  return (
    <Elements
      stripe={stripePromise}
      options={{
        clientSecret,
        appearance: { theme: 'stripe', variables: { colorPrimary: '#1c52f8', borderRadius: '10px' } },
      }}
    >
      <Form codigo={codigo} onPago={onPago} />
    </Elements>
  )
}
