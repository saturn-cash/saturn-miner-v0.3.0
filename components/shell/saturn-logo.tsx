import { cn } from '@/lib/utils'

export function SaturnLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={cn('size-8', className)} aria-hidden="true">
      <defs>
        <linearGradient id="saturn-logo-body" x1="0.2" x2="0.9" y1="0" y2="1">
          <stop offset="0%" stopColor="#fff1d6" />
          <stop offset="55%" stopColor="#f2b66d" />
          <stop offset="100%" stopColor="#9a5626" />
        </linearGradient>
        <linearGradient id="saturn-logo-ring" x1="0" x2="1">
          <stop offset="0%" stopColor="#5fe3d0" />
          <stop offset="50%" stopColor="#f2b66d" />
          <stop offset="100%" stopColor="#e86bd8" />
        </linearGradient>
      </defs>
      <g transform="rotate(-20 24 24)">
        <path d="M2.5 24 A21.5 6.5 0 0 1 45.5 24" fill="none" stroke="url(#saturn-logo-ring)" strokeWidth="2.2" strokeLinecap="round" opacity="0.45" />
      </g>
      <circle cx="24" cy="24" r="11" fill="url(#saturn-logo-body)" />
      <path d="M13.6 20.5 h20.8 M13.1 25.5 h21.8" stroke="#7a3f18" strokeOpacity="0.35" strokeWidth="1.3" />
      <path d="M20.5 14.2 l3.5 -1.2 l3.5 1.2 l0 2.6 l-3.5 1.2 l-3.5 -1.2 z" fill="#5fe3d0" opacity="0.75" />
      <g transform="rotate(-20 24 24)">
        <path d="M2.5 24 A21.5 6.5 0 0 0 45.5 24" fill="none" stroke="url(#saturn-logo-ring)" strokeWidth="2.6" strokeLinecap="round" />
      </g>
    </svg>
  )
}
