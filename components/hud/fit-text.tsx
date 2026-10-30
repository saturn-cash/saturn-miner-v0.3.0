'use client'

import { useLayoutEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

/**
 * Sets the font size so the text fills its container's width exactly.
 * Measures a digit-neutral template ("00.00 MH/s") so the size only changes when the
 * shape of the number changes (e.g. MH/s → GH/s), not on every telemetry tick.
 */
export function FitText({ text, min = 12, max = 44, className }: { text: string; min?: number; max?: number; className?: string }) {
  const box = useRef<HTMLDivElement>(null)
  const probe = useRef<HTMLSpanElement>(null)
  const [size, setSize] = useState(16)
  const template = text.replace(/\d/g, '0')

  useLayoutEffect(() => {
    const el = box.current
    const p = probe.current
    if (!el || !p) return
    const measure = () => {
      const w = p.getBoundingClientRect().width
      if (!w || !el.clientWidth) return
      setSize(Math.max(min, Math.min(max, Math.floor((100 * el.clientWidth) / w * 10) / 10)))
    }
    measure()
    document.fonts?.ready.then(measure).catch(() => {})
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [template, min, max])

  return (
    <div ref={box} className="relative w-full overflow-hidden">
      <span ref={probe} aria-hidden="true" className={cn('pointer-events-none invisible absolute left-0 top-0 whitespace-nowrap font-display font-semibold tabular-nums', className)} style={{ fontSize: 100, lineHeight: 1 }}>
        {template}
      </span>
      <span className={cn('block whitespace-nowrap font-display font-semibold tabular-nums', className)} style={{ fontSize: size, lineHeight: 1.05 }}>
        {text}
      </span>
    </div>
  )
}
