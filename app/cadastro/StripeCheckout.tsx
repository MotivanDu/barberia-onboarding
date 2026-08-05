'use client'
import { useState } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'

function Form({ codigo }: { codigo: string }) {
  const stripe = useStripe()
  const elements = useElements()
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')

  const pagar = async () => {
    if (!stripe || !elements) return
    setLoading(true)
    setErro('')
    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/cadastro/sucesso?codigo=${codigo}`,
      },
    })
    // Se der certo, o Stripe redireciona pro return_url. Só chega aqui se houve erro.
    if (error) {
      setErro(error.message || 'Não foi possível concluir o pagamento. Tente novamente.')
      setLoading(false)
    }
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
        {loading ? 'Processando...' : 'Pagar e ativar'}
      </button>
      <p className="text-xs text-[#5b6472] text-center">🔒 Pagamento seguro processado pela Stripe.</p>
    </div>
  )
}

export default function StripeCheckout({
  clientSecret,
  pk,
  codigo,
}: {
  clientSecret: string
  pk: string
  codigo: string
}) {
  // loadStripe uma vez só (guardado no state pra não recriar a cada render)
  const [stripePromise] = useState(() => loadStripe(pk))
  return (
    <Elements
      stripe={stripePromise}
      options={{
        clientSecret,
        appearance: { theme: 'stripe', variables: { colorPrimary: '#1c52f8', borderRadius: '10px' } },
      }}
    >
      <Form codigo={codigo} />
    </Elements>
  )
}
