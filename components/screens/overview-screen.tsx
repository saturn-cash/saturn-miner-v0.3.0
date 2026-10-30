'use client'

import { ArrowUpRight } from 'lucide-react'
import { motion } from 'motion/react'
import { formatCoin, formatDuration, formatHashrate, formatInt, hashrateUnit, shortHash, timeAgo } from '@/lib/format'
import { useMiner } from '@/lib/miner/store'
import { AreaChart } from '../hud/charts'
import { IgnitionButton } from '../hud/ignition-button'
import { LogFeed } from '../hud/log-feed'
import { Label, Panel, StatusDot } from '../hud/panel'
import { Ticker } from '../hud/ticker'
import type { ScreenId } from '../shell/destinations'
import { FlightMap } from '../shell/flight-map'

export function OverviewScreen({ onNavigate }: { onNavigate: (id: ScreenId) => void }) {
  return (
    <div className="flex flex-col gap-5">
      <Hero />
      <div className="grid gap-5 xl:grid-cols-3">
        <HashratePanel />
        <NetworkPanel onNavigate={onNavigate} />
      </div>
      <div className="grid gap-5 xl:grid-cols-3">
        <Panel title="Event stream" className="xl:col-span-2" action={<NavLink onClick={() => onNavigate('activity')}>All events</NavLink>}>
          <LogFeedConnected />
        </Panel>
        <WalletPanel onNavigate={onNavigate} />
      </div>
    </div>
  )
}

function NavLink({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary">
      {children}
      <ArrowUpRight className="size-3.5" aria-hidden="true" />
    </button>
  )
}

/** No box around the hero: the planet behind it is the hero. */
function Hero() {
  const status = useMiner((s) => s.status)
  const hashrate = useMiner((s) => s.hashrate)
  const mode = useMiner((s) => s.config.mode)
  const threads = useMiner((s) => s.config.threads)
  const { divisor, unit } = hashrateUnit(Math.max(hashrate, 1e6))
  const mining = status === 'mining'

  const line =
    status === 'mining'
      ? `Mining in ${mode} mode on ${threads} threads`
      : status === 'starting'
        ? 'Engine spinning up'
        : status === 'stopping'
          ? 'Draining the work queue'
          : 'Engine idle. Start mining to light up the rings.'

  return (
    <section className="relative flex min-h-[min(62vh,600px)] flex-col justify-end pb-4" aria-label="Mining status">
      <div className="flex flex-wrap items-end gap-x-12 gap-y-6">
        <div>
          <p className="text-[17px] font-medium text-white/70">Your hashrate</p>
          <p className="flex items-baseline gap-3">
            <Ticker value={hashrate / divisor} format={(n) => n.toFixed(2)} className="gold-text text-[clamp(84px,11vw,176px)] leading-[0.95] [text-shadow:0_2px_30px_rgb(0_0_0/0.35)]" />
            <span className="text-[clamp(22px,2.2vw,32px)] font-semibold tracking-[-0.02em] text-white/70">{unit}</span>
          </p>
          <p className="mt-2 flex items-center gap-2 text-[15px] text-white/60">
            <StatusDot tone={mining ? 'green' : 'muted'} pulse={mining} />
            {line}
          </p>
        </div>
        <div className="pb-2">
          <IgnitionButton />
        </div>
      </div>

      <div className="mt-8 flex flex-wrap items-stretch gap-5">
        <HeroStats />
        <div className="glass hidden w-[280px] p-3 lg:block">
          <FlightMap active="overview" />
        </div>
      </div>
    </section>
  )
}

function HeroStats() {
  const accepted = useMiner((s) => s.acceptedShares)
  const rejected = useMiner((s) => s.rejectedShares)
  const uptime = useMiner((s) => s.uptime)
  const blocks = useMiner((s) => s.blocksFound)
  const ratio = accepted + rejected > 0 ? (accepted / (accepted + rejected)) * 100 : 100

  const stats = [
    { label: 'Shares accepted', value: accepted, format: formatInt, sub: `${ratio.toFixed(1)}% good` },
    { label: 'Shares rejected', value: rejected, format: formatInt, sub: rejected === 0 ? 'Clean run' : 'Stale jobs' },
    { label: 'Uptime', value: uptime, format: formatDuration, sub: 'This session' },
    { label: 'Blocks found', value: blocks, format: formatInt, sub: 'This session' },
  ]

  return (
    <dl className="glass grid flex-1 grid-cols-2 md:max-w-[880px] md:grid-cols-4">
      {stats.map(({ label, value, format, sub }, i) => (
        <div key={label} className={i > 0 ? 'border-white/10 px-6 py-5 md:border-l' : 'px-6 py-5'}>
          <dt className="text-[13px] font-medium text-white/55">{label}</dt>
          <dd>
            <Ticker value={value} format={format} className="mt-1.5 block text-[28px] font-semibold tracking-[-0.03em]" />
            <span className="text-[12.5px] text-white/45">{sub}</span>
          </dd>
        </div>
      ))}
    </dl>
  )
}

