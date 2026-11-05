'use client'

import { Input } from '@/components/ui/input'
import { celebrate } from '@/lib/cosmos/store'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { minerActions, useMiner } from '@/lib/miner/store'
import type { Settings } from '@/lib/miner/types'
import { cn } from '@/lib/utils'
import { Panel } from '../hud/panel'
import { LocalNodePanel } from '../node/local-node-panel'

type BoolKey = { [K in keyof Settings]: Settings[K] extends boolean ? K : never }[keyof Settings]

const TOGGLES: Array<{ key: BoolKey; label: string; description: string }> = [
  { key: 'animations', label: 'Cinematic flight', description: 'Warp between destinations, comets for shares and the block-found supernova. Turn off to free up GPU time.' },
  { key: 'realSaturn', label: 'Real Saturn', description: 'Real photos of Saturn taken by NASA’s Cassini spacecraft behind every screen, with the stars and effects on top. Off shows the 3D model instead.' },
  { key: 'sound', label: 'Sound', description: 'A space drone that rises with your hashrate, warp whooshes between destinations, a ping for shares and a bell for blocks. Also the speaker button at the top left.' },
  { key: 'shareSound', label: 'Share ping', description: 'A short ping every time the pool accepts one of your shares.' },
  { key: 'ecoOnBattery', label: 'Eco mode on battery', description: 'Halve intensity automatically when unplugged.' },
  { key: 'minimizeToTray', label: 'Keep mining when closed', description: 'Closing the window leaves the miner running in the menu bar or tray.' },
  { key: 'launchOnStartup', label: 'Open at login', description: 'Start Saturn when you log in.' },
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
              <label htmlFor="set-celebration" className="t-body">
                Block-found celebration
              </label>
              <p className="t-subhead secondary mt-0.5">
                A supernova across the whole window when you find a block. Muting sound keeps the show and drops the bell; turning this off keeps the bell and drops the show.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <button type="button" onClick={() => celebrate(height + 1, 50, true)} className="mac-button">
                Preview
              </button>
              <Switch id="set-celebration" checked={settings.celebration} onCheckedChange={(v) => minerActions.updateSettings({ celebration: v })} />
            </div>
          </li>
        </ul>
      </Panel>

      <div className="flex flex-col gap-5">
      <LocalNodePanel compact />
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
        <p className="t-subhead secondary mt-3 leading-relaxed">Saturn Core answers on http://127.0.0.1:9998. Leave user and password empty when it runs on this computer: the app reads the node&apos;s cookie file. Fill them in to reach a node elsewhere (set rpcuser/rpcpassword in its saturn.conf).</p>
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
    </div>
  )
}
