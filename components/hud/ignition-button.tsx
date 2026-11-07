'use client'

import { Power } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
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
  { x: 30, y: 30, s: 30, t: 4.2, d: 0, c: 'rgb(188 130 243 / 0.75)' },
  { x: 70, y: 30, s: 26, t: 5.1, d: 1.3, c: 'rgb(141 159 255 / 0.75)' },
  { x: 50, y: 74, s: 32, t: 4.7, d: 0.6, c: 'rgb(255 103 120 / 0.7)' },
  { x: 22, y: 60, s: 22, t: 3.8, d: 2.1, c: 'rgb(245 185 234 / 0.75)' },
  { x: 78, y: 62, s: 24, t: 4.4, d: 0.9, c: 'rgb(255 186 113 / 0.75)' },
  { x: 50, y: 20, s: 18, t: 5.6, d: 1.8, c: 'rgb(198 134 255 / 0.75)' },
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
 * The reactor: a clear Windows Vista glass button in the shape of a rounded hexagon, with little lamps
 * sitting underneath the glass. Off, you see the dark bulbs through the clear glass. Mining, they light
 * up in colour and glow through it. Glossy top half, a dark outer line with a bright inner one, a glow
 * that blooms up from the bottom on hover (Aero blue) or while mining (Saturn gold), and a glint that
 * slides across the glass.
 */
