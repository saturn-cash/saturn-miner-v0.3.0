'use client'

import { Link2Off, Loader2 } from 'lucide-react'
import { useMiner } from '@/lib/miner/store'

/**
 * Shown on the Wallet and Network screens in the desktop app when no Saturn Core node is reachable.
 * In the browser preview (simulation) it renders nothing.
 */
export function NodeNotice({ what }: { what: string }) {
  const source = useMiner((s) => s.source)
  const node = useMiner((s) => s.node)
  if (source !== 'tauri') return null
  if (node.connected && node.progress < 0.999) {
    return (
      <div className="glass-quiet flex items-start gap-3 !rounded-2xl p-4 text-[13px]" role="status">
        <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-accent" aria-hidden="true" />
        <p className="text-white/80">
          Saturn Core is still syncing ({(node.progress * 100).toFixed(1)}%). {what} will fill in as it catches up.
        </p>
      </div>
    )
  }
  if (node.connected) return null
  return (
    <div className="glass-quiet flex items-start gap-3 !rounded-2xl p-4 text-[13px]" role="status">
      <Link2Off className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden="true" />
      <div className="min-w-0">
        <p className="font-medium text-foreground">No Saturn Core node connected</p>
        <p className="mt-1 leading-relaxed text-white/65">
          {what} come from a Saturn Core node. Mining through the pool works without one; to see this screen live, run Saturn Core on this
          computer with <code className="font-mono text-white/80">server=1</code> in its <code className="font-mono text-white/80">saturn.conf</code>, then check the RPC
          endpoint in Settings.
        </p>
        {node.error && <p className="mt-1.5 truncate font-mono text-[11.5px] text-white/45">{node.error}</p>}
      </div>
    </div>
  )
}
