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

/** macOS content group: translucent box, 13pt semibold title, 11pt secondary detail. */
export function Panel({ title, meta, action, children, className, bodyClassName }: PanelProps) {
  return (
    <section className={cn('glass flex flex-col', className)}>
      {title && (
        <header className="flex min-h-[40px] items-center justify-between gap-3 px-4 pt-3">
          <div className="flex min-w-0 items-baseline gap-2">
            <h2 className="t-headline truncate text-foreground">{title}</h2>
            {meta && <span className="t-subhead secondary truncate">{meta}</span>}
          </div>
          {action}
        </header>
      )}
      <div className={cn('relative flex-1 p-4', title && 'pt-2', bodyClassName)}>{children}</div>
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
    <span className="relative inline-flex size-[7px]" aria-hidden="true">
      {pulse && <span className={cn('absolute inset-0 animate-ping rounded-full opacity-70', color)} />}
      <span className={cn('relative inline-flex size-[7px] rounded-full', color)} />
    </span>
  )
}

export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('t-subhead secondary', className)}>{children}</p>
}
