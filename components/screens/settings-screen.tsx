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
  { key: 'minimizeToTray', label: 'Keep mining when closed', description: 'Closing the window leaves the miner running in the menu bar or tray.' },
  { key: 'launchOnStartup', label: 'Open at login', description: 'Start Saturn Miner when you log in.' },
]

export function SettingsScreen() {
  const settings = useMiner((s) => s.settings)
  const source = useMiner((s) => s.source)
  const node = useMiner((s) => s.node)
  const height = useMiner((s) => s.network.height)

  return (
    <div className="grid items-start gap-5 xl:grid-cols-2">
      <Panel title="Experience">
        <ul className="mac-rows -mx-4 -mb-4">
          {TOGGLES.map((t) => (
            <li key={t.key} className="flex min-h-[44px] items-center justify-between gap-6 px-4 py-2.5">
              <div>
                <label htmlFor={`set-${t.key}`} className="t-body">
                  {t.label}
                </label>
                <p className="t-subhead secondary mt-0.5">{t.description}</p>
              </div>
              <Switch id={`set-${t.key}`} checked={settings[t.key]} onCheckedChange={(v) => minerActions.updateSettings({ [t.key]: v })} />
            </li>
          )).flatMap((row, i) =>
            TOGGLES[i].key === 'sound' && settings.sound
              ? [
                  row,
                  <li key="volume" className="flex min-h-[44px] items-center justify-between gap-6 px-4 py-2.5">
                    <label htmlFor="set-volume" className="t-body">
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
                      <span className="secondary w-9 text-right tabular-nums">{Math.round(settings.volume * 100)}</span>
                    </div>
                  </li>,
                ]
              : [row],
          )}
          <li className="flex min-h-[44px] items-center justify-between gap-6 px-4 py-2.5">
            <div>
              <p className="t-body" id="fps-label">
                3D frame rate
              </p>
              <p className="t-subhead secondary mt-0.5">Lower frame rates leave more CPU for hashing.</p>
            </div>
            <div className="mac-segmented" role="radiogroup" aria-labelledby="fps-label">
              {([30, 60] as const).map((fps) => (
                <button
                  key={fps}
                  type="button"
                  role="radio"
                  aria-checked={settings.fpsCap === fps}
                  onClick={() => minerActions.updateSettings({ fpsCap: fps })}
                >
                  {fps} fps
                </button>
              ))}
            </div>
          </li>
          <li className="flex min-h-[44px] items-center justify-between gap-6 px-4 py-2.5">
            <div>
              <p className="t-body">Block-found celebration</p>
              <p className="t-subhead secondary mt-0.5">Finding a block is rare. See what happens when you do.</p>
            </div>
            <button type="button" onClick={() => celebrate(height + 1, 50, true)} className="mac-button shrink-0">
              Preview
            </button>
          </li>
        </ul>
      </Panel>

      <Panel title="Saturn Core connection">
        <label htmlFor="rpc-url" className="t-subhead secondary mb-1 block">
          RPC endpoint
        </label>
        <Input id="rpc-url" value={settings.rpcUrl} onChange={(e) => minerActions.updateSettings({ rpcUrl: e.target.value })} className="font-mono text-[12px]" spellCheck={false} />
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="rpc-user" className="t-subhead secondary mb-1 block">RPC user (optional)</label>
            <Input id="rpc-user" value={settings.rpcUser} onChange={(e) => minerActions.updateSettings({ rpcUser: e.target.value })} className="font-mono text-[12px]" spellCheck={false} autoComplete="off" />
          </div>
          <div>
            <label htmlFor="rpc-pass" className="t-subhead secondary mb-1 block">RPC password</label>
            <Input id="rpc-pass" type="password" value={settings.rpcPassword} onChange={(e) => minerActions.updateSettings({ rpcPassword: e.target.value })} className="font-mono text-[12px]" autoComplete="off" />
          </div>
        </div>
        <p className="t-subhead secondary mt-3 leading-relaxed">Leave user and password empty when Saturn Core runs on this computer: the app reads the node&apos;s cookie file. Fill them in to reach a node elsewhere (set rpcuser/rpcpassword in its saturn.conf).</p>
        <dl className="mt-5 grid grid-cols-2 gap-3">
          <div className="well p-3">
            <dt className="t-subhead secondary">Data source</dt>
            <dd className={cn('mt-1', source === 'tauri' ? 'text-primary' : 'text-warn')}>{source === 'tauri' ? 'Live backend' : 'Simulation'}</dd>
          </div>
          <div className="well p-3">
            <dt className="t-subhead secondary">Node</dt>
            <dd className={cn('mt-1 truncate', node.connected ? 'text-ok' : 'text-warn')}>{node.connected ? `Connected ${node.version}` : source === 'tauri' ? 'Not connected' : 'Simulated'}</dd>
          </div>
        </dl>
      </Panel>
    </div>
  )
}
