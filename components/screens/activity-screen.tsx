'use client'

import { useState } from 'react'
import { useMiner } from '@/lib/miner/store'
import type { LogSource } from '@/lib/miner/types'
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
        <div className="mac-segmented" role="group" aria-label="Filter by source">
          {FILTERS.map((f) => (
            <button
              key={f === 'ALL' ? 'All' : f.charAt(0) + f.slice(1).toLowerCase()}
              type="button"
              onClick={() => setFilter(f)}
              aria-pressed={filter === f}
              aria-selected={filter === f}
            >
              {f === 'ALL' ? 'All' : f.charAt(0) + f.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      }
    >
      <div className="max-h-[calc(100vh-14rem)] overflow-y-auto pr-2">
        {entries.length === 0 ? <p className="py-10 text-center text-[13px] text-muted-foreground">Nothing from this source yet.</p> : <LogFeed entries={entries} limit={200} />}
      </div>
    </Panel>
  )
}
