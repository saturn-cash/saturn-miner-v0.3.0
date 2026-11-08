'use client'

import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { cosmos, cosmosImpulse } from '@/lib/cosmos/store'
import pkg from '@/package.json'
import { OUTLINE_HOLD, OutlineFilm } from './boot-outline'
import { createIntro } from './hyperspace-intro'

const HYPER_HOLD = 5650 // ms until the hyperspace film leaves (then a 0.75 s dissolve)
const SEEN_KEY = 'saturn.intro.version'
type Film = 'hyperspace' | 'outline'

/** the big film plays the first time Saturn opens and the first time after each update */
function pickFilm(): Film {
  try {
    if (localStorage.getItem(SEEN_KEY) === pkg.version) return 'outline'
    localStorage.setItem(SEEN_KEY, pkg.version)
  } catch {
    /* no storage: treat every launch as the first */
  }
  return 'hyperspace'
}
const G = '61 255 139' // the website's Saturn-cursor green
const ease = [0.16, 1, 0.3, 1] as const

/**
 * Launch screen. The first time Saturn opens, and after each update, it plays the hyperspace film
 * (hyperspace-intro.ts, a green hologram): you leave Earth in a little ship, jump to hyperspeed,
 * drop out at Saturn, and the outline Saturn pings while the ship slips into orbit. Every other
 * launch plays the shorter outline film (boot-outline.tsx). A click skips either one.
 */
export function BootSequence({ onDone, cinematic }: { onDone: () => void; cinematic: boolean }) {
  const [done, setDone] = useState(false)
  // chosen after mount (storage isn't there while the page is prerendered)
  const [film, setFilm] = useState<Film | null>(null)
  const canvas = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (cinematic) setFilm(pickFilm())
  }, [cinematic])

  useEffect(() => {
    if (!cinematic) {
      cosmosImpulse.launching = false
      cosmos.travelTo('overview')
      onDone()
      setDone(true)
      return
    }
    if (!film) return
    const HOLD = film === 'hyperspace' ? HYPER_HOLD : OUTLINE_HOLD
    // start the camera flight just before the screen dissolves, so the app arrives in motion
    const fly = setTimeout(() => cosmos.travelTo('overview'), HOLD - 350)
    const t = setTimeout(() => {
      setDone(true)
      onDone()
    }, HOLD)
    return () => {
      clearTimeout(fly)
      clearTimeout(t)
    }
  }, [cinematic, film, onDone])

  // the hologram film itself
  useEffect(() => {
    const c = canvas.current
    if (film !== 'hyperspace' || !c) return
    const intro = createIntro(c)
    const t0 = performance.now()
    let raf = 0
    let last = -1
    // 30 fps keeps it light on the computer while everything else is starting up
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      if (now - last < 1000 / 30 - 2) return
      last = now
      const t = (now - t0) / 1000
      intro.draw(t)
      if (t > HYPER_HOLD / 1000 + 0.8) cancelAnimationFrame(raf)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [film])

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
          className="fixed inset-0 z-50 overflow-hidden bg-[var(--void)]"
          exit={{ opacity: 0 }}
          transition={{ duration: 0.75, ease: [0.7, 0, 0.84, 0] }}
          onClick={skip}
          role="status"
          aria-label="Saturn is launching"
        >
          {film === 'outline' && <OutlineFilm />}
          {film === 'hyperspace' && (
            <>
            <canvas ref={canvas} aria-hidden="true" className="absolute inset-0 size-full" />
            {/* hologram scanlines over the whole film */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 mix-blend-multiply"
              style={{ background: 'repeating-linear-gradient(180deg, transparent 0 2px, rgb(0 0 0 / 0.22) 2px 3px)' }}
            />
            <div className="absolute inset-x-0 top-[66%] flex flex-col items-center">
              <motion.h1
                className="text-[30px] font-semibold"
                initial={{ opacity: 0, letterSpacing: '0.5em', filter: 'blur(6px)' }}
                animate={{ opacity: 1, letterSpacing: '-0.01em', filter: 'blur(0px)' }}
                transition={{ duration: 1.4, delay: 3.9, ease }}
              >
                Saturn
              </motion.h1>
              <motion.p
                className="mt-2 font-mono text-[11px] uppercase tracking-[0.3em]"
                style={{ color: `rgb(${G} / 0.85)` }}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 4.4, ease }}
              >
                mainnet · sha-256d
              </motion.p>
              <motion.div className="mt-6 h-[3px] w-44 overflow-hidden rounded-full bg-white/[0.12]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, delay: 0.3 }}>
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: `linear-gradient(90deg, rgb(200 255 222), rgb(${G}))`, boxShadow: `0 0 10px rgb(${G} / 0.7)` }}
                  initial={{ width: '0%' }}
                  animate={{ width: '100%' }}
                  transition={{ duration: 4.9, delay: 0.4, ease: [0.45, 0, 0.2, 1] }}
                />
              </motion.div>
            </div>
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
