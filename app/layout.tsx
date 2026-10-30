import type { Metadata, Viewport } from 'next'
import '@fontsource-variable/inter/wght.css'
import '@fontsource-variable/jetbrains-mono/wght.css'
import './globals.css'

export const metadata: Metadata = {
  title: 'Saturn Miner',
  description: 'Saturn Miner: a desktop miner for the Saturn Core blockchain that flies you around the Saturn system while you hash.',
  icons: {
    icon: [{ url: '/icon.svg', type: 'image/svg+xml' }],
    apple: '/apple-icon.png',
  },
}

export const viewport: Viewport = {
  colorScheme: 'dark',
  themeColor: '#020308',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="bg-[#020308]">
      <body className="antialiased">
        {children}
      </body>
    </html>
  )
}
