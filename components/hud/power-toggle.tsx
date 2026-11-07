'use client'

import { Power } from 'lucide-react'
import { minerActions, useMiner } from '@/lib/miner/store'
import { cn } from '@/lib/utils'

/**
 * Start / stop mining from the toolbar, a small pill next to the sound switch. Green while mining,
 * pulsing while it starts; does the same as clicking the hologram coin.
 */
export function PowerToggle({ className, withLabel = false }: { className?: string; withLabel?: boolean }) {
  const status = useMiner((s) => s.status)
  const mining = status === 'mining'
  const starting = status === 'starting'
  const label = mining ? 'Stop mining' : starting ? 'Cancel start' : status === 'stopping' ? 'Stopping…' : 'Start mining'
  return (
    <button
      type="button"
      onClick={() => (mining || starting ? minerActions.stop() : minerActions.start())}
      disabled={status === 'stopping'}
      aria-pressed={mining}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex h-[26px] shrink-0 items-center gap-1.5 rounded-md px-2 text-[12px] font-medium shadow-[inset_0_0_0_0.5px_rgb(255_255_255/0.1)] transition-colors disabled:cursor-wait',
        mining
          ? 'bg-[rgb(61_255_139/0.16)] text-[#7dffb4] shadow-[inset_0_0_0_0.5px_rgb(61_255_139/0.4),0_0_10px_rgb(61_255_139/0.25)] hover:bg-[rgb(61_255_139/0.24)]'
          : starting
            ? 'animate-pulse bg-[rgb(61_255_139/0.1)] text-[#7dffb4]'
            : 'bg-white/[0.06] text-white/80 hover:bg-white/[0.12]',
        className,
      )}
    >
      <Power className="size-[15px]" aria-hidden="true" />
      {withLabel && <span>{mining ? 'Mining' : starting ? 'Starting' : 'Off'}</span>}
    </button>
  )
}
