'use client'

import { Power } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { minerActions, useMiner } from '@/lib/miner/store'
import { cn } from '@/lib/utils'

const LABELS = {
  idle: 'Start Mining',
  starting: 'Starting…',
  mining: 'Stop Mining',
  stopping: 'Stopping…',
} as const

/**
 * The reactor: a hexagon (Saturn's north-pole storm). Idle, it is clear glass with a faint spectral
 * edge. Mining, light in the Apple Intelligence palette flows around its rim, glows behind it, and
 * drifts through the glass core.
 */
export function IgnitionButton({ size = 'lg' }: { size?: 'lg' | 'md' }) {
  const status = useMiner((s) => s.status)
  const active = status === 'mining'
  const busy = status === 'starting' || status === 'stopping'
  const box = size === 'lg' ? 156 : 116
  const core = size === 'lg' ? 104 : 76
  const rim = size === 'lg' ? 3 : 2.5

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative grid place-items-center" style={{ width: box, height: box }}>
        {/* orbit: a single fine hex frame that turns slowly while mining */}
        <motion.svg
          viewBox="0 0 100 100"
          className="absolute inset-0"
          aria-hidden="true"
          animate={{ rotate: active ? 360 : 0 }}
          transition={active ? { duration: 24, repeat: Infinity, ease: 'linear' } : { duration: 0.9, ease: 'easeOut' }}
        >
          <polygon points="50,3 90.7,26.5 90.7,73.5 50,97 9.3,73.5 9.3,26.5" fill="none" stroke="white" strokeOpacity={active ? 0.22 : 0.12} strokeWidth="0.5" strokeDasharray="1 3" />
        </motion.svg>

        {/* glow behind the core */}
        <AnimatePresence>
          {(active || busy) && (
            <motion.span
              key="glow"
              aria-hidden="true"
              className="spectrum-fill absolute rounded-full blur-[26px]"
              style={{ width: core * 1.15, height: core * 1.15, animation: 'spectrum-turn 6s linear infinite, spectrum-breathe 3.2s ease-in-out infinite' }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.8 }}
            />
          )}
        </AnimatePresence>

        <motion.button
          type="button"
          onClick={() => (active ? minerActions.stop() : minerActions.start())}
          disabled={busy}
          aria-pressed={active}
          aria-label={LABELS[status]}
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.94 }}
          transition={{ type: 'spring', stiffness: 400, damping: 22 }}
          className="group relative z-10 grid place-items-center outline-none disabled:cursor-wait"
          style={{ width: core, height: core }}
        >
          {/* rim: spectrum when mining, faint spectrum when idle */}
          <span aria-hidden="true" className={cn('spectrum-fill hex absolute inset-0 transition-opacity duration-700', active || busy ? 'opacity-100' : 'opacity-30 group-hover:opacity-55')} data-speed={active ? undefined : 'slow'} />
          {/* glass core */}
          <span aria-hidden="true" className="hex absolute bg-[#0e0e12]" style={{ inset: rim }} />
          {/* liquid light drifting through the core */}
          <span aria-hidden="true" className={cn('hex absolute overflow-hidden transition-opacity duration-700', active ? 'opacity-100' : busy ? 'opacity-50' : 'opacity-0')} style={{ inset: rim }}>
            <span className="absolute inset-[-35%] blur-[16px]" style={{ background: 'conic-gradient(from 0deg, var(--spectrum))', opacity: 0.62, animation: active ? 'radar-spin 9s linear infinite' : undefined }} />
            <span className="absolute inset-[-25%] mix-blend-screen blur-[12px]" style={{ background: 'radial-gradient(circle at 30% 30%, rgb(255 255 255 / 0.35), transparent 45%), radial-gradient(circle at 72% 70%, rgb(141 159 255 / 0.4), transparent 50%)', animation: active ? 'radar-spin 14s linear infinite reverse' : undefined }} />
            {/* darken the centre so the symbol reads */}
            <span className="absolute inset-0 bg-[radial-gradient(circle,rgb(14_14_18/0.55)_0%,transparent_70%)]" />
          </span>
          {/* top sheen, like a glass button */}
          <span aria-hidden="true" className="hex absolute bg-gradient-to-b from-white/[0.14] to-transparent to-50%" style={{ inset: rim }} />
          <Power
            className={cn('relative transition-all duration-500', size === 'lg' ? 'size-8' : 'size-6', active ? 'text-white drop-shadow-[0_0_8px_rgb(255_255_255/0.7)]' : 'text-white/85 group-hover:text-white')}
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