export function IgnitionButton({ size = 'lg' }: { size?: 'lg' | 'md' }) {
  const status = useMiner((s) => s.status)
  const active = status === 'mining'
  const busy = status === 'starting' || status === 'stopping'
  const lit = active || busy
  const d = size === 'lg' ? 116 : 86
  const box = size === 'lg' ? 156 : 116

  const { path, inner, clip } = useMemo(() => {
    const path = roundedHex(d, d * 0.14)
    // the bright inner line sits 1.5px inside the dark outer one
    const inset = 1.6
    const raw = roundedHex(d - inset * 2, (d - inset * 2) * 0.14)
    return { path, inner: raw, clip: `path('${path}')`, inset }
  }, [d])

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
              style={{ width: d * 1.08, height: d * 1.08, animation: 'spectrum-turn 5s linear infinite, spectrum-breathe 3.2s ease-in-out infinite' }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.75 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.8 }}
            />
          )}
        </AnimatePresence>

        <motion.button
          type="button"
          onClick={() => (active || status === 'starting' ? minerActions.stop() : minerActions.start())}
          disabled={status === 'stopping'}
          aria-pressed={active}
          aria-label={status === 'starting' ? 'Cancel start' : LABELS[status]}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          transition={{ type: 'spring', stiffness: 500, damping: 26 }}
          className="vista-orb group relative z-10 grid place-items-center outline-none disabled:cursor-wait"
          data-lit={lit ? '' : undefined}
          style={{
            width: d,
            height: d,
            clipPath: clip,
            backdropFilter: 'blur(6px) saturate(1.4)',
            WebkitBackdropFilter: 'blur(6px) saturate(1.4)',
          }}
        >
          {/* clear smoked glass */}
          <span aria-hidden="true" className="absolute inset-0 transition-colors duration-500" style={{ background: lit ? 'rgb(14 16 24 / 0.38)' : 'rgb(18 22 30 / 0.34)' }} />

          {/* liquid colour swimming under the lamps, only while mining */}
          <span aria-hidden="true" className={cn('absolute inset-0 overflow-hidden transition-opacity duration-700', active ? 'opacity-60' : busy ? 'opacity-30' : 'opacity-0')}>
            <span className="absolute inset-[-30%] blur-[16px]" style={{ background: 'conic-gradient(from 0deg, var(--spectrum))', opacity: 0.5, animation: 'radar-spin 7s linear infinite' }} />
          </span>

          {/* the lamps under the glass: dark little bulbs when off, glowing in colour when mining */}
          {LAMPS.map((l, i) => {
            const s = l.s * 0.62
            return (
              <span key={i} aria-hidden="true" className="absolute" style={{ left: `${l.x}%`, top: `${l.y}%`, width: 0, height: 0 }}>
                {/* the unlit bulb you can see through the clear glass */}
                <span
                  className="absolute rounded-full"
                  style={{
                    width: s * 0.5,
                    height: s * 0.5,
                    left: -s * 0.25,
                    top: -s * 0.25,
                    background: 'radial-gradient(circle at 35% 30%, rgb(255 255 255 / 0.4), rgb(150 154 170 / 0.22) 45%, rgb(0 0 0 / 0.35) 100%)',
                    boxShadow: 'inset 0 0 0 0.5px rgb(255 255 255 / 0.22), 0 0 2px rgb(0 0 0 / 0.5)',
                  }}
                />
                {/* its light: the wrapper fades it in and out, the inner one flickers */}
                <span className={cn('absolute transition-opacity duration-1000', active ? 'opacity-100' : busy ? 'opacity-50' : 'opacity-[0.28] group-hover:opacity-40')} style={{ left: 0, top: 0 }}>
                  <span
                    className="absolute rounded-full"
                    style={{
                      width: l.s * 1.3,
                      height: l.s * 1.3,
                      left: -l.s * 0.65,
                      top: -l.s * 0.65,
                      background: `radial-gradient(circle, rgb(255 255 255 / 0.95), ${l.c} 22%, transparent 68%)`,
                      filter: 'blur(3px)',
                      animation: `lamp-flicker ${l.t}s ease-in-out ${l.d}s infinite`,
                    }}
                  />
                </span>
              </span>
            )
          })}

          {/* glow blooming up from the bottom: Aero blue on hover, Saturn gold while mining */}
          <span
            aria-hidden="true"
            className={cn('absolute transition-all duration-500 ease-out', lit ? 'opacity-90 translate-y-0' : 'opacity-0 translate-y-1/4 group-hover:opacity-100 group-hover:translate-y-0')}
            style={{
              left: '-15%',
              right: '-15%',
              bottom: '-62%',
              height: '120%',
              borderRadius: '50%',
              background: lit
                ? 'radial-gradient(closest-side, rgb(255 196 92 / 0.7), rgb(255 196 92 / 0.2) 55%, transparent)'
                : 'radial-gradient(closest-side, rgb(90 185 255 / 0.75), rgb(90 185 255 / 0.22) 55%, transparent)',
            }}
          />

          {/* the Vista gloss: a bright top half that stops sharply at the middle */}
          <span
            aria-hidden="true"
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(180deg, rgb(255 255 255 / 0.34) 0%, rgb(255 255 255 / 0.13) 48%, rgb(255 255 255 / 0.03) 50%, rgb(255 255 255 / 0.07) 100%)',
            }}
          />

          {/* a glint that slides across the whole glass on hover */}
          <span aria-hidden="true" className="absolute inset-0 overflow-hidden">
            <span
              className="absolute -inset-y-[20%] w-[42%] -left-[70%] rotate-[18deg] transition-[left] duration-700 ease-out group-hover:left-[130%]"
              style={{ background: 'linear-gradient(90deg, transparent, rgb(255 255 255 / 0.18) 30%, rgb(255 255 255 / 0.55) 50%, rgb(255 255 255 / 0.18) 70%, transparent)' }}
            />
          </span>

          {/* edges: a dark outer line and a bright inner one */}
          <svg aria-hidden="true" className="pointer-events-none absolute inset-0" width={d} height={d} viewBox={`0 0 ${d} ${d}`}>
            <path d={path} fill="none" stroke="black" strokeOpacity="0.75" strokeWidth="2.4" />
            <path d={inner} transform="translate(1.6 1.6)" fill="none" stroke="white" strokeOpacity={lit ? 0.55 : 0.42} strokeWidth="1" />
          </svg>

          <Power
            className={cn(
              'relative transition-all duration-500',
              size === 'lg' ? 'size-9' : 'size-7',
              lit ? 'text-white drop-shadow-[0_0_8px_rgb(255_220_160/0.7)]' : 'text-white/85 drop-shadow-[0_1px_2px_rgb(0_0_0/0.8)] group-hover:text-white',
            )}
            strokeWidth={2.2}
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
