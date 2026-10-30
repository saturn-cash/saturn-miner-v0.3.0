'use client'

import { useState } from 'react'
import { useMiner } from '@/lib/miner/store'
import type { LogSource } from '@/lib/miner/types'
import { cn } from '@/lib/utils'
import { LogFeed } from '../hud/log-feed'
import { Panel } from '../hud/panel'

const FILTERS: Array<LogSource | 'ALL'> = ['ALL', 'MINER', 'POOL', 'NODE', 'WALLET', 'SYSTEM']

export function ActivityScreen() {
  const log = useMiner((s) => s.log)
  const [filter, setFilter] = useState<LogSource | 'ALL'>('ALL')
  const entries = filter === 'ALL' ? log : log.filter((e) => e.source === filter)

  return (
    <Panel
      title="Event stream" meta={`${entries.length} events`}
     
      action={
        <div className="flex flex-wrap gap-1" role="group" aria-label="Filter by source">
          {FILTERS.map((f) => (
            <button
              key={f === 'ALL' ? 'All' : f.charAt(0) + f.slice(1).toLowerCase()}
              type="button"
              onClick={() => setFilter(f)}
              aria-pressed={filter === f}
              className={cn('rounded-full px-3 py-1 text-[12px] transition-colors', filter === f ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-[rgb(234_240_255/0.06)] hover:text-foreground')}
            >
              {f === 'ALL' ? 'All' : f.charAt(0) + f.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      }
    >
      <div className="max-h-[calc(100vh-14rem)] overflow-y-auto pr-2">
        {entries.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">Nothing from this source yet.</p> : <LogFeed entries={entries} limit={200} />}
      </div>
    </Panel>
  )
}
