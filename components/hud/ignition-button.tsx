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
const ENERGY = { idle: 0.45, starting: 0.8, mining: 1, stopping: 0.6 } as const

/**
 * The power button is the Saturn hologram coin (coin-spin.ts, the flat cursor Saturn inside): a
 * small emitter projects it. Off, it holds still, face on, dimmed. Start mining and it powers up and
 * spins up, the planet turning one way and the coin the other, glitching as it goes; stop and it
 * slows down and settles back face on. It only redraws while something is moving.
 */
export function IgnitionButton({ size = 'lg' }: { size?: 'lg' | 'md' }) {
  const status = useMiner((s) => s.status)
  const active = status === 'mining'
  const w = size === 'lg' ? 150 : 112
  const h = Math.round(w * COIN_ASPECT)
  const canvas = useRef<HTMLCanvasElement>(null)
  const state = useRef({ status: status as keyof typeof SPEED, hover: false, kick: () => {} })
  state.current.status = status

  useEffect(() => {
    const c = canvas.current
    const ctx = c?.getContext('2d')
    if (!c || !ctx) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    c.width = Math.round(w * dpr)
    c.height = Math.round(h * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    let p = 0 // turns of the coin
    let v = 0 // turns per second
    let e: number = ENERGY[state.current.status]
    let last = performance.now()
    let raf = 0
    const frame = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      const st = state.current.status
      const target = SPEED[st]
      if (target > 0) {
        v += (target - v) * Math.min(1, dt * 1.4)
        p += v * dt
      } else if (p !== Math.ceil(p - 1e-6) || v > 0) {
        // coast down and settle face on
        const stop = Math.ceil(p - 1e-6)
        v = Math.max(v * (1 - dt * 1.1), 0.05)
        p += v * dt
        if (p >= stop) {
          p = stop
          v = 0
        }
      }
      const eT = st === 'idle' && state.current.hover ? 0.7 : ENERGY[st]
      e += (eT - e) * Math.min(1, dt * 5)
      drawCoin(ctx, w, p * COIN_PERIOD, { style: 'cursor', energy: e, fxT: now / 1000, glitches: st === 'mining' })
      const moving = v > 0 || target > 0 || Math.abs(eT - e) > 0.01
      // while mining the scanlines keep scrolling; otherwise stop drawing once everything has settled
      raf = moving && !document.hidden ? requestAnimationFrame(frame) : 0
    }
    const kick = () => {
      if (!raf && !document.hidden) {
        last = performance.now()
        raf = requestAnimationFrame(frame)
      }
    }
    state.current.kick = kick
    drawCoin(ctx, w, 0, { style: 'cursor', energy: e, fxT: 0, glitches: false })
    kick()
    const vis = () => (document.hidden ? (cancelAnimationFrame(raf), (raf = 0)) : kick())
    document.addEventListener('visibilitychange', vis)
    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('visibilitychange', vis)
    }
  }, [w, h])

  // a status change (start, stop) wakes the animation
  useEffect(() => state.current.kick(), [status])

  return (
    <div className="flex flex-col items-center gap-2">
      <motion.button
        type="button"
        onClick={() => (active || status === 'starting' ? minerActions.stop() : minerActions.start())}
        onPointerEnter={() => {
          state.current.hover = true
          state.current.kick()
        }}
        onPointerLeave={() => {
          state.current.hover = false
          state.current.kick()
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
