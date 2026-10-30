'use client'

import { AnimatePresence, motion } from 'motion/react'
import { formatHashrate, formatInt, shortHash, timeAgo } from '@/lib/format'
import { useMiner } from '@/lib/miner/store'
import type { Peer } from '@/lib/miner/types'
import { cn } from '@/lib/utils'
import { NodeNotice } from '../hud/node-notice'
import { Label, Panel, StatusDot } from '../hud/panel'
import { Ticker } from '../hud/ticker'

export function NetworkScreen() {
  const network = useMiner((s) => s.network)
  const blocks = useMiner((s) => s.blocks)

  const stats = [
    { label: 'Block height', node: <Ticker value={network.height} format={formatInt} /> },
    { label: 'Network hashrate', node: formatHashrate(network.networkHashrate) },
    { label: 'Difficulty', node: network.difficulty.toLocaleString('en-US', { maximumFractionDigits: 2 }) },
    { label: 'Mempool', node: <><Ticker value={network.mempool} format={formatInt} /> tx</> },
  ]

  return (
    <div className="flex flex-col gap-5">
      <NodeNotice what="Peers, blocks and chain stats" />
      <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
        {stats.map((s, i) => (
          <Panel key={s.label}>
            <Label>{s.label}</Label>
            <p className="font-display mt-2 truncate text-[length:calc(clamp(18px,1.7vw,26px)*var(--ds))] font-semibold tabular-nums">{s.node}</p>
          </Panel>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-5">
        <Panel title="Peers" meta={`${network.peers.length} connected, sorted by distance`} className="xl:col-span-2">
          <Radar peers={network.peers} />
        </Panel>

        <Panel title="Chain" meta="Newest block on the right" className="xl:col-span-3">
          <BlockChain />
        </Panel>
      </div>

      <Panel title="Recent blocks">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-[13px]">
            <thead>
              <tr className="text-left text-[12px] text-muted-foreground">
                <th scope="col" className="pb-2 font-normal">Height</th>
                <th scope="col" className="pb-2 font-normal">Hash</th>
                <th scope="col" className="pb-2 font-normal">Txs</th>
                <th scope="col" className="pb-2 font-normal">Size</th>
                <th scope="col" className="pb-2 text-right font-normal">Age</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgb(234_240_255/0.06)]">
              {blocks.slice(0, 10).map((b) => (
                <tr key={b.height} className={cn('transition-colors hover:bg-primary/5', b.minedByYou && 'text-primary')}>
                  <td className="py-2">
                    #{formatInt(b.height)} {b.minedByYou && <span className="ml-2 rounded-full bg-primary/15 px-2 py-0.5 text-[11px] text-primary">Yours</span>}
                  </td>
                  <td className="py-2 font-mono text-[12px] text-muted-foreground">{shortHash(b.hash, 12, 8)}</td>
                  <td className="py-2">{b.txCount}</td>
                  <td className="py-2">{(b.size / 1000).toFixed(1)} kB</td>
                  <td className="py-2 text-right text-muted-foreground">{timeAgo(b.time)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  )
}

function Radar({ peers }: { peers: Peer[] }) {
  return (
    <div className="flex flex-col gap-5 sm:flex-row xl:flex-col 2xl:flex-row">
      <div className="relative mx-auto aspect-square w-full max-w-[240px] shrink-0">
        {[1, 0.72, 0.44].map((s) => (
          <span key={s} aria-hidden="true" className="absolute rounded-full border border-accent/25" style={{ inset: `${((1 - s) / 2) * 100}%` }} />
        ))}
        <span aria-hidden="true" className="absolute inset-x-0 top-1/2 h-px bg-accent/15" />
        <span aria-hidden="true" className="absolute inset-y-0 left-1/2 w-px bg-accent/15" />
        <div aria-hidden="true" className="absolute inset-0 rounded-full [animation:radar-spin_4s_linear_infinite]" style={{ background: 'conic-gradient(from 0deg, rgba(95, 227, 208, 0.35), transparent 25%)' }} />
        {peers.map((p, i) => {
          const angle = (i / peers.length) * Math.PI * 2 + i * 0.7
          const dist = 0.2 + Math.min(1, p.latency / 260) * 0.75
          return (
            <motion.span
              key={p.id}
              className="absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent shadow-[0_0_10px_var(--accent)]"
              style={{ left: `${50 + Math.cos(angle) * dist * 46}%`, top: `${50 + Math.sin(angle) * dist * 46}%` }}
              initial={{ scale: 0 }}
              animate={{ scale: [1, 1.5, 1] }}
              transition={{ duration: 2, repeat: Infinity, delay: i * 0.3 }}
              title={`${p.location} · ${p.latency}ms`}
            />
          )
        })}
        <span aria-hidden="true" className="absolute left-1/2 top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary shadow-[0_0_16px_var(--primary)]" />
      </div>
      <ul className="flex-1 space-y-1 text-[13px]">
        {peers.map((p) => (
          <li key={p.id} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-accent/5">
            <span className="flex items-center gap-2">
              <StatusDot tone="cyan" />
              {p.location}
              <span className="text-muted-foreground">{p.inbound ? 'inbound' : 'outbound'}</span>
            </span>
            <span className={cn('tabular-nums', p.latency > 180 ? 'text-warn' : 'text-muted-foreground')}>{p.latency}ms</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function BlockChain() {
  const blocks = useMiner((s) => s.blocks)
  const visible = blocks.slice(0, 6).reverse()
  return (
    <div className="relative flex items-center gap-3 overflow-hidden py-6">
      <span aria-hidden="true" className="absolute inset-x-0 top-1/2 h-px bg-gradient-to-r from-transparent via-primary/40 to-primary" />
      <AnimatePresence initial={false} mode="popLayout">
        {visible.map((b, i) => (
          <motion.div
            key={b.height}
            layout
            initial={{ opacity: 0, scale: 0.4, x: 80 }}
            animate={{ opacity: 0.4 + (i / visible.length) * 0.6, scale: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0.6, x: -60 }}
            transition={{ type: 'spring', stiffness: 160, damping: 20 }}
            className={cn(
              'hex-card relative z-10 flex min-w-[88px] flex-1 flex-col gap-1 rounded-2xl bg-[rgb(20_11_36/0.9)] p-3 shadow-[inset_0_0_0_1px_rgb(234_240_255/0.08)]',
              i === visible.length - 1 && 'shadow-[inset_0_0_0_1px_var(--primary),0_0_30px_-6px_var(--primary)]',
              b.minedByYou && 'shadow-[inset_0_0_0_1px_rgb(242_182_109/0.7)]',
            )}
          >
            <span className="text-[11px] text-muted-foreground">#{formatInt(b.height)}</span>
            <span className="font-display text-[length:calc(15px*var(--ds))] font-semibold">{b.txCount} tx</span>
            <span className="truncate font-mono text-[10px] text-muted-foreground">{b.hash.slice(0, 10)}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
