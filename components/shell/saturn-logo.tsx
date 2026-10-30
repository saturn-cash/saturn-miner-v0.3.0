import { useId } from 'react'
import { cn } from '@/lib/utils'

/**
 * Saturn silhouette: one solid colour (currentColor, gold by default), the ring passing in front of the
 * planet with a thin gap so the shape reads at any size. Same geometry as the app icon.
 */
export function SaturnLogo({ className }: { className?: string }) {
  const id = useId().replace(/:/g, '')
  const ring =
    'M60,512 a452,128 0 1,0 904,0 a452,128 0 1,0 -904,0 Z M142,512 a370,86 0 1,1 740,0 a370,86 0 1,1 -740,0 Z'
  const gap =
    'M38,512 a474,150 0 1,0 948,0 a474,150 0 1,0 -948,0 Z M164,512 a348,64 0 1,1 696,0 a348,64 0 1,1 -696,0 Z'
  return (
    <svg viewBox="0 0 1024 1024" className={cn('size-8 text-primary', className)} aria-hidden="true">
      <defs>
        <clipPath id={`front-${id}`}>
          <rect x="0" y="512" width="1024" height="1024" />
        </clipPath>
        <mask id={`cut-${id}`} maskUnits="userSpaceOnUse" x="0" y="0" width="1024" height="1024">
          <rect width="1024" height="1024" fill="#fff" />
          <g transform="rotate(-22 512 512)">
            <path d={gap} fill="#000" fillRule="evenodd" clipPath={`url(#front-${id})`} />
          </g>
        </mask>
      </defs>
      <g fill="currentColor">
        <g transform="rotate(-22 512 512)">
          <path d={ring} fillRule="evenodd" />
        </g>
        <circle cx="512" cy="512" r="228" mask={`url(#cut-${id})`} />
        <g transform="rotate(-22 512 512)">
          <path d={ring} fillRule="evenodd" clipPath={`url(#front-${id})`} />
        </g>
      </g>
    </svg>
  )
}
