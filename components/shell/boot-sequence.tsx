'use client'

import { animate, AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { sound } from '@/lib/audio/sound'
import { cosmos, cosmosImpulse } from '@/lib/cosmos/store'
import { SaturnLogo } from './saturn-logo'

const CHECKS = ['Linking to Saturn Core', 'Verifying chainstate', 'Loading wallet', 'Arming the SHA-256d engine', 'Plotting course']
const EARTH_TO_SATURN_KM = 1_272_000_000

type Phase = 'checks' | 'warp' | 'done'

/**
 * Launch: a short preflight on black, then the curtain drops and you warp in from deep space.
 * The camera flight itself happens in the cosmos scene; this overlay only narrates it.
 */
export function BootSequence({ onDone, cinematic }: { onDone: () => void; cinematic: boolean }) {
  const [phase, setPhase] = useState<Phase>('checks')
  const [check, setCheck] = useState(0)
  const counter = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!cinematic) {
      cosmosImpulse.launching = false
      cosmos.travelTo('overview')
      onDone()
      setPhase('done')
      return
    }
    if (phase !== 'checks') return
    if (check >= CHECKS.length) {
      const t = setTimeout(() => setPhase('warp'), 250)
      return () => clearTimeout(t)
    }
    const t = setTimeout(() => setCheck((c) => c + 1), 300)
    return () => clearTimeout(t)
  }, [check, phase, cinematic, onDone])

  useEffect(() => {
    if (phase !== 'warp') return
    cosmos.kick(1, 0.6)
    cosmos.travelTo('overview')
    sound.warp(1.6)
    const controls = animate(EARTH_TO_SATURN_KM, 0, {
      duration: 2.6,
      ease: [0.7, 0, 0.2, 1],
      onUpdate: (v) => {
        if (counter.current) counter.current.textContent = Math.round(v).toLocaleString('en-US')
      },
    })
    const finish = setTimeout(() => {
      setPhase('done')
      onDone()
    }, 2500)
    return () => {
      controls.stop()
      clearTimeout(finish)
    }
  }, [phase, onDone])

  const skip = () => {
    if (phase === 'checks') setPhase('warp')
  }

  return (
    <AnimatePresence>
      {phase !== 'done' && (
        <motion.div key="boot" className="fixed inset-0 z-50 grid place-items-center" exit={{ opacity: 0 }} transition={{ duration: 0.8 }} onClick={skip} role="status" aria-label="Saturn Miner is launching">
          <motion.div
            aria-hidden="true"
            className="absolute inset-0 bg-[var(--void)]"
            animate={{ opacity: phase === 'checks' ? 1 : 0 }}
            transition={{ duration: 0.9, ease: 'easeIn' }}
          />

          <AnimatePresence mode="wait">
            {phase === 'checks' ? (
              <motion.div key="checks" className="relative flex w-full max-w-md flex-col items-center px-6" exit={{ opacity: 0, scale: 1.6, filter: 'blur(14px)' }} transition={{ duration: 0.5, ease: 'easeIn' }}>
                <motion.div initial={{ scale: 0, rotate: -60 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 110, damping: 12 }}>
                  <SaturnLogo className="size-20 drop-shadow-[0_0_30px_rgb(242_182_109/0.6)]" />
                </motion.div>
                <motion.h1
                  className="display gold-text mt-6 text-[length:calc(56px*var(--ds))]"
                  initial={{ letterSpacing: '0.6em', opacity: 0 }}
                  animate={{ letterSpacing: '-0.02em', opacity: 1 }}
                  transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
                >
                  Saturn
                </motion.h1>
                <div className="mt-8 h-5 text-[13px] text-muted-foreground">
                  <AnimatePresence mode="wait">
                    <motion.p key={check} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.15 }}>
                      {CHECKS[Math.min(check, CHECKS.length - 1)]}
                    </motion.p>
                  </AnimatePresence>
                </div>
                <div className="mt-4 h-px w-56 overflow-hidden bg-[rgb(234_240_255/0.1)]">
                  <motion.div className="h-full bg-primary shadow-[0_0_12px_var(--primary)]" animate={{ width: `${(check / CHECKS.length) * 100}%` }} transition={{ duration: 0.25 }} />
                </div>
                <p className="mt-10 text-[11px] text-muted-foreground/50">Click to launch</p>
              </motion.div>
            ) : (
              <motion.div key="warp" className="relative text-center" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9, filter: 'blur(10px)' }} transition={{ duration: 0.5 }}>
                <p className="text-[13px] text-muted-foreground">Distance to Saturn</p>
                <p className="display mt-2 text-[length:calc(clamp(34px,6vw,76px)*var(--ds))] tabular-nums text-foreground drop-shadow-[0_0_40px_rgb(242_182_109/0.5)]">
                  <span ref={counter}>{EARTH_TO_SATURN_KM.toLocaleString('en-US')}</span>
                  <span className="ml-3 text-[0.4em] text-primary">km</span>
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
