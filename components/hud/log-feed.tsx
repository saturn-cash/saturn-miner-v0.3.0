'use client'

import { AnimatePresence, motion } from 'motion/react'
import { formatClock } from '@/lib/format'
import type { LogEntry } from '@/lib/miner/types'
import { cn } from '@/lib/utils'

const LEVEL_STYLE = {
  info: 'text-white/80',
  success: 'text-white',
  warn: 'text-warn',
  error: 'text-destructive',
} as const

const SOURCE_STYLE = {
  MINER: 'text-primary',
  POOL: 'text-accent',
  NODE: 'text-aurora',
  WALLET: 'text-ok',
  SYSTEM: 'text-white/45',
} as const

const SOURCE_LABEL = { MINER: 'Miner', POOL: 'Pool', NODE: 'Node', WALLET: 'Wallet', SYSTEM: 'System' } as const

export function LogFeed({ entries, limit = 8, className }: { entries: LogEntry[]; limit?: number; className?: string }) {
  const visible = entries.slice(-limit).reverse()
  return (
    <ol className={cn('mac-rows -mx-4 -mb-4 text-[12px]', className)} aria-live="polite" aria-label="Event log">
      <AnimatePresence initial={false}>
        {visible.map((e) => (
          <motion.li
            key={e.id}
            layout="position"
            initial={{ opacity: 0, backgroundColor: 'rgba(255, 255, 255, 0.06)' }}
            animate={{ opacity: 1, backgroundColor: 'rgba(255, 255, 255, 0)' }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            className="flex min-h-[28px] items-baseline gap-3 px-4 py-1.5"
          >
            <time className="tertiary shrink-0 tabular-nums" dateTime={new Date(e.time).toISOString()}>
              {formatClock(new Date(e.time))}
            </time>
            <span className={cn('w-[46px] shrink-0 text-[11px] font-medium', SOURCE_STYLE[e.source])}>{SOURCE_LABEL[e.source]}</span>
            <span className={cn('min-w-0 break-words', LEVEL_STYLE[e.level])}>{e.message}</span>
          </motion.li>
        ))}
      </AnimatePresence>
    </ol>
  )
}
