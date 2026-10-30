'use client'

import { animate } from 'motion/react'
import { useEffect, useRef } from 'react'

interface TickerProps {
  value: number
  format: (n: number) => string
  duration?: number
  className?: string
}

/** Tweens numeric values by writing to the DOM directly, so 1 Hz telemetry never re-renders parents. */
export function Ticker({ value, format, duration = 0.8, className }: TickerProps) {
  const ref = useRef<HTMLSpanElement>(null)
  const current = useRef(value)
  const formatRef = useRef(format)
  formatRef.current = format

  useEffect(() => {
    const controls = animate(current.current, value, {
      duration,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => {
        current.current = v
        if (ref.current) ref.current.textContent = formatRef.current(v)
      },
    })
    return () => controls.stop()
  }, [value, duration])

  return (
    <span ref={ref} className={className} style={{ fontVariantNumeric: 'tabular-nums' }}>
      {format(value)}
    </span>
  )
}
