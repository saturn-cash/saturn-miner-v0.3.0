/**
 * The website cursor's outline Saturn as a small static mark, for the middle of the flight map and
 * the peers radar. Draws in currentColor; sized by the caller.
 */
export function HoloSaturn({ className, title }: { className?: string; title?: string }) {
  return (
    <svg viewBox="-50 -50 100 100" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" className={className} role={title ? 'img' : undefined} aria-hidden={title ? undefined : true}>
      {title && <title>{title}</title>}
      <defs>
        <clipPath id="hs-disc">
          <circle r="19" />
        </clipPath>
        <mask id="hs-behind" maskUnits="userSpaceOnUse" x="-50" y="-50" width="100" height="100">
          <rect x="-50" y="-50" width="100" height="100" fill="#fff" />
          <path d="M-21,0 A21,21 0 0,1 21,0 Z" fill="#000" />
        </mask>
      </defs>
      <g transform="rotate(-20)">
        <g mask="url(#hs-behind)">
          <ellipse rx="45" ry="12.5" />
          <ellipse rx="32" ry="8" strokeWidth={2} opacity={0.7} />
        </g>
        <circle r="19" />
        <g clipPath="url(#hs-disc)" strokeWidth={2} opacity={0.7}>
          <path d="M-19,1 A19,3.5 0 0,0 19,1" />
          <ellipse ry="19" rx="9" />
        </g>
        <path d="M-45,0 A45,12.5 0 0,0 45,0" />
        <path d="M-32,0 A32,8 0 0,0 32,0" strokeWidth={2} opacity={0.7} />
      </g>
    </svg>
  )
}
