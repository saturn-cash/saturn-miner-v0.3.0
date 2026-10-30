'use client'

import { AnimatePresence, motion } from 'motion/react'
import { formatClock } from '@/lib/format'
import type { LogEntry } from '@/lib/miner/types'
import { cn } from '@/lib/utils'

const LEVEL_STYLE = {
  info: 'text-muted-foreground',
  success: 'text-primary',
  warn: 'text-warn',
  error: 'text-destructive',
} as const

const SOURCE_STYLE = {
  MINER: 'text-primary border-primary/30',
  POOL: 'text-accent border-accent/30',
  NODE: 'text-aurora border-aurora/30',
  WALLET: 'text-ok border-ok/30',
  SYSTEM: 'text-muted-foreground border-muted-foreground/30',
} as const

export function LogFeed({ entries, limit = 8, className }: { entries: LogEntry[]; limit?: number; className?: string }) {
  const visible = entries.slice(-limit).reverse()
  return (
    <ol className={cn('flex flex-col gap-1 font-mono text-[11px] leading-relaxed', className)} aria-live="polite" aria-label="Event log">
      <AnimatePresence initial={false}>
        {visible.map((e) => (
          <motion.li
            key={e.id}
            layout="position"
            initial={{ opacity: 0, x: -12, backgroundColor: 'rgba(242, 182, 109, 0.14)' }}
            animate={{ opacity: 1, x: 0, backgroundColor: 'rgba(242, 182, 109, 0)' }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            className="flex items-start gap-3 rounded-lg px-2 py-1"
          >
            <time className="shrink-0 text-muted-foreground/70" dateTime={new Date(e.time).toISOString()}>
              {formatClock(new Date(e.time))}
            </time>
            <span className={cn('w-[58px] shrink-0 rounded-full border px-1.5 text-center text-[9.5px] leading-4 tracking-wide', SOURCE_STYLE[e.source])}>{e.source}</span>
            <span className={cn('min-w-0 break-words', LEVEL_STYLE[e.level])}>{e.message}</span>
          </motion.li>
        ))}
      </AnimatePresence>
    </ol>
  )
}
