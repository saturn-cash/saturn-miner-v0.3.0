'use client'

import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo } from 'react'
import { clearCelebration, useCelebration } from '@/lib/cosmos/store'
import { formatInt } from '@/lib/format'

/** Finding a block is rare. When it happens, the whole screen should know. */
export function Supernova() {
  const c = useCelebration()

  useEffect(() => {
    if (!c) return
    const t = setTimeout(clearCelebration, 5200)
    return () => clearTimeout(t)
  }, [c])

  const sparks = useMemo(
    () =>
      Array.from({ length: 56 }, (_, i) => {
        const a = (i / 56) * Math.PI * 2 + Math.random() * 0.2
        const d = 30 + Math.random() * 60
        return { x: Math.cos(a) * d, y: Math.sin(a) * d, s: 3 + Math.random() * 6, hue: i % 5 === 0 ? 'var(--aurora)' : i % 3 === 0 ? 'var(--accent)' : 'var(--primary)', delay: Math.random() * 0.15 }
      }),
    // regenerate per celebration
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [c?.id],
  )

  return (
    <AnimatePresence>
      {c && (
        <motion.div
          key={c.id}
          className="fixed inset-0 z-[60] grid cursor-pointer place-items-center overflow-hidden"
          onClick={clearCelebration}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.8 }}
          role="alert"
        >
          {/* settles into a dark, blurred backdrop so the text stays readable */}
          <motion.div
            aria-hidden="true"
            className="absolute inset-0 backdrop-blur-md"
            style={{ background: 'radial-gradient(circle at 50% 50%, rgb(242 182 109 / 0.35) 0%, rgb(232 107 216 / 0.18) 30%, rgb(5 3 13 / 0.88) 70%)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4 }}
          />
          {/* the flash itself */}
          <motion.div
            aria-hidden="true"
            className="absolute inset-0"
            style={{ background: 'radial-gradient(circle at 50% 50%, #ffffff 0%, #fff1d6 30%, #f2b66d 60%, rgb(232 107 216 / 0.6) 100%)' }}
            initial={{ opacity: 1 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 1.1, ease: 'easeOut' }}
          />
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              aria-hidden="true"
              className="absolute left-1/2 top-1/2 size-[40vmax] -translate-x-1/2 -translate-y-1/2 rounded-full border-2"
              style={{ borderColor: i === 1 ? 'var(--accent)' : i === 2 ? 'var(--aurora)' : 'var(--primary)' }}
              initial={{ scale: 0, opacity: 1 }}
              animate={{ scale: 3.2, opacity: 0 }}
              transition={{ duration: 2.2, delay: i * 0.22, ease: [0.1, 0.8, 0.3, 1] }}
            />
          ))}
          {sparks.map((s, i) => (
            <motion.span
              key={i}
              aria-hidden="true"
              className="absolute left-1/2 top-1/2 rounded-full"
              style={{ width: s.s, height: s.s, background: s.hue, boxShadow: `0 0 12px ${s.hue}` }}
              initial={{ x: 0, y: 0, opacity: 1 }}
              animate={{ x: `${s.x}vmin`, y: `${s.y}vmin`, opacity: 0 }}
              transition={{ duration: 1.8, delay: s.delay, ease: [0.05, 0.7, 0.3, 1] }}
            />
          ))}
          <motion.div className="relative px-6 text-center" initial={{ scale: 0.3, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 140, damping: 13, delay: 0.15 }}>
            <p className="text-[15px] font-medium text-accent">{c.preview ? 'Preview: you found a block' : 'You found a block'}</p>
            <p className="display gold-text mt-2 text-[clamp(44px,7vw,96px)] drop-shadow-[0_0_60px_rgb(242_182_109/0.55)]">#{formatInt(c.height)}</p>
            <p className="display mt-4 text-[length:calc(clamp(22px,3vw,36px)*var(--ds))] text-foreground">+{c.reward} SAT</p>
            <p className="mt-4 text-[13px] text-muted-foreground">Reward unlocks after 100 confirmations. Click anywhere to close.</p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
