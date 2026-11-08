'use client'

import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef } from 'react'
import { minerActions, useMiner } from '@/lib/miner/store'
import { cn } from '@/lib/utils'
import { COIN_ASPECT, COIN_PERIOD, drawCoin } from './coin-spin'

const LABELS = {
  idle: 'Start Mining',
  starting: 'Starting… tap to cancel',
  mining: 'Stop Mining',
  stopping: 'Stopping…',
} as const

/** spin speed, in turns per second, for each state; idle settles face-on */
const FULL = 1 / COIN_PERIOD
const SPEED = { idle: 0, starting: FULL * 0.45, mining: FULL, stopping: 0 } as const
/** how powered up the projection is: off is grey with the projector unlit */
const ENERGY = { idle: 0, starting: 0.7, mining: 1, stopping: 0.35 } as const

type Status = keyof typeof SPEED

/**
 * The coin's motion lives here, outside the component, on one shared clock. Leaving the screen
 * (or hiding the window) and coming back picks the spin up exactly where it would be by now, so it
 * never looks like it restarted; two buttons on screen at once during a screen change stay in step.
 */
const spin = { p: 0, v: 0, e: 0, t: 0, hover: false, status: 'idle' as Status, started: false, rest: false }

function energyTarget() {
  return spin.status === 'idle' && spin.hover ? 0.18 : ENERGY[spin.status]
}

function step(dt: number) {
  const target = SPEED[spin.status]
  if (target > 0) {
    spin.v += (target - spin.v) * Math.min(1, dt * 1.4)
    spin.p += spin.v * dt
  } else if (spin.p * 2 !== Math.ceil(spin.p * 2 - 1e-6) || spin.v > 0) {
    // coast down and settle face on (it looks the same every half turn)
    const stop = Math.ceil(spin.p * 2 - 1e-6) / 2
    spin.v = Math.max(spin.v - dt * 0.05, 0.09)
    spin.p += spin.v * dt
    if (spin.p >= stop) {
      spin.p = stop
      spin.v = 0
    }
  }
  const eT = energyTarget()
  spin.e += (eT - spin.e) * Math.min(1, dt * 5)
}

/** run the motion forward to `now`; a second call for the same frame does nothing */
function advanceTo(now: number) {
  let left = (now - spin.t) / 1000
  spin.t = now
  if (left <= 0) return
  // time spent off screen is caught up in small steps; past a minute everything has settled into
  // its steady speed, so the rest is just more turns at that speed
  for (let n = 0; left > 0 && n < 1200; n++) {
    const dt = Math.min(0.05, left)
    step(dt)
    left -= dt
  }
  if (left > 0 && SPEED[spin.status] > 0) {
    spin.v = SPEED[spin.status]
    spin.p += spin.v * left
  }
}

/**
 * The power button is the Saturn hologram coin (coin-spin.ts, the flat cursor Saturn inside): a
 * small emitter projects it. Off, it holds still, face on, grey with the projector unlit. Start
 * mining and it powers up and spins; stop and it slows down and settles back face on. It only
 * redraws while something is moving.
 */
export function IgnitionButton({ size = 'lg' }: { size?: 'lg' | 'md' }) {
  const status = useMiner((s) => s.status)
  const active = status === 'mining'
  const w = size === 'lg' ? 150 : 112
  const h = Math.round(w * COIN_ASPECT)
  const canvas = useRef<HTMLCanvasElement>(null)
  const kickRef = useRef(() => {})
  spin.status = status

  useEffect(() => {
    const c = canvas.current
    const ctx = c?.getContext('2d')
    if (!c || !ctx) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    c.width = Math.round(w * dpr)
    c.height = Math.round(h * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    const draw = (now: number) =>
      drawCoin(ctx, w, spin.p * COIN_PERIOD, { style: 'cursor', power: spin.e, energy: 0.75 + 0.25 * spin.e, fxT: now / 1000 })

    let raf = 0
    const frame = (now: number) => {
      advanceTo(now)
      draw(now)
      const moving = spin.v > 0 || SPEED[spin.status] > 0 || Math.abs(energyTarget() - spin.e) > 0.01
      if (!moving) spin.rest = true
      // while mining the scanlines keep scrolling; otherwise stop drawing once everything has settled
      raf = moving && !document.hidden ? requestAnimationFrame(frame) : 0
    }
    const kick = () => {
      if (raf || document.hidden) return
      // a coin that came to rest has nothing to catch up on: start the clock from now
      if (spin.rest) {
        spin.t = performance.now()
        spin.rest = false
      }
      raf = requestAnimationFrame(frame)
    }
    kickRef.current = kick

    const now = performance.now()
    if (!spin.started) {
      spin.started = true
      spin.t = now
      spin.e = ENERGY[spin.status]
    } else if (!spin.rest) {
      advanceTo(now)
    }
    draw(now)
    kick()
    const vis = () => (document.hidden ? (cancelAnimationFrame(raf), (raf = 0)) : kick())
    document.addEventListener('visibilitychange', vis)
    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('visibilitychange', vis)
      spin.hover = false
    }
  }, [w, h])

  // a status change (start, stop) wakes the animation
  useEffect(() => kickRef.current(), [status])

  return (
    <div className="flex flex-col items-center gap-2">
      <motion.button
        type="button"
        onClick={() => (active || status === 'starting' ? minerActions.stop() : minerActions.start())}
        onPointerEnter={() => {
          spin.hover = true
          kickRef.current()
        }}
        onPointerLeave={() => {
          spin.hover = false
          kickRef.current()
        }}
        disabled={status === 'stopping'}
        aria-pressed={active}
        aria-label={status === 'starting' ? 'Cancel start' : LABELS[status]}
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.96 }}
        transition={{ type: 'spring', stiffness: 420, damping: 22 }}
        className="relative rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-[rgb(61_255_139/0.6)] disabled:cursor-wait"
      >
        <canvas
          ref={canvas}
          aria-hidden="true"
          className={cn('block transition-[filter] duration-700', active ? 'coin-glow-on' : 'coin-glow')}
          style={{ width: w, height: h }}
        />
      </motion.button>
      <AnimatePresence mode="wait">
        <motion.span key={status} initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -3 }} className="t-headline text-white/80">
          {LABELS[status]}
        </motion.span>
      </AnimatePresence>
    </div>
  )
}
