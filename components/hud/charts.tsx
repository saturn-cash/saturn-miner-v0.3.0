'use client'

import { motion } from 'motion/react'
import { useId, useMemo } from 'react'
import { cn } from '@/lib/utils'

interface AreaChartProps {
  data: number[]
  className?: string
  color?: string
  height?: number
  gridLines?: number
  label?: (max: number) => string
}

export function AreaChart({ data, className, color = 'var(--primary)', height = 160, gridLines = 4, label }: AreaChartProps) {
  const id = useId()
  const width = 600
  const { line, area, max, lastY } = useMemo(() => {
    const max = Math.max(1, ...data) * 1.15
    const stepX = width / Math.max(1, data.length - 1)
    const pts = data.map((v, i) => [i * stepX, height - (v / max) * (height - 8) - 4] as const)
    let line = ''
    pts.forEach(([x, y], i) => {
      if (i === 0) {
        line = `M${x},${y}`
        return
      }
      const [px, py] = pts[i - 1]
      const cx = (px + x) / 2
      line += ` C${cx},${py} ${cx},${y} ${x},${y}`
    })
    return { line, area: `${line} L${width},${height} L0,${height} Z`, max, lastY: pts[pts.length - 1]?.[1] ?? height }
  }, [data, height])

  return (
    <div className={cn('relative w-full', className)}>
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="h-full w-full overflow-visible" role="img" aria-label="Hashrate history chart">
        <defs>
          <linearGradient id={`${id}-fill`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.35" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
          <linearGradient id={`${id}-stroke`} x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor={color} stopOpacity="0.15" />
            <stop offset="70%" stopColor={color} stopOpacity="0.9" />
            <stop offset="100%" stopColor={color} stopOpacity="1" />
          </linearGradient>
        </defs>
        {Array.from({ length: gridLines + 1 }, (_, i) => (
          <line key={i} x1="0" x2={width} y1={(height / gridLines) * i} y2={(height / gridLines) * i} stroke="var(--border)" strokeDasharray="2 6" vectorEffect="non-scaling-stroke" />
        ))}
        <path d={area} fill={`url(#${id}-fill)`} />
        <path d={line} fill="none" stroke={`url(#${id}-stroke)`} strokeWidth="2" vectorEffect="non-scaling-stroke" style={{ filter: `drop-shadow(0 0 6px ${color})` }} />
        <circle cx={width} cy={lastY} r="4" fill={color} vectorEffect="non-scaling-stroke">
          <animate attributeName="r" values="3;6;3" dur="1.6s" repeatCount="indefinite" />
        </circle>
      </svg>
      {label && (
        <span className="pointer-events-none absolute left-1 top-0 t-subhead secondary">{label(max)}</span>
      )}
    </div>
  )
}

export function Sparkline({ data, color = 'var(--primary)', className }: { data: number[]; color?: string; className?: string }) {
  const d = useMemo(() => {
    const max = Math.max(1, ...data)
    const min = Math.min(...data)
    const range = max - min || 1
    return data.map((v, i) => `${i === 0 ? 'M' : 'L'}${(i / (data.length - 1)) * 100},${28 - ((v - min) / range) * 24}`).join(' ')
  }, [data])
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className={cn('h-8 w-full', className)} aria-hidden="true">
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

interface GaugeProps {
  value: number
  max: number
  label: string
  display: string
  unit?: string
  tone?: 'gold' | 'cyan' | 'red'
  size?: number
}

export function Gauge({ value, max, label, display, unit, tone = 'gold', size = 120 }: GaugeProps) {
  const r = 46
  const circumference = Math.PI * 2 * r
  const arc = 0.75
  const pct = Math.min(1, Math.max(0, value / max))
  const color = tone === 'gold' ? 'var(--primary)' : tone === 'cyan' ? 'var(--accent)' : 'var(--destructive)'
  return (
    <div className="relative flex flex-col items-center" style={{ width: size }}>
      <svg viewBox="0 0 120 120" className="w-full -rotate-[225deg]" aria-hidden="true">
        <circle cx="60" cy="60" r={r} fill="none" stroke="var(--muted)" strokeWidth="6" strokeDasharray={`${circumference * arc} ${circumference}`} strokeLinecap="round" />
        <motion.circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={`${circumference * arc} ${circumference}`}
          initial={{ strokeDashoffset: circumference * arc }}
          animate={{ strokeDashoffset: circumference * arc * (1 - pct) }}
          transition={{ type: 'spring', stiffness: 60, damping: 18 }}
          style={{ filter: `drop-shadow(0 0 5px ${color})` }}
        />
        {Array.from({ length: 28 }, (_, i) => {
          const a = (i / 27) * arc * Math.PI * 2
          return <line key={i} x1={60 + Math.cos(a) * 36} y1={60 + Math.sin(a) * 36} x2={60 + Math.cos(a) * (i % 3 === 0 ? 32 : 34)} y2={60 + Math.sin(a) * (i % 3 === 0 ? 32 : 34)} stroke="var(--muted-foreground)" strokeOpacity="0.4" strokeWidth="1" />
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center pt-1">
        <span className="display text-[19px] font-semibold tabular-nums text-foreground">
          {display}
          {unit && <span className="ml-0.5 text-[10px] text-muted-foreground">{unit}</span>}
        </span>
        <span className="mt-0.5 t-subhead secondary">{label}</span>
      </div>
    </div>
  )
}

export function Bars({ values, max, className }: { values: number[]; max: number; className?: string }) {
  return (
    <div className={cn('flex h-24 items-end gap-1', className)} role="img" aria-label="Per-thread hashrate">
      {values.map((v, i) => (
        <div key={i} className="relative flex h-full flex-1 items-end overflow-hidden rounded-[10px] bg-[rgb(234_240_255/0.04)]">
          <motion.div
            className="w-full rounded-[10px] bg-gradient-to-t from-primary/55 to-primary"
            animate={{ height: `${Math.min(100, (v / max) * 100)}%` }}
            transition={{ type: 'spring', stiffness: 90, damping: 16 }}
          />
        </div>
      ))}
    </div>
  )
}
