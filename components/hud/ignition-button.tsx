'use client'

import { Power } from 'lucide-react'
import { AnimatePresence, motion, useMotionTemplate, useMotionValue, useSpring } from 'motion/react'
import { useMemo } from 'react'
import { minerActions, useMiner } from '@/lib/miner/store'
import { cn } from '@/lib/utils'

const LABELS = {
  idle: 'Start Mining',
  starting: 'Starting… tap to cancel',
  mining: 'Stop Mining',
  stopping: 'Stopping…',
} as const

/** Little lamps behind the frosted glass that light up while mining (position %, size px, flicker timing, colour). */
const LAMPS = [
  { x: 30, y: 30, s: 38, t: 4.2, d: 0, c: 'rgb(178 110 255)' },
  { x: 70, y: 30, s: 34, t: 5.1, d: 1.3, c: 'rgb(110 140 255)' },
  { x: 50, y: 74, s: 40, t: 4.7, d: 0.6, c: 'rgb(255 80 104)' },
  { x: 22, y: 60, s: 30, t: 3.8, d: 2.1, c: 'rgb(255 140 220)' },
  { x: 78, y: 62, s: 32, t: 4.4, d: 0.9, c: 'rgb(255 170 70)' },
  { x: 50, y: 20, s: 26, t: 5.6, d: 1.8, c: 'rgb(190 110 255)' },
]

/** A hexagon (Saturn's north-pole storm) with softly rounded corners, as an SVG path in pixels. */
function roundedHex(s: number, radius: number) {
  const v: [number, number][] = [
    [0.25, 0.04], [0.75, 0.04], [1, 0.5], [0.75, 0.96], [0.25, 0.96], [0, 0.5],
  ].map(([x, y]) => [x * s, y * s])
  let d = ''
  v.forEach((p, i) => {
    const prev = v[(i + v.length - 1) % v.length]
    const next = v[(i + 1) % v.length]
    const toward = (a: [number, number], b: [number, number]) => {
      const len = Math.hypot(b[0] - a[0], b[1] - a[1])
      const t = Math.min(radius, len / 2) / len
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
    }
    const a = toward(p, prev)
    const b = toward(p, next)
    d += `${i === 0 ? 'M' : 'L'}${a[0].toFixed(2)},${a[1].toFixed(2)} Q${p[0].toFixed(2)},${p[1].toFixed(2)} ${b[0].toFixed(2)},${b[1].toFixed(2)} `
  })
  return d + 'Z'
}

/**
 * The reactor, as liquid glass in the shape of a rounded hexagon, frosted white like an old indicator
 * lamp. Off, the lamps behind the frost are dark. Mining, they light up in colour and glow through it. The highlight follows the pointer, and pressing it squishes like a liquid.
 */
