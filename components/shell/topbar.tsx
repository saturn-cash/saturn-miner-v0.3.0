'use client'

import { AnimatePresence, motion } from 'motion/react'
import { useCosmosUi } from '@/lib/cosmos/store'
import { formatHashrate, formatInt } from '@/lib/format'
import { useMiner } from '@/lib/miner/store'
import { SaturnLogo } from './saturn-logo'
import { type ScreenId, screenMeta } from './destinations'

function compactKm(km: number) {
  if (km >= 1e9) return `${(km / 1e9).toFixed(2)}B km`
  if (km >= 1e6) return `${(km / 1e6).toFixed(2)}M km`
  return `${formatInt(km)} km`
}

/** One quiet status capsule instead of a row of chips. */
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
    <div className="glass flex items-center gap-3 !rounded-full py-2 pl-3.5 pr-4 text-[13px]" aria-live="off">
      <span className="relative flex size-2.5">
        {mining && <span className="absolute inset-0 animate-ping rounded-full bg-ok opacity-60" />}
        <span className={mining ? 'relative size-2.5 rounded-full bg-ok' : 'relative size-2.5 rounded-full bg-white/35'} />
      </span>
      <span className="font-semibold tabular-nums">{mining ? formatHashrate(hashrate) : status === 'idle' ? 'Idle' : status === 'starting' ? 'Starting' : 'Stopping'}</span>
      <span className="hidden h-4 w-px bg-white/15 sm:block" aria-hidden="true" />
      <span className="hidden tabular-nums text-white/60 sm:inline">{traveling ? `${compactKm(velocity)}/s` : `${compactKm(altitude)} up`}</span>
      {(source === 'simulation' || !synced) && (
        <>
          <span className="hidden h-4 w-px bg-white/15 md:block" aria-hidden="true" />
          <span className="hidden text-warn md:inline" title={source === 'simulation' ? 'Browser preview: all numbers are simulated' : nodeUp ? 'Saturn Core is still syncing' : 'Wallet and network data need a Saturn Core node (Settings)'}>
            {source === 'simulation' ? 'Simulated' : nodeUp ? 'Syncing' : 'No node'}
          </span>
        </>
      )}
    </div>
  )
}

export function Topbar({ screen }: { screen: ScreenId }) {
  const meta = screenMeta(screen)
  return (
    <header className="relative z-10 flex shrink-0 items-start justify-between gap-4 px-5 pb-2 pt-6 md:px-10 md:pt-8">
      <div className="flex min-w-0 items-center gap-4">
        <SaturnLogo className="hidden size-11 shrink-0 md:block" />
        <AnimatePresence mode="wait">
          <motion.div key={screen} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }} className="min-w-0">
            <h1 className="truncate text-[30px] font-bold leading-none tracking-[-0.035em] md:text-[34px]">{meta.label}</h1>
            <p className="mt-1.5 text-[15px] leading-none text-white/55">{meta.place}</p>
          </motion.div>
        </AnimatePresence>
      </div>
      <StatusCapsule />
    </header>
  )
}
