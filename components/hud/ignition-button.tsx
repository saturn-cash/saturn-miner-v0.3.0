'use client'

import { Power } from 'lucide-react'
import { AnimatePresence, motion, useMotionTemplate, useMotionValue, useSpring } from 'motion/react'
import { useMemo } from 'react'
import { minerActions, useMiner } from '@/lib/miner/store'
import { cn } from '@/lib/utils'

const LABELS = {
  idle: 'Start Mining',
  starting: 'Starting…',
  mining: 'Stop Mining',
  stopping: 'Stopping…',
} as const

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
 * The reactor, as liquid glass in the shape of a rounded hexagon. Idle, it is dark smoked glass with
 * a bright glass edge and only a whisper of colour on its rim. Mining, colour floods the glass and
 * glows around it. The highlight follows the pointer, and pressing it squishes like a liquid.
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
              animate={{ opacity: 0.9 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.8 }}
            />
          )}
        </AnimatePresence>


        <motion.button
          type="button"
          onClick={() => (active ? minerActions.stop() : minerActions.start())}
          onPointerMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect()
            px.set(((e.clientX - r.left) / r.width) * 100)
            py.set(Math.min(55, ((e.clientY - r.top) / r.height) * 100))
          }}
          onPointerLeave={() => {
            px.set(36)
            py.set(22)
          }}
          disabled={busy}
          aria-pressed={active}
          aria-label={LABELS[status]}
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
          {/* smoked glass: near-black when off, clearing as the colour comes in */}
          <span
            aria-hidden="true"
            className="absolute inset-0 transition-opacity duration-700"
            style={{ background: 'linear-gradient(180deg, rgb(255 255 255 / 0.07), rgb(255 255 255 / 0.02)), rgb(18 18 22 / 0.55)', opacity: lit ? 0.3 : 1 }}
          />

          {/* liquid colour swimming inside, only while mining */}
          <span aria-hidden="true" className={cn('absolute inset-0 overflow-hidden transition-opacity duration-700', active ? 'opacity-100' : busy ? 'opacity-50' : 'opacity-0')}>
            <span className="absolute inset-[-30%] blur-[14px]" style={{ background: 'conic-gradient(from 0deg, var(--spectrum))', opacity: 0.62, animation: 'radar-spin 7s linear infinite' }} />
            <span
              className="absolute inset-[-20%] mix-blend-screen blur-[10px]"
              style={{
                background: 'radial-gradient(circle at 28% 70%, rgb(255 103 120 / 0.55), transparent 42%), radial-gradient(circle at 75% 35%, rgb(141 159 255 / 0.6), transparent 45%), radial-gradient(circle at 60% 85%, rgb(255 186 113 / 0.5), transparent 40%)',
                opacity: 0.7,
                animation: 'radar-spin 11s linear infinite reverse',
              }}
            />
            <span className="absolute inset-0 bg-[radial-gradient(circle,rgb(10_10_16/0.5)_0%,rgb(10_10_16/0.18)_45%,transparent_70%)]" />
          </span>

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
            className={cn('relative transition-all duration-500', size === 'lg' ? 'size-9' : 'size-7', lit ? 'text-white drop-shadow-[0_0_6px_rgb(255_255_255/0.45)]' : 'text-white/75 group-hover:text-white/95')}
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
