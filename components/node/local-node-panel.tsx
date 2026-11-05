'use client'

import { HardDrive, Loader2 } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { formatInt } from '@/lib/format'
import { useMiner } from '@/lib/miner/store'
import { localNodeActions, useLocalNode } from '@/lib/node/local'
import { cn } from '@/lib/utils'
import { Panel, StatusDot } from '../hud/panel'

const mb = (b: number) => `${(b / 1e6).toFixed(1)} MB`

/**
 * "Run a Saturn node": one switch that downloads Saturn Core the first time, starts it now and
 * every time Saturn opens, and stops it when switched off or when Saturn quits.
 */
export function LocalNodePanel({ compact = false }: { compact?: boolean }) {
  const available = useLocalNode((s) => s.available)
  const status = useLocalNode((s) => s.status)
  const busy = useLocalNode((s) => s.busy)
  const startedAt = useLocalNode((s) => s.startedAt)
  const runNode = useMiner((s) => s.settings.runNode)
  const node = useMiner((s) => s.node)
  const height = useMiner((s) => s.network.height)
  const peers = useMiner((s) => s.network.peers.length)

  if (!available || !status) return null

  const external = !status.running && status.rpcReachable && !busy
  const on = runNode && (status.running || busy === 'installing' || busy === 'starting')
  const dl = status.downloading
  const pct = dl && dl.total ? dl.received / dl.total : null
  const lonely = status.running && node.connected && peers === 0 && startedAt != null && Date.now() - startedAt > 30_000

  let tone: 'green' | 'gold' | 'cyan' | 'muted' | 'red' = 'muted'
  let line = 'Off'
  if (busy === 'installing') {
    tone = 'cyan'
    line = dl ? `Downloading Saturn Core ${status.version}… ${pct != null ? `${Math.round(pct * 100)}%` : mb(dl.received)}` : 'Getting ready to download…'
  } else if (busy === 'starting') {
    tone = 'cyan'
    line = 'Starting…'
  } else if (busy === 'stopping') {
    tone = 'gold'
    line = 'Stopping cleanly…'
  } else if (status.running) {
    if (!node.connected) {
      tone = 'cyan'
      line = 'Running, loading the chain…'
    } else if (node.progress < 0.999) {
      tone = 'cyan'
      line = `Syncing ${(node.progress * 100).toFixed(1)}% · block ${formatInt(node.height)}${height > node.height ? ` of ${formatInt(height)}` : ''} · ${peers} peer${peers === 1 ? '' : 's'}`
    } else {
      tone = 'green'
      line = `In sync at block ${formatInt(height)} · ${peers} peer${peers === 1 ? '' : 's'}`
    }
  } else if (external) {
    tone = 'green'
    line = 'Another Saturn Core node is running on this computer. Saturn uses it.'
  } else if (status.error) {
    tone = 'red'
    line = status.error
  } else if (!status.supported) {
    line = 'There is no Saturn Core build for this computer yet.'
  }

  return (
    <Panel
      title="Saturn node on this computer"
      meta={status.installed ? `Saturn Core ${status.version}` : undefined}
      action={
        <Switch
          aria-label="Run a Saturn node on this computer"
          checked={on || (runNode && busy === 'stopping')}
          disabled={!status.supported || busy === 'stopping' || busy === 'installing' || external}
          onCheckedChange={(v) => void (v ? localNodeActions.enable() : localNodeActions.disable())}
        />
      }
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-white/[0.06]">
          {busy ? <Loader2 className="size-4 animate-spin text-accent" aria-hidden="true" /> : <HardDrive className="size-4 text-white/70" aria-hidden="true" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-[13px]" role="status" aria-live="polite">
            <StatusDot tone={tone} pulse={tone === 'cyan'} />
            <span className={cn('min-w-0', tone === 'red' ? 'text-destructive' : 'text-foreground')}>{line}</span>
          </p>
          {busy === 'installing' && (
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10" aria-hidden="true">
              <div className={cn('h-full rounded-full bg-accent transition-[width] duration-500', pct == null && 'w-1/3 animate-pulse')} style={pct != null ? { width: `${Math.max(3, pct * 100)}%` } : undefined} />
            </div>
          )}
          {lonely && (
            <p className="t-subhead secondary mt-2 leading-relaxed">
              Looking for peers. The node connects to pool.saturn.boats on port 9999; until it gets through, network numbers keep coming from Saturn Pool.
            </p>
          )}
          {!compact && !status.running && !external && !busy && (
            <p className="t-subhead secondary mt-2 leading-relaxed">
              Runs a full Saturn Core node: it downloads and checks every block itself, relays blocks and transactions for the
              network, and gives this app its own view of the chain, peers and blocks. It starts with Saturn and stops when you quit.
              {!status.installed && ' Turning it on downloads Saturn Core (about 10 MB) from the official release and checks its SHA-256 first.'}
            </p>
          )}
          {(status.running || status.installed) && !compact && (
            <p className="mt-2 truncate font-mono text-[11.5px] text-white/45" title={status.datadir}>
              Data: {status.datadir}
            </p>
          )}
        </div>
      </div>
    </Panel>
  )
}