export function IgnitionButton({ size = 'lg' }: { size?: 'lg' | 'md' }) {
  const status = useMiner((s) => s.status)
  const active = status === 'mining'
  const busy = status === 'starting' || status === 'stopping'
  const lit = active || busy
  const d = size === 'lg' ? 116 : 86
  const box = size === 'lg' ? 156 : 116

  const { path, clip, rimMask } = useMemo(() => {
    const path = roundedHex(d, d * 0.14)
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${d}' height='${d}'><path d='${path}' fill='none' stroke='white' stroke-width='${size === 'lg' ? 4 : 3.5}'/></svg>`
    return { path, clip: `path('${path}')`, rimMask: `url("data:image/svg+xml,${encodeURIComponent(svg)}")` }
  }, [d, size])

  // the highlight drifts toward the pointer, like light catching a curved surface
  const px = useMotionValue(36)
  const py = useMotionValue(22)
  const sx = useSpring(px, { stiffness: 160, damping: 20 })
  const sy = useSpring(py, { stiffness: 160, damping: 20 })
  const sheen = useMotionTemplate`radial-gradient(55% 42% at ${sx}% ${sy}%, rgb(255 255 255 / 0.22), rgb(255 255 255 / 0.04) 55%, transparent 75%)`

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative grid place-items-center" style={{ width: box, height: box }}>
        {/* orbit: a fine dashed hex frame that turns slowly while mining */}
        <motion.svg
          viewBox="0 0 100 100"
          className="absolute inset-0"
          aria-hidden="true"
          animate={{ rotate: active ? 360 : 0 }}
          transition={active ? { duration: 24, repeat: Infinity, ease: 'linear' } : { duration: 0.9, ease: 'easeOut' }}
        >
          <polygon points="50,3 90.7,26.5 90.7,73.5 50,97 9.3,73.5 9.3,26.5" fill="none" stroke="white" strokeOpacity={active ? 0.22 : 0.12} strokeWidth="0.5" strokeDasharray="1 3" />
        </motion.svg>

        {/* colour bleeding out around the glass while mining */}
        <AnimatePresence>
          {lit && (
            <motion.span
              key="glow"
              aria-hidden="true"
              className="spectrum-fill absolute rounded-full blur-[26px]"
              style={{ width: d * 1.12, height: d * 1.12, animation: 'spectrum-turn 5s linear infinite, spectrum-breathe 3.2s ease-in-out infinite' }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.8 }}
            />
          )}
        </AnimatePresence>


        <motion.button
          type="button"
          onClick={() => (active || status === 'starting' ? minerActions.stop() : minerActions.start())}
          onPointerMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect()
            px.set(((e.clientX - r.left) / r.width) * 100)
            py.set(Math.min(55, ((e.clientY - r.top) / r.height) * 100))
          }}
          onPointerLeave={() => {
            px.set(36)
            py.set(22)
          }}
          disabled={status === 'stopping'}
          aria-pressed={active}
          aria-label={status === 'starting' ? 'Cancel start' : LABELS[status]}
          whileHover={{ scale: 1.03 }}
          // squish like a drop of liquid
          whileTap={{ scaleX: 1.05, scaleY: 0.95 }}
          transition={{ type: 'spring', stiffness: 520, damping: 14, mass: 0.7 }}
          className="group relative z-10 grid place-items-center outline-none disabled:cursor-wait"
          style={{
            width: d,
            height: d,
            clipPath: clip,
            backdropFilter: 'blur(14px) saturate(180%)',
            WebkitBackdropFilter: 'blur(14px) saturate(180%)',
          }}
        >
          {/* Milk glass, like an old indicator lamp: a thin frosted white diffuser over little lamps.
              Off, the lamps are dark and it is plain white glass. Mining, the lamps light up in colour
              and glow through the frost, with liquid colour swimming behind them. */}
          <span aria-hidden="true" className="absolute inset-0 transition-colors duration-700" style={{ background: lit ? 'rgb(255 255 255 / 0.10)' : 'rgb(236 238 244 / 0.30)' }} />

          {/* liquid colour swimming behind the frost, only while mining */}
          <span aria-hidden="true" className={cn('absolute inset-0 overflow-hidden transition-opacity duration-700', active ? 'opacity-100' : busy ? 'opacity-50' : 'opacity-0')}>
            <span className="absolute inset-[-30%] blur-[14px]" style={{ background: 'conic-gradient(from 0deg, var(--spectrum))', opacity: 0.85, animation: 'radar-spin 7s linear infinite' }} />
          </span>

          {/* the lamps behind the diffuser: dark when off, glowing when mining */}
          <span aria-hidden="true" className={cn('absolute inset-0 transition-opacity duration-1000', active ? 'opacity-100' : busy ? 'opacity-40' : 'opacity-0')}>
            {LAMPS.map((l, i) => (
              <span
                key={i}
                className="absolute rounded-full"
                style={{
                  left: `${l.x}%`,
                  top: `${l.y}%`,
                  width: l.s,
                  height: l.s,
                  marginLeft: -l.s / 2,
                  marginTop: -l.s / 2,
                  background: `radial-gradient(circle, rgb(255 255 255), ${l.c} 30%, transparent 72%)`,
                  filter: 'blur(3px) saturate(1.3)',
                  animation: `lamp-flicker ${l.t}s ease-in-out ${l.d}s infinite`,
                }}
              />
            ))}
          </span>

          {/* the frosted white layer: always there, a little thinner while lit so the colour shows */}
          <span
            aria-hidden="true"
            className="absolute inset-0 transition-opacity duration-700"
            style={{
              background:
                lit
                  ? 'radial-gradient(circle at 50% 40%, rgb(255 255 255 / 0.56), rgb(238 238 244 / 0.40) 70%), linear-gradient(180deg, rgb(255 255 255 / 0.16), rgb(210 210 220 / 0.08))'
                  : 'radial-gradient(circle at 50% 38%, rgb(255 255 255 / 0.92), rgb(244 245 250 / 0.80) 72%), linear-gradient(180deg, rgb(255 255 255 / 0.30), rgb(228 230 238 / 0.18))',
              backdropFilter: 'blur(5px)',
              WebkitBackdropFilter: 'blur(5px)',
              opacity: lit ? 0.28 : 1,
            }}
          />
          {/* fine frosting grain */}
          <span
            aria-hidden="true"
            className="absolute inset-0 opacity-[0.22] mix-blend-overlay"
            style={{
              backgroundImage:
                "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='96' height='96'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='1.6' numOctaves='2' seed='7'/%3E%3C/filter%3E%3Crect width='96' height='96' filter='url(%23n)'/%3E%3C/svg%3E\")",
            }}
          />

          {/* the spectrum rim: a faint whisper when off, full colour when mining */}
          <span
            aria-hidden="true"
            className={cn('spectrum-fill absolute inset-0 transition-opacity duration-700', lit ? 'opacity-90' : 'opacity-20 group-hover:opacity-40')}
            data-speed={active ? undefined : 'slow'}
            style={{ WebkitMaskImage: rimMask, maskImage: rimMask }}
          />

          {/* glass edge: bright where the light bends, top-left and bottom-right */}
          <svg aria-hidden="true" className="pointer-events-none absolute inset-0" width={d} height={d} viewBox={`0 0 ${d} ${d}`}>
            <defs>
              <linearGradient id={`lg-edge-${size}`} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="white" stopOpacity="0.7" />
                <stop offset="0.4" stopColor="white" stopOpacity="0.22" />
                <stop offset="0.7" stopColor="white" stopOpacity="0.14" />
                <stop offset="1" stopColor="white" stopOpacity="0.4" />
              </linearGradient>
              <linearGradient id={`lg-pool-${size}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0.6" stopColor="white" stopOpacity="0" />
                <stop offset="1" stopColor="white" stopOpacity="0.06" />
              </linearGradient>
            </defs>
            {/* light pooling in the bottom of the glass */}
            <path d={path} fill={`url(#lg-pool-${size})`} />
            <path d={path} fill="none" stroke={`url(#lg-edge-${size})`} strokeWidth="1.6" />
          </svg>

          {/* specular highlight, following the pointer */}
          <motion.span aria-hidden="true" className="pointer-events-none absolute inset-0 mix-blend-overlay" style={{ background: sheen }} />

          <Power
            className={cn('relative transition-all duration-500', size === 'lg' ? 'size-9' : 'size-7', lit ? 'text-white drop-shadow-[0_0_6px_rgb(255_255_255/0.45)]' : 'text-[rgb(70_72_84)]/80 group-hover:text-[rgb(50_52_64)]/90')}
            strokeWidth={2}
            aria-hidden="true"
          />
        </motion.button>
      </div>
      <AnimatePresence mode="wait">
        <motion.span key={status} initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -3 }} className="t-headline text-white/80">
          {LABELS[status]}
        </motion.span>
      </AnimatePresence>
    </div>
  )
}
