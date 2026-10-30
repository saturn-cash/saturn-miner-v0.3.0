'use client'

import { memo, useEffect, useRef, useState } from 'react'

interface TickerProps {
  value: number
  format: (n: number) => string
  /** kept for API compatibility; the roll uses a fixed spring-like curve */
  duration?: number
  className?: string
}

const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']

/**
 * Rolling numerals, like Stocks and the Activity rings: each digit is a vertical strip of 0-9 that
 * slides to its new value. An invisible copy of the real text sets the size and baseline, so the
 * number lines up with its unit exactly as plain text would.
 */
export function Ticker({ value, format, className }: TickerProps) {
  const text = format(value)
  const chars = text.split('')
  return (
    <span className={className} style={{ fontVariantNumeric: 'tabular-nums' }} aria-label={text} role="text">
      <span aria-hidden="true" className="inline-flex">
        {chars.map((ch, i) => (
          // key from the right so columns stay put when a number gains a digit (9.99 → 10.00)
          <Char key={chars.length - i} ch={ch} />
        ))}
      </span>
    </span>
  )
}

/**
 * One digit column. The strip holds 0-9 twice so a step from 9 to 0 rolls forward one cell (like an
 * odometer) instead of sweeping back through every digit; after the roll it snaps, invisibly, to the
 * equivalent cell in the first copy.
 */
const Char = memo(function Char({ ch }: { ch: string }) {
  const d = DIGITS.indexOf(ch)
  const [pos, setPos] = useState(d < 0 ? 0 : d)
  const [instant, setInstant] = useState(false)
  const prev = useRef(d)

  useEffect(() => {
    if (d < 0) return
    const from = prev.current
    prev.current = d
    if (from < 0 || from === d) return
    // forward distance on a 10-digit wheel, but go backwards when that's shorter (count-downs)
    const fwd = (d - from + 10) % 10
    const base = pos % 10
    if (fwd <= 5) {
      setInstant(false)
      setPos(base + fwd)
      return
    }
    // backwards: start from the second copy so the column can step down past 0
    const back = 10 - fwd
    setInstant(true)
    setPos(base + 10)
    const raf = requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        setInstant(false)
        setPos(base + 10 - back)
      }),
    )
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pos is read once per digit change
  }, [d])

  if (d < 0) return <span>{ch}</span>
  return (
    <span className="relative inline-block">
      <span className="invisible">{ch}</span>
      <span className="absolute inset-0 overflow-hidden">
        <span
          className={instant ? 'absolute inset-x-0 top-0 block' : 'absolute inset-x-0 top-0 block transition-transform duration-[450ms] ease-[cubic-bezier(0.25,0.9,0.3,1)]'}
          style={{ height: '2000%', transform: `translateY(${-pos * 5}%)` }}
          onTransitionEnd={() => {
            if (pos >= 10 && !instant) {
              setInstant(true)
              setPos(pos % 10)
            }
          }}
        >
          {[...DIGITS, ...DIGITS].map((n, i) => (
            <span key={i} className="block text-center" style={{ height: '5%', lineHeight: 'inherit' }}>
              {n}
            </span>
          ))}
        </span>
      </span>
    </span>
  )
})
