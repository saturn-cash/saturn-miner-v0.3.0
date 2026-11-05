'use client'

import { Power } from 'lucide-react'
import { AnimatePresence, motion, useMotionTemplate, useMotionValue, useSpring } from 'motion/react'
import { minerActions, useMiner } from '@/lib/miner/store'
import { cn } from '@/lib/utils'

const LABELS = {
  idle: 'Start Mining',
  starting: 'Starting…',
  mining: 'Stop Mining',
  stopping: 'Stopping…',
} as const

/**
 * The reactor, as a drop of liquid glass. A round lens that blurs and saturates whatever is behind
 * it, with a bright specular rim, a highlight that follows the pointer, and colour swimming inside.
 * Idle, the colour is a soft iridescent tint; mining, it floods with light and glows around the drop.
 * Pressing it squishes like a liquid.
 */
export function IgnitionButton({ size = 'lg' }: { size?: 'lg' | 'md' }) {
  const status = useMiner((s) => s.status)
  const active = status === 'mining'
  const busy = status === 'starting' || status === 'stopping'
  const lit = active || busy
  const d = size === 'lg' ? 112 : 84
  const box = size === 'lg' ? 156 : 116

  // the highlight drifts toward the pointer, like light catching a curved surface
  const px = useMotionValue(38)
  const py = useMotionValue(26)
  const sx = useSpring(px, { stiffness: 160, damping: 20 })
  const sy = useSpring(py, { stiffness: 160, damping: 20 })
  const sheen = useMotionTemplate`radial-gradient(60% 45% at ${sx}% ${sy}%, rgb(255 255 255 / 0.55), rgb(255 255 255 / 0.08) 55%, transparent 75%)`

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative grid place-items-center" style={{ width: box, height: box }}>
        {/* colour bleeding out around the drop */}
        <span
          aria-hidden="true"
          className="spectrum-fill absolute rounded-full transition-[opacity,filter] duration-700"
          style={{
            width: d * 1.18,
            height: d * 1.18,
            opacity: lit ? 0.95 : 0.35,
            filter: `blur(${lit ? 26 : 20}px)`,
            animation: lit ? 'spectrum-turn 5s linear infinite, spectrum-breathe 3.2s ease-in-out infinite' : 'spectrum-turn 14s linear infinite',
          }}
        />

        <motion.button
          type="button"
          onClick={() => (active ? minerActions.stop() : minerActions.start())}
          onPointerMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect()
            px.set(((e.clientX - r.left) / r.width) * 100)
            py.set(Math.min(55, ((e.clientY - r.top) / r.height) * 100))
          }}
          onPointerLeave={() => {
            px.set(38)
            py.set(26)
          }}
          disabled={busy}
          aria-pressed={active}
          aria-label={LABELS[status]}
          whileHover={{ scale: 1.05 }}
          // squish like a drop of liquid
          whileTap={{ scaleX: 1.1, scaleY: 0.9 }}
          transition={{ type: 'spring', stiffness: 520, damping: 14, mass: 0.7 }}
          className="group relative z-10 grid place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-white/60 disabled:cursor-wait"
          style={{
            width: d,
            height: d,
            backdropFilter: 'blur(14px) saturate(190%) brightness(1.08)',
            WebkitBackdropFilter: 'blur(14px) saturate(190%) brightness(1.08)',
            background: 'radial-gradient(circle at 50% 120%, rgb(255 255 255 / 0.10), rgb(255 255 255 / 0.04) 60%)',
            boxShadow: [
              'inset 0 1.5px 0.5px rgb(255 255 255 / 0.65)', // top lip
              'inset 0 -1px 0.5px rgb(255 255 255 / 0.25)', // bottom lip
              'inset 0 -14px 22px -10px rgb(255 255 255 / 0.22)', // light pooling at the bottom
              'inset 0 10px 18px -12px rgb(0 0 0 / 0.35)',
              '0 10px 30px -8px rgb(0 0 0 / 0.55)',
              '0 1px 2px rgb(0 0 0 / 0.3)',
            ].join(', '),
          }}
        >
          {/* liquid colour swimming inside the lens */}
          <span aria-hidden="true" className="absolute inset-0 overflow-hidden rounded-full">
            <span
              className="absolute inset-[-30%] blur-[14px] transition-opacity duration-700"
              style={{ background: 'conic-gradient(from 0deg, var(--spectrum))', opacity: lit ? 0.62 : 0.3, animation: `radar-spin ${lit ? 7 : 22}s linear infinite` }}
            />
            <span
              className="absolute inset-[-20%] mix-blend-screen blur-[10px] transition-opacity duration-700"
              style={{
                background: 'radial-gradient(circle at 28% 70%, rgb(255 103 120 / 0.55), transparent 42%), radial-gradient(circle at 75% 35%, rgb(141 159 255 / 0.6), transparent 45%), radial-gradient(circle at 60% 85%, rgb(255 186 113 / 0.5), transparent 40%)',
                opacity: lit ? 0.7 : 0.4,
                animation: `radar-spin ${lit ? 11 : 30}s linear infinite reverse`,
              }}
            />
            {/* a glassy centre so the symbol stays readable */}
            <span className="absolute inset-0 bg-[radial-gradient(circle,rgb(10_10_16/0.5)_0%,rgb(10_10_16/0.18)_45%,transparent_70%)]" />
          </span>

          {/* bright rim where the glass bends the light */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-full"
            style={{
              padding: 1.5,
              background: 'conic-gradient(from 200deg, rgb(255 255 255 / 0.9), rgb(255 255 255 / 0.15) 25%, rgb(255 255 255 / 0.05) 45%, rgb(255 255 255 / 0.55) 60%, rgb(255 255 255 / 0.12) 80%, rgb(255 255 255 / 0.9))',
              WebkitMask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)',
              WebkitMaskComposite: 'xor',
              maskComposite: 'exclude',
            }}
          />

          {/* specular highlight, following the pointer */}
          <motion.span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-full mix-blend-overlay" style={{ background: sheen }} />
          <span aria-hidden="true" className="pointer-events-none absolute left-[18%] right-[18%] top-[5%] h-[20%] rounded-[50%] bg-gradient-to-b from-white/30 to-white/0 blur-[1px]" />

          <Power
            className={cn('relative transition-all duration-500', size === 'lg' ? 'size-9' : 'size-7', lit ? 'text-white drop-shadow-[0_0_10px_rgb(255_255_255/0.8)]' : 'text-white/90 drop-shadow-[0_1px_2px_rgb(0_0_0/0.5)] group-hover:text-white')}
            strokeWidth={2.4}
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
