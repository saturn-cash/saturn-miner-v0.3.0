'use client'

import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { cosmos, cosmosImpulse } from '@/lib/cosmos/store'
import { SaturnLogo } from './saturn-logo'

const ENTER = 0.15 // s before the logo starts
const FILL = 1.3 // s for the progress line
const HOLD = 2250 // ms until the screen leaves

/**
 * Launch screen, kept quiet on purpose: the gold Saturn on black with a single ring of light, the
 * name, one progress line, then it dissolves into the app (about 2.5 s; a click skips it).
 */
export function BootSequence({ onDone, cinematic }: { onDone: () => void; cinematic: boolean }) {
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!cinematic) {
      cosmosImpulse.launching = false
      cosmos.travelTo('overview')
      onDone()
      setDone(true)
      return
    }
    // start the camera flight just before the screen dissolves, so the app arrives in motion
    const fly = setTimeout(() => cosmos.travelTo('overview'), HOLD - 300)
    const t = setTimeout(() => {
      setDone(true)
      onDone()
    }, HOLD)
    return () => {
      clearTimeout(fly)
      clearTimeout(t)
    }
  }, [cinematic, onDone])

  const skip = () => {
    if (done) return
    cosmos.travelTo('overview')
    setDone(true)
    onDone()
  }

  return (
    <AnimatePresence>
      {!done && (
        <motion.div
          key="boot"
          className="fixed inset-0 z-50 grid place-items-center bg-[var(--void)]"
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6, ease: [0.7, 0, 0.84, 0] }}
          onClick={skip}
          role="status"
          aria-label="Saturn is launching"
        >
          <motion.div className="flex flex-col items-center" exit={{ scale: 1.06, filter: 'blur(6px)' }} transition={{ duration: 0.6, ease: [0.7, 0, 0.84, 0] }}>
            <div className="relative grid place-items-center">
              <motion.span
                aria-hidden="true"
                className="absolute size-24 rounded-full shadow-[0_0_0_1px_rgb(245_185_113/0.5)]"
                initial={{ opacity: 0.7, scale: 0.9 }}
                animate={{ opacity: 0, scale: 2.4 }}
                transition={{ duration: 1.4, delay: 0.5, ease: [0.16, 1, 0.3, 1] }}
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.82, filter: 'drop-shadow(0 0 0 rgb(245 185 113 / 0))' }}
                animate={{ opacity: 1, scale: 1, filter: 'drop-shadow(0 0 28px rgb(245 185 113 / 0.35))' }}
                transition={{ duration: 1, delay: ENTER, ease: [0.16, 1, 0.3, 1] }}
              >
                <SaturnLogo className="size-24" />
              </motion.div>
            </div>
            <motion.h1
              className="mt-[22px] text-[28px] font-semibold tracking-[-0.01em]"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.45, ease: [0.16, 1, 0.3, 1] }}
            >
              Saturn
            </motion.h1>
            <motion.div
              className="mt-[26px] h-[3px] w-40 overflow-hidden rounded-full bg-white/[0.12]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.6 }}
            >
              <motion.div className="h-full rounded-full bg-white" initial={{ width: '0%' }} animate={{ width: '100%' }} transition={{ duration: FILL, delay: 0.75, ease: [0.45, 0, 0.2, 1] }} />
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
