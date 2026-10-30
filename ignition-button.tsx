'use client'

import { Power } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { minerActions, useMiner } from '@/lib/miner/store'
import { cn } from '@/lib/utils'

const LABELS = {
  idle: 'Start mining',
  starting: 'Starting…',
  mining: 'Stop mining',
  stopping: 'Stopping…',
} as const

/**
 * The reactor: a hexagonal core (Saturn's polar storm) inside orbiting hex frames.
 * Off, the core is clear glass. On, it fills with a slowly turning plasma and sends out pulses.
 */
export function IgnitionButton({ size = 'lg' }: { size?: 'lg' | 'md' }) {
  const status = useMiner((s) => s.status)
  const active = status === 'mining'
  const busy = status === 'starting' || status === 'stopping'
  const box = size === 'lg' ? 168 : 120
  const core = size === 'lg' ? 104 : 74

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative grid place-items-center" style={{ width: box, height: box }}>
        {/* orbiting hex frames */}
        <motion.svg
          viewBox="0 0 100 100"
          className="absolute inset-0"
          aria-hidden="true"
          animate={{ rotate: active ? 360 : busy ? 60 : 0 }}
          transition={active ? { duration: 10, repeat: Infinity, ease: 'linear' } : { duration: 0.9, ease: 'easeOut' }}
        >
          <polygon points="50,2 91.6,26 91.6,74 50,98 8.4,74 8.4,26" fill="none" stroke="white" strokeOpacity={active ? 0.55 : 0.28} strokeWidth="0.7" strokeDasharray="3 4" />
          <circle cx="50" cy="2" r="2" fill="var(--primary)" />
        </motion.svg>
        <motion.svg
          viewBox="0 0 100 100"
          className="absolute inset-[10%]"
          aria-hidden="true"
          animate={{ rotate: active ? -360 : 0 }}
          transition={active ? { duration: 16, repeat: Infinity, ease: 'linear' } : { duration: 0.9 }}
        >
          <polygon points="50,4 89.8,27 89.8,73 50,96 10.2,73 10.2,27" fill="none" stroke="var(--accent)" strokeOpacity={active ? 0.55 : 0.2} strokeWidth="0.6" />
          <circle cx="89.8" cy="73" r="1.8" fill="var(--aurora)" opacity={active ? 1 : 0.4} />
        </motion.svg>

        <AnimatePresence>
          {active &&
            [0, 1].map((i) => (
              <motion.span
                key={i}
                aria-hidden="true"
                className="hex absolute bg-primary/25"
                style={{ width: core, height: core }}
                initial={{ scale: 0.9, opacity: 0.7 }}
                animate={{ scale: 1.9, opacity: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 2.4, repeat: Infinity, delay: i * 1.2, ease: 'easeOut' }}
              />
            ))}
        </AnimatePresence>

        <motion.button
          type="button"
          onClick={() => (active ? minerActions.stop() : minerActions.start())}
          disabled={busy}
          aria-pressed={active}
          aria-label={LABELS[status]}
          whileHover={{ scale: 1.06 }}
          whileTap={{ scale: 0.9 }}
          className="group relative z-10 grid place-items-center outline-none focus-visible:[&>.hex-rim]:bg-white disabled:cursor-wait"
          style={{ width: core, height: core }}
        >
          {/* glow behind the clipped core */}
          <span
            aria-hidden="true"
            className={cn('absolute inset-[-10%] rounded-full blur-2xl transition-opacity duration-700', active ? 'opacity-90' : 'bg-white/10 opacity-60 group-hover:opacity-100')}
            style={active ? { background: 'conic-gradient(from 90deg, #ffb46c, #ff7bb0, #c48cff, #6cc8ff, #6cf0d0, #ffe36c, #ffb46c)', animation: 'radar-spin 9s linear infinite' } : undefined}
          />
          {/* rim: bright glass edge */}
          <span aria-hidden="true" className="hex-rim hex absolute inset-0 bg-gradient-to-br from-white/80 via-white/25 to-white/50 transition-colors" />
          {/* body: clear glass when off, iridescent plasma when on */}
          <span aria-hidden="true" className={cn('hex absolute inset-[2px] backdrop-blur-xl transition-colors duration-700', active ? 'bg-[#1a1420]' : 'bg-[rgb(28_28_36/0.55)] group-hover:bg-[rgb(40_40_50/0.55)]')} />
          <span aria-hidden="true" className={cn('hex absolute inset-[2px] overflow-hidden transition-opacity duration-700', active ? 'opacity-100' : 'opacity-0')}>
            {/* two soft spectral layers turning against each other read as liquid light, not a colour wheel */}
            <span
              className="absolute inset-[-40%] blur-[14px] saturate-[1.15]"
              style={{
                background: 'conic-gradient(from 0deg, #ffb46c, #ff7bb0, #c48cff, #6cc8ff, #6cf0d0, #ffe36c, #ffb46c)',
                animation: active ? 'radar-spin 7s linear infinite' : undefined,
              }}
            />
            <span
              className="absolute inset-[-30%] blur-[10px] mix-blend-screen opacity-80"
              style={{
                background: 'conic-gradient(from 180deg, transparent 0deg, #ffffff 40deg, transparent 90deg, #ff9ad5 150deg, transparent 200deg, #8be0ff 260deg, transparent 320deg)',
                animation: active ? 'radar-spin 11s linear infinite reverse' : undefined,
              }}
            />
            <span className="absolute inset-0 bg-[radial-gradient(circle_at_50%_55%,rgb(255_255_255/0.18),transparent_60%)]" />
          </span>
          <span aria-hidden="true" className={cn('hex absolute inset-[6px] transition-colors duration-700', active ? 'bg-[rgb(10_6_16/0.18)]' : 'bg-transparent')} />
          {/* top sheen */}
          <span aria-hidden="true" className="hex absolute inset-[2px] bg-gradient-to-b from-white/20 to-transparent to-45%" />
          <Power className={cn('relative transition-colors duration-500', size === 'lg' ? 'size-9' : 'size-7', active ? 'text-white drop-shadow-[0_1px_6px_rgb(0_0_0/0.6)]' : 'text-white')} strokeWidth={2.4} aria-hidden="true" />
        </motion.button>
      </div>
      <AnimatePresence mode="wait">
        <motion.span key={status} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} className="text-[14px] font-medium text-white/80">
          {LABELS[status]}
        </motion.span>
      </AnimatePresence>
    </div>
  )
}
