'use client'

import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { type ScreenId, screenMeta } from './destinations'

/** A title card that announces where the ship just arrived. Shown only after navigating, never on load. */
export function ArrivalCard({ screen, visitKey }: { screen: ScreenId; visitKey: number }) {
  const [shown, setShown] = useState<{ screen: ScreenId; key: number } | null>(null)

  useEffect(() => {
    if (visitKey === 0) return
    setShown({ screen, key: visitKey })
    const t = setTimeout(() => setShown(null), 2100)
    return () => clearTimeout(t)
  }, [screen, visitKey])

  const meta = shown ? screenMeta(shown.screen) : null

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[16vh] z-40 flex justify-center px-6" aria-live="polite">
      <AnimatePresence>
        {meta && shown && (
          <motion.div key={shown.key} className="text-center" exit={{ opacity: 0, y: -10, filter: 'blur(8px)' }} transition={{ duration: 0.5 }}>
            <motion.p className="text-[13px] text-accent" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, duration: 0.4 }}>
              Arriving at
            </motion.p>
            <motion.p
              className="display gold-text mt-1 text-[length:calc(clamp(40px,7vw,96px)*var(--ds))] [text-shadow:none] drop-shadow-[0_6px_40px_rgb(0_0_0/0.9)]"
              initial={{ opacity: 0, letterSpacing: '0.35em', scaleX: 1.25 }}
              animate={{ opacity: 1, letterSpacing: '-0.02em', scaleX: 1 }}
              transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
            >
              {meta.place}
            </motion.p>
            <motion.p className="mx-auto mt-3 max-w-[46ch] text-[14px] text-foreground/80 drop-shadow-[0_2px_12px_rgb(0_0_0/1)]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.45, duration: 0.5 }}>
              {meta.arrival}
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
