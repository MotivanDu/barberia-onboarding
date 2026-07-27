'use client'

import { useState } from 'react'

const AZUL = '#1c52f8'

/**
 * Logo oficial do BarberIA.
 * - tema claro  -> /logo-light.png (arquivo "Marca BarberIA branco")
 * - tema escuro -> /logo-dark.png  (arquivo "Marca BarberIA escuro")
 * Enquanto os arquivos não existem em /public, cai no texto "BarberIA".
 */
export default function Logo({ theme = 'light', className = 'h-9 w-auto' }: { theme?: 'light' | 'dark'; className?: string }) {
  const [erro, setErro] = useState(false)
  const src = theme === 'dark' ? '/logo-dark.png' : '/logo-light.png'

  if (erro) {
    return (
      <span className="font-extrabold tracking-tight text-xl" style={{ color: theme === 'dark' ? '#f5f6f8' : '#16181d' }}>
        Barber<span style={{ color: AZUL }}>IA</span>
      </span>
    )
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="BarberIA" className={className} onError={() => setErro(true)} />
}