function HashratePanel() {
  const history = useMiner((s) => s.history)
  const hashrate = useMiner((s) => s.hashrate)
  const nonZero = history.filter((h) => h > 0)
  const avg = nonZero.length ? nonZero.reduce((a, b) => a + b, 0) / nonZero.length : 0
  const peak = Math.max(0, ...history)
  return (
    <Panel title="Hashrate" meta="Last 2 minutes" className="xl:col-span-2">
      <div className="mb-4 flex flex-wrap gap-8">
        {[
          ['Now', formatHashrate(hashrate), 'text-primary'],
          ['Average', formatHashrate(avg), ''],
          ['Peak', formatHashrate(peak), ''],
        ].map(([l, v, c]) => (
          <div key={l}>
            <Label>{l}</Label>
            <p className={`font-display mt-0.5 text-[17px] font-semibold tabular-nums ${c}`}>{v}</p>
          </div>
        ))}
      </div>
      <AreaChart data={history} className="h-44" label={(m) => formatHashrate(m)} />
      <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
        <span>2 min ago</span>
        <span>1 min ago</span>
        <span>Now</span>
      </div>
    </Panel>
  )
}

function NetworkPanel({ onNavigate }: { onNavigate: (id: ScreenId) => void }) {
  const height = useMiner((s) => s.network.height)
  const difficulty = useMiner((s) => s.network.difficulty)
  const netHash = useMiner((s) => s.network.networkHashrate)
  const blocks = useMiner((s) => s.blocks)
  const latest = blocks[0]
  return (
    <Panel title="Network" action={<NavLink onClick={() => onNavigate('network')}>Explore</NavLink>}>
      <dl className="grid grid-cols-2 gap-5">
        <div>
          <Label>Block height</Label>
          <dd className="font-display mt-1 text-[length:calc(22px*var(--ds))] font-semibold tabular-nums">
            <Ticker value={height} format={formatInt} />
          </dd>
        </div>
        <div>
          <Label>Network hashrate</Label>
          <dd className="font-display mt-1 text-[length:calc(22px*var(--ds))] font-semibold tabular-nums text-accent">{formatHashrate(netHash)}</dd>
        </div>
        <div className="col-span-2">
          <Label>Difficulty</Label>
          <dd className="mt-1 text-[14px] tabular-nums">{difficulty.toLocaleString('en-US', { maximumFractionDigits: 2 })}</dd>
        </div>
      </dl>
      {latest && (
        <motion.div key={latest.height} initial={{ opacity: 0, y: 8, boxShadow: 'inset 0 0 0 1px rgba(242,182,109,0.9)' }} animate={{ opacity: 1, y: 0, boxShadow: 'inset 0 0 0 1px rgba(234,240,255,0.07)' }} transition={{ duration: 1.4 }} className="mt-6 rounded-2xl bg-[rgb(234_240_255/0.035)] p-4">
          <p className="flex items-center justify-between text-[13px]">
            <span>Latest block #{formatInt(latest.height)}</span>
            <span className="text-muted-foreground">{timeAgo(latest.time)}</span>
          </p>
          <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">{shortHash(latest.hash, 14, 8)}</p>
        </motion.div>
      )}
    </Panel>
  )
}

function LogFeedConnected() {
  const log = useMiner((s) => s.log)
  return <LogFeed entries={log} limit={9} />
}

function WalletPanel({ onNavigate }: { onNavigate: (id: ScreenId) => void }) {
  const balance = useMiner((s) => s.wallet.balance)
  const immature = useMiner((s) => s.wallet.immature)
  return (
    <Panel title="Wallet" action={<NavLink onClick={() => onNavigate('wallet')}>Fly to Titan</NavLink>}>
      <Label>Available</Label>
      <p className="mt-1 flex items-baseline gap-2">
        <Ticker value={balance} format={(n) => formatCoin(n, 4)} className="display text-[length:calc(40px*var(--ds))]" />
        <span className="font-display text-[length:calc(15px*var(--ds))] text-primary">SAT</span>
      </p>
      <div className="mt-6 rounded-2xl bg-[rgb(234_240_255/0.035)] p-4 shadow-[inset_0_0_0_1px_rgb(234_240_255/0.07)]">
        <Label>Maturing rewards</Label>
        <p className="font-display mt-1 text-[length:calc(16px*var(--ds))] tabular-nums">
          <Ticker value={immature} format={(n) => formatCoin(n, 2)} /> SAT
        </p>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">Block rewards unlock after 100 confirmations.</p>
      </div>
    </Panel>
  )
}
