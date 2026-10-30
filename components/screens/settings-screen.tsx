'use client'

import { Input } from '@/components/ui/input'
import { celebrate } from '@/lib/cosmos/store'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { minerActions, useMiner } from '@/lib/miner/store'
import type { Settings } from '@/lib/miner/types'
import { cn } from '@/lib/utils'
import { Panel } from '../hud/panel'

type BoolKey = { [K in keyof Settings]: Settings[K] extends boolean ? K : never }[keyof Settings]

const TOGGLES: Array<{ key: BoolKey; label: string; description: string }> = [
  { key: 'animations', label: 'Cinematic flight', description: 'Warp between destinations, comets for shares and the block-found supernova. Turn off to free up GPU time.' },
  { key: 'sound', label: 'Sound', description: 'A space drone that rises with your hashrate, warp whooshes between destinations, and chimes for shares and blocks.' },
  { key: 'ecoOnBattery', label: 'Eco mode on battery', description: 'Halve intensity automatically when unplugged.' },
  { key: 'minimizeToTray', label: 'Minimise to tray', description: 'Keep mining in the background when the window closes.' },
  { key: 'launchOnStartup', label: 'Launch on startup', description: 'Start Saturn Miner when you log in to Windows.' },
]

export function SettingsScreen() {
  const settings = useMiner((s) => s.settings)
  const source = useMiner((s) => s.source)
  const node = useMiner((s) => s.node)
  const height = useMiner((s) => s.network.height)

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Panel title="Experience">
        <ul className="divide-y divide-white/10">
          {TOGGLES.map((t) => (
            <li key={t.key} className="flex items-center justify-between gap-6 py-4 first:pt-0">
              <div>
                <label htmlFor={`set-${t.key}`} className="text-sm">
                  {t.label}
                </label>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{t.description}</p>
              </div>
              <Switch id={`set-${t.key}`} checked={settings[t.key]} onCheckedChange={(v) => minerActions.updateSettings({ [t.key]: v })} />
            </li>
          )).flatMap((row, i) =>
            TOGGLES[i].key === 'sound' && settings.sound
              ? [
                  row,
                  <li key="volume" className="flex items-center justify-between gap-6 py-4">
                    <label htmlFor="set-volume" className="text-sm">
                      Volume
                    </label>
                    <div className="flex w-56 items-center gap-3">
                      <Slider
                        id="set-volume"
                        value={[Math.round(settings.volume * 100)]}
                        min={0}
                        max={100}
                        step={5}
                        onValueChange={(v) => minerActions.updateSettings({ volume: (Array.isArray(v) ? v[0] : (v as number)) / 100 })}
                        aria-label="Volume"
                      />
                      <span className="w-9 text-right font-display text-[length:calc(13px*var(--ds))] text-primary tabular-nums">{Math.round(settings.volume * 100)}</span>
                    </div>
                  </li>,
                ]
              : [row],
          )}
          <li className="flex items-center justify-between gap-6 py-4">
            <div>
              <p className="text-sm" id="fps-label">
                3D frame-rate cap
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">Lower caps leave more CPU for hashing.</p>
            </div>
            <div className="flex rounded-full bg-[rgb(234_240_255/0.04)] p-1 shadow-[inset_0_0_0_1px_rgb(234_240_255/0.08)]" role="radiogroup" aria-labelledby="fps-label">
              {([30, 60] as const).map((fps) => (
                <button
                  key={fps}
                  type="button"
                  role="radio"
                  aria-checked={settings.fpsCap === fps}
                  onClick={() => minerActions.updateSettings({ fpsCap: fps })}
                  className={cn('rounded-full px-3.5 py-1 text-[13px] font-medium transition-colors', settings.fpsCap === fps ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
                >
                  {fps}
                </button>
              ))}
            </div>
          </li>
          <li className="flex items-center justify-between gap-6 py-4 last:pb-0">
            <div>
              <p className="text-sm">Block-found celebration</p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">Finding a block is rare. See what happens when you do.</p>
            </div>
            <button
              type="button"
              onClick={() => celebrate(height + 1, 50, true)}
              className="shrink-0 rounded-full px-4 py-1.5 text-[13px] font-medium text-primary shadow-[inset_0_0_0_1px_rgb(242_182_109/0.45)] transition-colors hover:bg-primary/10"
            >
              Preview
            </button>
          </li>
        </ul>
      </Panel>

      <Panel title="Saturn Core connection">
        <label htmlFor="rpc-url" className="mb-2 block text-[12.5px] text-muted-foreground">
          RPC endpoint
        </label>
        <Input id="rpc-url" value={settings.rpcUrl} onChange={(e) => minerActions.updateSettings({ rpcUrl: e.target.value })} className="h-10 rounded-xl font-mono text-[12px]" spellCheck={false} />
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="rpc-user" className="mb-2 block text-[12.5px] text-muted-foreground">RPC user (optional)</label>
            <Input id="rpc-user" value={settings.rpcUser} onChange={(e) => minerActions.updateSettings({ rpcUser: e.target.value })} className="h-10 rounded-xl font-mono text-[12px]" spellCheck={false} autoComplete="off" />
          </div>
          <div>
            <label htmlFor="rpc-pass" className="mb-2 block text-[12.5px] text-muted-foreground">RPC password</label>
            <Input id="rpc-pass" type="password" value={settings.rpcPassword} onChange={(e) => minerActions.updateSettings({ rpcPassword: e.target.value })} className="h-10 rounded-xl font-mono text-[12px]" autoComplete="off" />
          </div>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">Leave user and password empty when Saturn Core runs on this computer: the app reads the node&apos;s cookie file. Fill them in to reach a node elsewhere (set rpcuser/rpcpassword in its saturn.conf).</p>
        <dl className="mt-6 grid grid-cols-2 gap-3 text-[13px]">
          <div className="well p-3">
            <dt className="text-[12px] text-muted-foreground">Data source</dt>
            <dd className={cn('mt-1', source === 'tauri' ? 'text-primary' : 'text-warn')}>{source === 'tauri' ? 'Live backend' : 'Simulation'}</dd>
          </div>
          <div className="well p-3">
            <dt className="text-[12px] text-muted-foreground">Node</dt>
            <dd className={cn('mt-1 truncate', node.connected ? 'text-ok' : 'text-warn')}>{node.connected ? `Connected ${node.version}` : source === 'tauri' ? 'Not connected' : 'Simulated'}</dd>
          </div>
        </dl>
      </Panel>
    </div>
  )
}
