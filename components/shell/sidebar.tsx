'use client'

import { Square, Play } from 'lucide-react'
import { formatHashrate } from '@/lib/format'
import { minerActions, useMiner } from '@/lib/miner/store'
import type { Platform } from '@/lib/platform'
import { cn } from '@/lib/utils'
import { SCREENS, type ScreenId } from './destinations'

const GROUPS: Array<{ title?: string; ids: ScreenId[] }> = [
  { ids: ['overview'] },
  { title: 'Mining', ids: ['mining', 'hardware'] },
  { title: 'Saturn', ids: ['wallet', 'network', 'activity'] },
  { title: 'System', ids: ['diagnostics', 'settings'] },
]

/**
 * Source-list sidebar in the style of Music / System Settings: vibrant material, 13pt rows with
 * accent-tinted symbols, grey selection, small section headers. On macOS the window's traffic lights
 * sit in the reserved strip at the top.
 */
export function Sidebar({ active, onSelect, platform }: { active: ScreenId; onSelect: (id: ScreenId) => void; platform: Platform }) {
  return (
    <aside className="sidebar relative z-20 hidden w-[220px] shrink-0 flex-col md:flex" aria-label="Sidebar">
      {/* title-bar strip: traffic lights on macOS, drag area everywhere */}
      <div data-tauri-drag-region className={cn('shrink-0', platform === 'mac-app' ? 'h-[52px]' : platform === 'web' ? 'h-[52px]' : 'h-3')}>
        {platform === 'web' && <PreviewTrafficLights />}
      </div>

      <nav className="flex-1 overflow-y-auto px-2.5 pb-3" aria-label="Destinations">
        {GROUPS.map((g, gi) => (
          <div key={gi} className={gi > 0 ? 'mt-4' : ''}>
            {g.title && <p className="t-subhead tertiary mb-0.5 px-2.5 font-semibold">{g.title}</p>}
            <ul className="flex flex-col gap-px">
              {g.ids.map((id) => {
                const s = SCREENS.find((x) => x.id === id)!
                const Icon = s.icon
                const on = id === active
                return (
                  <li key={id}>
                    <button
                      type="button"
                      onClick={() => onSelect(id)}
                      aria-current={on ? 'page' : undefined}
                      title={s.place}
                      className={cn('flex h-[28px] w-full items-center gap-2 rounded-md px-2.5 text-left text-[13px] outline-none transition-colors', on ? 'bg-white/[0.11] text-white' : 'text-white/85 hover:bg-white/[0.04]')}
                    >
                      <Icon className="size-[15px] shrink-0 text-primary" strokeWidth={1.9} aria-hidden="true" />
                      <span className="truncate">{s.label}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>

      <MiningStatus />
    </aside>
  )
}

/** Live miner state pinned to the bottom of the sidebar, like a Now Playing strip. */
function MiningStatus() {
  const status = useMiner((s) => s.status)
  const hashrate = useMiner((s) => s.hashrate)
  const accepted = useMiner((s) => s.acceptedShares)
  const mining = status === 'mining'
  const busy = status === 'starting' || status === 'stopping'
  return (
    <div className="m-2.5 mt-0 rounded-[10px] bg-white/[0.05] p-2.5 shadow-[inset_0_0_0_0.5px_rgb(255_255_255/0.08)]">
      <div className="flex items-center gap-2.5">
        <span className={cn('hex grid size-8 shrink-0 place-items-center', mining ? 'spectrum-fill' : 'bg-white/10')} aria-hidden="true">
          <span className="hex block size-[26px] bg-[#1c1c1e]/70" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="t-headline truncate">{mining ? formatHashrate(hashrate) : busy ? (status === 'starting' ? 'Starting…' : 'Stopping…') : 'Not mining'}</p>
          <p className="t-subhead secondary truncate">{mining ? `${accepted} shares accepted` : 'Saturn mainnet'}</p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => (mining ? minerActions.stop() : minerActions.start())}
          aria-label={mining ? 'Stop mining' : 'Start mining'}
          className="grid size-7 shrink-0 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/[0.16] disabled:opacity-40"
        >
          {mining ? <Square className="size-3 fill-current" aria-hidden="true" /> : <Play className="ml-0.5 size-3.5 fill-current" aria-hidden="true" />}
        </button>
      </div>
    </div>
  )
}

/** Browser preview only: shows where the real macOS window controls sit. Decorative. */
function PreviewTrafficLights() {
  return (
    <div className="flex gap-2 px-[20px] pt-[19px]" aria-hidden="true">
      {['#ff5f57', '#febc2e', '#28c840'].map((c) => (
        <span key={c} className="size-3 rounded-full shadow-[inset_0_0_0_0.5px_rgb(0_0_0/0.25)]" style={{ background: c }} />
      ))}
    </div>
  )
}
