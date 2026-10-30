'use client'

import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface PanelProps {
  title?: string
  /** short supporting detail shown beside the title, e.g. "8 threads" */
  meta?: string
  action?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
}

/** Glass instrument panel, lit along its upper-left edge by the same sun as Saturn. */
export function Panel({ title, meta, action, children, className, bodyClassName }: PanelProps) {
  return (
    <section className={cn('glass flex flex-col', className)}>
      {title && (
        <header className="flex items-center justify-between gap-3 px-6 pt-5 md:px-7 md:pt-6">
          <div className="flex min-w-0 items-baseline gap-2.5">
            <h2 className="truncate text-[17px] font-semibold tracking-[-0.02em] text-foreground">{title}</h2>
            {meta && <span className="truncate text-[13px] text-white/50">{meta}</span>}
          </div>
          {action}
        </header>
      )}
      <div className={cn('relative flex-1 p-6 md:p-7', title && 'pt-4 md:pt-4', bodyClassName)}>{children}</div>
    </section>
  )
}

export function StatusDot({ tone, pulse }: { tone: 'gold' | 'cyan' | 'red' | 'muted' | 'green'; pulse?: boolean }) {
  const color = {
    gold: 'bg-primary',
    cyan: 'bg-accent',
    red: 'bg-destructive',
    muted: 'bg-muted-foreground/50',
    green: 'bg-ok',
  }[tone]
  return (
    <span className="relative inline-flex size-2" aria-hidden="true">
      {pulse && <span className={cn('absolute inset-0 animate-ping rounded-full opacity-70', color)} />}
      <span className={cn('relative inline-flex size-2 rounded-full', color)} />
    </span>
  )
}

export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('text-[13px] text-white/55', className)}>{children}</p>
}
