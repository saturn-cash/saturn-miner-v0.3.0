'use client'

import dynamic from 'next/dynamic'

export const ClientApp = dynamic(() => import('./app-shell'), {
  ssr: false,
  loading: () => <div className="h-dvh bg-[#020308]" />,
})
