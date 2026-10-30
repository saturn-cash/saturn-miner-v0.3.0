'use client'

import { Play, Square } from 'lucide-react'
import { useCosmosUi } from '@/lib/cosmos/store'
import { formatHashrate, formatInt } from '@/lib/format'
import { minerActions, useMiner } from '@/lib/miner/store'
import { cn } from '@/lib/utils'
import { type ScreenId, screenMeta } from './destinations'

function compactKm(km: number) {
  if (km >= 1e9) return `${(km / 1e9).toFixed(2)}B km`
  if (km >= 1e6) return `${(km / 1e6).toFixed(2)}M km`
  return `${formatInt(km)} km`
}

/** Status readout in the toolbar: a dot, the miner state, and where the ship is. */
function StatusCapsule() {
  const status = useMiner((s) => s.status)
  const hashrate = useMiner((s) => s.hashrate)
  const source = useMiner((s) => s.source)
  const synced = useMiner((s) => s.network.synced)
  const nodeUp = useMiner((s) => s.node.connected)
  const altitude = useCosmosUi((s) => Math.round(s.altitude / 100) * 100)
  const velocity = useCosmosUi((s) => Math.round(s.velocity / 1000) * 1000)
  const traveling = useCosmosUi((s) => s.traveling)
  const mining = status === 'mining'

  return (
    <div className="flex h-[26px] items-center gap-2.5 rounded-md bg-white/[0.06] px-2.5 text-[12px] shadow-[inset_0_0_0_0.5px_rgb(255_255_255/0.08)]" aria-live="off">
      <span className={cn('size-[7px] rounded-full', mining ? 'bg-ok shadow-[0_0_6px_var(--ok)]' : 'bg-white/30')} aria-hidden="true" />
      <span className="font-medium tabular-nums">{mining ? formatHashrate(hashrate) : status === 'idle' ? 'Idle' : status === 'starting' ? 'Starting' : 'Stopping'}</span>
      <span className="hidden h-3 w-px bg-white/15 lg:block" aria-hidden="true" />
      <span className="secondary hidden tabular-nums lg:inline">{traveling ? `${compactKm(velocity)}/s` : `${compactKm(altitude)} up`}</span>
      {(source === 'simulation' || !synced) && (
        <>
          <span className="hidden h-3 w-px bg-white/15 md:block" aria-hidden="true" />
          <span className="hidden text-warn md:inline" title={source === 'simulation' ? 'Browser preview: all numbers are simulated' : nodeUp ? 'Saturn Core is still syncing' : 'Wallet and network data need a Saturn Core node (Settings)'}>
            {source === 'simulation' ? 'Simulated' : nodeUp ? 'Syncing' : 'No node'}
          </span>
        </>
      )}
    </div>
  )
}

/**
 * Unified macOS toolbar: title with a subtitle (macOS 11+ style) on the leading side, status and the
 * primary action on the trailing side. The whole strip drags the window.
 */
export function Topbar({ screen }: { screen: ScreenId }) {
  const meta = screenMeta(screen)
  const status = useMiner((s) => s.status)
  const mining = status === 'mining'
  const busy = status === 'starting' || status === 'stopping'
  return (
    <header data-tauri-drag-region className="toolbar relative z-10 flex h-[52px] shrink-0 items-center justify-between gap-4 px-5">
      <div data-tauri-drag-region className="min-w-0">
        <h1 className="t-title3 truncate leading-[18px]">{meta.label}</h1>
        <p className="t-subhead secondary truncate">{meta.place}</p>
      </div>
      <div className="flex items-center gap-2">
        <StatusCapsule />
        <button
          type="button"
          className="mac-button"
          data-variant={mining ? undefined : 'primary'}
          disabled={busy}
          onClick={() => (mining ? minerActions.stop() : minerActions.start())}
        >
          {mining ? <Square className="size-3 fill-current" aria-hidden="true" /> : <Play className="size-3 fill-current" aria-hidden="true" />}
          {mining ? 'Stop' : 'Start Mining'}
        </button>
      </div>
    </header>
  )
}
