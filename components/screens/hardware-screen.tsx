'use client'

import { Lightbulb, Loader2, Plus, Radar, RotateCw, SlidersHorizontal, Trash2, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { formatHashrate } from '@/lib/format'
import { currentPool, DEMO_HOST, normalizeHost, parseStratum, tuningOptions, bitaxe } from '@/lib/hardware/client'
import { fleet, fleetTotals, useFleet } from '@/lib/hardware/store'
import type { Device } from '@/lib/hardware/types'
import { isTauri } from '@/lib/miner/bridge'
import { useMiner } from '@/lib/miner/store'
import { cn } from '@/lib/utils'
import { Sparkline } from '../hud/charts'
import { Label, Panel, StatusDot } from '../hud/panel'
import { Ticker } from '../hud/ticker'

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

function compact(n: number | string | undefined) {
  if (n === undefined || n === null) return '–'
  if (typeof n === 'string') return n
  const units = ['', 'K', 'M', 'G', 'T', 'P', 'E']
  let i = 0
  let v = n
  while (v >= 1000 && i < units.length - 1) {
    v /= 1000
    i++
  }
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)}${units[i]}`
}

function uptime(s: number | undefined) {
  if (!s) return '–'
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`
}

function tempTone(t: number | undefined) {
  if (t === undefined) return ''
  if (t >= 70) return 'text-destructive'
  if (t >= 62) return 'text-warn'
  return 'text-ok'
}

/** The pool settings that point a Bitaxe at the same pool Saturn Miner uses. */
function useSaturnPool(device?: Device) {
  const config = useMiner((s) => s.config)
  return useMemo(() => {
    if (config.mode !== 'pool') return null
    const { host, port } = parseStratum(config.poolUrl)
    if (!host || !port) return null
    const worker = (device?.info?.hostname ?? 'bitaxe').replace(/[^a-zA-Z0-9-]/g, '')
    return { url: host, port, user: `${config.payoutAddress}.${worker}`, password: 'x' }
  }, [config, device?.info?.hostname])
}

/* ------------------------------------------------------------------ */

export function HardwareScreen() {
  const devices = useFleet((d) => d)
  const totals = fleetTotals(devices)
  const [adding, setAdding] = useState(false)

  return (
    <div className="flex flex-col gap-5">
      <FleetHero totals={totals} onAdd={() => setAdding(true)} hasDevices={devices.length > 0} />

      <AnimatePresence initial={false}>{adding && <AddDevice key="add" onClose={() => setAdding(false)} />}</AnimatePresence>

      {devices.length === 0 && !adding ? (
        <EmptyFleet onAdd={() => setAdding(true)} />
      ) : (
        <div className="grid gap-5 xl:grid-cols-2">
          {devices.map((d) => (
            <DeviceCard key={d.id} device={d} />
          ))}
        </div>
      )}
    </div>
  )
}

function FleetHero({ totals, onAdd, hasDevices }: { totals: ReturnType<typeof fleetTotals>; onAdd: () => void; hasDevices: boolean }) {
  const [scanning, setScanning] = useState(false)
  const [scanMsg, setScanMsg] = useState<string | null>(null)
  const desktop = isTauri()
  const value = totals.hashrate
  const unit = formatHashrate(Math.max(value, 1e9)).split(' ')[1]
  const divisor = { 'H/s': 1, 'kH/s': 1e3, 'MH/s': 1e6, 'GH/s': 1e9, 'TH/s': 1e12, 'PH/s': 1e15, 'EH/s': 1e18 }[unit] ?? 1e9

  const scan = async () => {
    setScanning(true)
    setScanMsg(null)
    try {
      const found = await bitaxe.scan()
      found.forEach((h) => fleet.add(h))
      setScanMsg(found.length ? `Found ${found.length} Bitaxe${found.length > 1 ? 's' : ''}` : 'No Bitaxes answered on this network')
    } catch (e) {
      setScanMsg(e instanceof Error ? e.message : String(e))
    } finally {
      setScanning(false)
    }
  }

  return (
    <section className="flex min-h-[min(40vh,380px)] flex-col justify-end pb-2" aria-label="Bitaxe fleet">
      <Label className="text-foreground/75">Bitaxe fleet hashrate</Label>
      <p className="mt-1 flex flex-wrap items-baseline gap-4">
        <Ticker value={value / divisor} format={(n) => n.toFixed(2)} className="display gold-text text-[length:calc(clamp(56px,8vw,128px)*var(--ds))] [text-shadow:0_2px_30px_rgb(0_0_0/0.35)]" />
        <span className="text-[clamp(22px,2.2vw,32px)] font-semibold tracking-[-0.02em] text-white/70">{unit}</span>
      </p>
      <p className="mt-2 text-[14px] text-foreground/75">
        {hasDevices ? (
          <>
            {totals.online} of {totals.total} online, drawing {totals.watts.toFixed(1)} W
            {totals.jPerTh > 0 && <> at {totals.jPerTh.toFixed(1)} J/TH</>}
          </>
        ) : (
          'No Bitaxes docked yet.'
        )}
      </p>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button type="button" onClick={onAdd} className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-[14px] font-semibold text-primary-foreground shadow-[0_0_30px_-6px_var(--primary)] transition hover:brightness-110">
          <Plus className="size-4" aria-hidden="true" />
          Add a Bitaxe
        </button>
        <button
          type="button"
          onClick={scan}
          disabled={!desktop || scanning}
          title={desktop ? 'Look for Bitaxes on your local network' : 'Network scan needs the desktop app'}
          className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[14px] font-medium text-primary shadow-[inset_0_0_0_1px_rgb(242_182_109/0.45)] transition hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {scanning ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Radar className="size-4" aria-hidden="true" />}
          {scanning ? 'Scanning…' : 'Scan network'}
        </button>
        {scanMsg && <span className="text-[13px] text-muted-foreground">{scanMsg}</span>}
      </div>
    </section>
  )
}

function AddDevice({ onClose }: { onClose: () => void }) {
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const host = normalizeHost(value)
    if (!host) {
      setError('Enter an IP address like 192.168.1.42 or a hostname like bitaxe.local')
      return
    }
    fleet.add(host)
    onClose()
  }
  return (
    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
      <Panel title="Add a Bitaxe" action={<IconButton label="Close" onClick={onClose} icon={X} />}>
        <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <div className="flex-1">
            <label htmlFor="bitaxe-host" className="mb-2 block text-[12.5px] text-muted-foreground">
              IP address or hostname (shown on the Bitaxe's screen)
            </label>
            <Input id="bitaxe-host" autoFocus value={value} onChange={(e) => setValue(e.target.value)} placeholder="192.168.1.42" className="h-11 rounded-xl font-mono text-[13px]" spellCheck={false} aria-invalid={!!error} />
            {error && <p className="mt-2 text-[12.5px] text-destructive">{error}</p>}
          </div>
          <button type="submit" className="h-11 rounded-full bg-primary px-6 text-[14px] font-semibold text-primary-foreground sm:mt-[26px]">
            Add Bitaxe
          </button>
        </form>
        <p className="mt-4 text-[12.5px] text-muted-foreground">
          No Bitaxe handy?{' '}
          <button
            type="button"
            className="text-primary underline-offset-4 hover:underline"
            onClick={() => {
              fleet.add(DEMO_HOST)
              onClose()
            }}
          >
            Add a demo device
          </button>{' '}
          to try the controls.
        </p>
      </Panel>
    </motion.div>
  )
}

function EmptyFleet({ onAdd }: { onAdd: () => void }) {
  return (
    <Panel title="Dock your hardware">
      <div className="grid gap-6 md:grid-cols-3">
        {[
          ['Power it up', 'Plug in your Bitaxe and join it to your Wi-Fi from its setup hotspot, the same way you would for AxeOS.'],
          ['Add it here', 'Type the IP address from the Bitaxe screen, or scan your network from the desktop app.'],
          ['Point it at Saturn', 'One click sends it to the pool Saturn Miner uses, with your payout address and its own worker name.'],
        ].map(([t, b], i) => (
          <div key={t} className="well p-4">
            <p className="font-display text-[length:calc(22px*var(--ds))] font-bold text-primary">{i + 1}</p>
            <p className="mt-1 text-[14px] font-semibold">{t}</p>
            <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{b}</p>
          </div>
        ))}
      </div>
      <button type="button" onClick={onAdd} className="mt-5 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-[14px] font-semibold text-primary-foreground">
        <Plus className="size-4" aria-hidden="true" />
        Add a Bitaxe
      </button>
    </Panel>
  )
}

function IconButton({ label, onClick, icon: Icon, busy, tone }: { label: string; onClick: () => void; icon: typeof X; busy?: boolean; tone?: 'danger' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      disabled={busy}
      className={cn('grid size-9 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-[rgb(234_240_255/0.08)] hover:text-foreground disabled:opacity-50', tone === 'danger' && 'hover:text-destructive')}
    >
      {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Icon className="size-4" aria-hidden="true" />}
    </button>
  )
}

/* ------------------------------------------------------------------ */
/* Device card                                                         */
/* ------------------------------------------------------------------ */

function DeviceCard({ device }: { device: Device }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const info = device.info
  const saturnPool = useSaturnPool(device)
  const pool = currentPool(info)
  const onSaturn = !!(saturnPool && pool && pool.url === saturnPool.url && pool.port === saturnPool.port)
  const model = info?.deviceModel ?? device.asic?.deviceModel ?? tuningOptions(device.asic, info?.ASICModel).device
  const name = info?.hostname ?? device.host

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key)
    try {
      await fn()
    } catch {
      /* the card shows offline state on the next poll */
    } finally {
      setBusy(null)
    }
  }

  const gh = Number(info?.hashRate ?? 0)
  const eff = gh > 0 && info?.power ? info.power / (gh / 1000) : 0

  return (
    <Panel
      title={name}
      meta={[device.demo ? 'Demo' : null, model && info?.ASICModel ? `${model}, ${info.ASICModel}` : null, device.host !== name ? device.host : null].filter(Boolean).join(' · ') || undefined}
      action={
        <div className="flex items-center gap-0.5">
          <IconButton label="Blink its screen to find it" onClick={() => run('identify', () => fleet.identify(device.id))} icon={Lightbulb} busy={busy === 'identify'} />
          <IconButton label="Restart" onClick={() => run('restart', () => fleet.restart(device.id))} icon={RotateCw} busy={busy === 'restart'} />
          <IconButton label={open ? 'Close settings' : 'Configure'} onClick={() => setOpen((o) => !o)} icon={open ? X : SlidersHorizontal} />
          <IconButton label="Remove from Saturn" onClick={() => fleet.remove(device.id)} icon={Trash2} tone="danger" />
        </div>
      }
    >
      {device.status !== 'online' || !info ? (
        <OfflineState device={device} />
      ) : (
        <>
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
                <StatusDot tone="green" pulse />
                Hashing
                {onSaturn ? <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] text-primary">Mining for Saturn</span> : null}
              </p>
              <p className="mt-1 flex items-baseline gap-2">
                <span className="display text-[length:calc(46px*var(--ds))] tabular-nums">{formatHashrate(gh * 1e9).split(' ')[0]}</span>
                <span className="font-display text-[length:calc(16px*var(--ds))] text-primary">{formatHashrate(gh * 1e9).split(' ')[1]}</span>
              </p>
              {info.expectedHashrate ? <p className="text-[12px] text-muted-foreground">Expected {formatHashrate(info.expectedHashrate * 1e9)}</p> : null}
            </div>
            <Sparkline data={device.history.length > 1 ? device.history : [0, 0]} className="h-14 w-40 shrink-0" />
          </div>

          {device.pendingRestart && (
            <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl bg-warn/10 px-4 py-3 text-[13px] text-warn shadow-[inset_0_0_0_1px_rgb(255_203_107/0.3)]">
              New settings take effect after a restart.
              <button type="button" onClick={() => run('restart', () => fleet.restart(device.id))} className="shrink-0 rounded-full bg-warn px-3.5 py-1.5 text-[12.5px] font-semibold text-[#2a1a00]">
                Restart now
              </button>
            </div>
          )}

          <dl className="mt-5 grid grid-cols-3 gap-x-4 gap-y-4">
            <Stat label="ASIC temp" value={info.temp !== undefined ? `${info.temp.toFixed(0)}°C` : '–'} tone={tempTone(info.temp)} />
            <Stat label="Regulator" value={info.vrTemp !== undefined ? `${Number(info.vrTemp).toFixed(0)}°C` : '–'} tone={tempTone(Number(info.vrTemp) - 10)} />
            <Stat label="Power" value={info.power !== undefined ? `${info.power.toFixed(1)} W` : '–'} />
            <Stat label="Efficiency" value={eff ? `${eff.toFixed(1)} J/TH` : '–'} />
            <Stat label="Fan" value={info.fanspeed !== undefined ? `${Math.round(info.fanspeed)}%${info.autofanspeed ? ' auto' : ''}` : '–'} />
            <Stat label="Clock" value={info.frequency ? `${info.frequency} MHz · ${info.coreVoltage} mV` : '–'} />
            <Stat label="Shares" value={`${compact(info.sharesAccepted)} / ${compact(info.sharesRejected)} rej`} />
            <Stat label="Best difficulty" value={compact(info.bestDiff)} />
            <Stat label="Uptime" value={uptime(info.uptimeSeconds)} />
          </dl>
          <p className="mt-4 truncate font-mono text-[11.5px] text-muted-foreground" title={pool ? `${pool.url}:${pool.port} as ${pool.user}` : undefined}>
            {pool?.url ? `${pool.url}:${pool.port} · ${pool.user}` : 'No pool set'}
          </p>
        </>
      )}

      <AnimatePresence initial={false}>
        {open && info && (
          <motion.div key="cfg" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <DeviceSettings device={device} onDone={() => setOpen(false)} />
          </motion.div>
        )}
      </AnimatePresence>
    </Panel>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11.5px] text-muted-foreground">{label}</dt>
      <dd className={cn('mt-0.5 truncate font-display text-[length:calc(15px*var(--ds))] font-semibold tabular-nums', tone)}>{value}</dd>
    </div>
  )
}

function OfflineState({ device }: { device: Device }) {
  const browserNote = !isTauri() && !device.demo
  return (
    <div className="flex flex-col items-start gap-3 py-2">
      <p className="flex items-center gap-2 text-[14px]">
        {device.status === 'connecting' ? <Loader2 className="size-4 animate-spin text-primary" aria-hidden="true" /> : <StatusDot tone="red" />}
        {device.status === 'connecting' ? `Connecting to ${device.host}…` : `Can't reach ${device.host}`}
      </p>
      {device.status === 'offline' && (
        <p className="max-w-[60ch] text-[13px] leading-relaxed text-muted-foreground">
          {browserNote
            ? 'The browser preview can’t talk to devices on your network. Open Saturn Miner as the desktop app to control real Bitaxes, or add the demo device to try the controls.'
            : `Check that it's powered on and on the same network, then retry. ${device.error ? `(${device.error})` : ''}`}
        </p>
      )}
      {device.status === 'offline' && (
        <button type="button" onClick={() => fleet.refresh(device.id)} className="rounded-full px-4 py-1.5 text-[13px] font-medium text-primary shadow-[inset_0_0_0_1px_rgb(242_182_109/0.45)] hover:bg-primary/10">
          Retry
        </button>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

const TABS = ['Pool', 'Performance', 'Cooling', 'Device'] as const
type Tab = (typeof TABS)[number]

function DeviceSettings({ device, onDone }: { device: Device; onDone: () => void }) {
  const [tab, setTab] = useState<Tab>('Pool')
  return (
    <div className="mt-5 border-t border-[rgb(234_240_255/0.08)] pt-5">
      <div className="flex gap-1 rounded-full bg-[rgb(234_240_255/0.04)] p-1 shadow-[inset_0_0_0_1px_rgb(234_240_255/0.08)]" role="tablist">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={cn('relative flex-1 rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors', tab === t ? 'text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
          >
            {tab === t && <motion.span layoutId={`tab-${device.id}`} className="absolute inset-0 rounded-full bg-primary" transition={{ type: 'spring', stiffness: 400, damping: 32 }} />}
            <span className="relative">{t}</span>
          </button>
        ))}
      </div>
      <div className="mt-5">
        {tab === 'Pool' && <PoolTab device={device} onDone={onDone} />}
        {tab === 'Performance' && <PerformanceTab device={device} onDone={onDone} />}
        {tab === 'Cooling' && <CoolingTab device={device} onDone={onDone} />}
        {tab === 'Device' && <DeviceTab device={device} onDone={onDone} />}
      </div>
    </div>
  )
}

function useSave(onDone: () => void) {
  const [state, setState] = useState<'idle' | 'saving' | 'error'>('idle')
  const [error, setError] = useState('')
  const save = async (fn: () => Promise<unknown>) => {
    setState('saving')
    try {
      await fn()
      setState('idle')
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setState('error')
    }
  }
  return { save, saving: state === 'saving', error: state === 'error' ? error : null }
}

function SaveRow({ label, onClick, saving, error, note }: { label: string; onClick: () => void; saving: boolean; error: string | null; note?: string }) {
  return (
    <div className="mt-5 flex flex-wrap items-center gap-3">
      <button type="button" onClick={onClick} disabled={saving} className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-[13.5px] font-semibold text-primary-foreground disabled:opacity-60">
        {saving && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
        {label}
      </button>
      {note && !error && <span className="text-[12.5px] text-muted-foreground">{note}</span>}
      {error && <span className="text-[12.5px] text-destructive">Couldn't save: {error}</span>}
    </div>
  )
}

function Field({ id, label, value, onChange, type = 'text', mono = true }: { id: string; label: string; value: string; onChange: (v: string) => void; type?: string; mono?: boolean }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[12.5px] text-muted-foreground">
        {label}
      </label>
      <Input id={id} type={type} value={value} onChange={(e) => onChange(e.target.value)} className={cn('h-10 rounded-xl text-[13px]', mono && 'font-mono')} spellCheck={false} />
    </div>
  )
}

function PoolTab({ device, onDone }: { device: Device; onDone: () => void }) {
  const saturn = useSaturnPool(device)
  const mode = useMiner((s) => s.config.mode)
  const cur = currentPool(device.info)
  const [url, setUrl] = useState(cur?.url ?? '')
  const [port, setPort] = useState(String(cur?.port || ''))
  const [user, setUser] = useState(cur?.user ?? '')
  const [password, setPassword] = useState('x')
  const { save, saving, error } = useSave(onDone)

  return (
    <div>
      <div className="well flex flex-wrap items-center justify-between gap-4 p-4">
        <div className="min-w-0">
          <p className="text-[14px] font-semibold">Mine for Saturn</p>
          <p className="mt-0.5 truncate text-[12.5px] text-muted-foreground">
            {saturn ? `${saturn.url}:${saturn.port} as ${saturn.user.slice(0, 14)}…${saturn.user.split('.').pop()}` : mode === 'solo' ? 'Saturn Miner is in solo mode. Switch to pool mode on the Mining screen, or enter a pool below.' : 'Set a pool on the Mining screen first.'}
          </p>
        </div>
        <button
          type="button"
          disabled={!saturn || saving}
          onClick={() => saturn && save(() => fleet.setPool(device.id, saturn))}
          className="shrink-0 rounded-full bg-primary px-4 py-2 text-[13px] font-semibold text-primary-foreground shadow-[0_0_24px_-6px_var(--primary)] disabled:opacity-50"
        >
          Point at Saturn
        </button>
      </div>

      <p className="mb-3 mt-5 text-[12.5px] text-muted-foreground">Or set any pool by hand</p>
      <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
        <Field id={`${device.id}-url`} label="Pool host (no stratum+tcp://)" value={url} onChange={(v) => setUrl(parseStratum(v).host)} />
        <Field id={`${device.id}-port`} label="Port" value={port} onChange={(v) => setPort(v.replace(/\D/g, ''))} />
        <Field id={`${device.id}-user`} label="Worker (address.name)" value={user} onChange={setUser} />
        <Field id={`${device.id}-pass`} label="Password" value={password} onChange={setPassword} />
      </div>
      <SaveRow
        label="Save pool"
        saving={saving}
        error={error}
        note="Takes effect after a restart."
        onClick={() => save(() => fleet.setPool(device.id, { url, port: Number(port), user, password }))}
      />
    </div>
  )
}

const PRESET_COPY = {
  eco: { title: 'Eco', body: 'Lower clock and voltage. Cooler, quieter, best J/TH.' },
  stock: { title: 'Stock', body: 'Factory clock for this chip.' },
  turbo: { title: 'Turbo', body: 'Overclock. More hashrate and heat; watch the ASIC temp.' },
} as const

function PerformanceTab({ device, onDone }: { device: Device; onDone: () => void }) {
  const info = device.info
  const opts = tuningOptions(device.asic, info?.ASICModel)
  const [freq, setFreq] = useState(info?.frequency ?? opts.presets.stock.frequency)
  const [volt, setVolt] = useState(info?.coreVoltage ?? opts.presets.stock.coreVoltage)
  const { save, saving, error } = useSave(onDone)
  const active = (Object.keys(opts.presets) as Array<keyof typeof opts.presets>).find((k) => opts.presets[k].frequency === freq && opts.presets[k].coreVoltage === volt)

  return (
    <div>
      <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Performance preset">
        {(Object.keys(opts.presets) as Array<keyof typeof opts.presets>).map((k) => {
          const p = opts.presets[k]
          const on = active === k
          return (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => {
                setFreq(p.frequency)
                setVolt(p.coreVoltage)
              }}
              className={cn('rounded-2xl p-3.5 text-left transition-colors', on ? 'bg-primary/15 shadow-[inset_0_0_0_1.5px_var(--primary)]' : 'bg-[rgb(234_240_255/0.04)] shadow-[inset_0_0_0_1px_rgb(234_240_255/0.08)] hover:bg-[rgb(234_240_255/0.08)]')}
            >
              <span className="flex items-baseline justify-between">
                <span className={cn('text-[14px] font-semibold', k === 'turbo' && 'text-warn')}>{PRESET_COPY[k].title}</span>
                <span className="font-mono text-[11px] text-muted-foreground">
                  {p.frequency} MHz
                </span>
              </span>
              <span className="mt-1 block text-[12px] leading-snug text-muted-foreground">{PRESET_COPY[k].body}</span>
            </button>
          )
        })}
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <OptionSelect id={`${device.id}-freq`} label="Frequency" unit="MHz" value={freq} options={opts.freqs} onChange={setFreq} />
        <OptionSelect id={`${device.id}-volt`} label="Core voltage" unit="mV" value={volt} options={opts.volts} onChange={setVolt} />
      </div>
      {active === 'turbo' || freq > opts.presets.stock.frequency ? (
        <p className="mt-3 text-[12.5px] text-warn">Above stock clocks. Make sure the heatsink and fan are good, and back off if the ASIC goes over 65°C.</p>
      ) : null}
      <SaveRow label="Apply clocks" saving={saving} error={error} note="Restart to apply." onClick={() => save(() => fleet.save(device.id, { frequency: freq, coreVoltage: volt }, true))} />
    </div>
  )
}

function OptionSelect({ id, label, unit, value, options, onChange }: { id: string; label: string; unit: string; value: number; options: number[]; onChange: (v: number) => void }) {
  const list = options.includes(value) ? options : [...options, value].sort((a, b) => a - b)
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[12.5px] text-muted-foreground">
        {label}
      </label>
      <select id={id} value={value} onChange={(e) => onChange(Number(e.target.value))} className="h-10 w-full rounded-xl border border-input bg-[rgb(234_240_255/0.04)] px-3 font-mono text-[13px] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
        {list.map((o) => (
          <option key={o} value={o} className="bg-[#140b24]">
            {o} {unit}
          </option>
        ))}
      </select>
    </div>
  )
}

function CoolingTab({ device, onDone }: { device: Device; onDone: () => void }) {
  const info = device.info
  const [auto, setAuto] = useState(!!info?.autofanspeed)
  const [target, setTarget] = useState(info?.temptarget ?? 60)
  const [fan, setFan] = useState(Math.round(info?.fanspeed ?? 60))
  const { save, saving, error } = useSave(onDone)
  return (
    <div>
      <div className="flex items-center justify-between gap-6">
        <div>
          <label htmlFor={`${device.id}-auto`} className="text-[14px]">
            Automatic fan
          </label>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">Speeds the fan up and down to hold a target chip temperature.</p>
        </div>
        <Switch id={`${device.id}-auto`} checked={auto} onCheckedChange={setAuto} />
      </div>
      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between">
          <Label>{auto ? 'Target ASIC temperature' : 'Fan speed'}</Label>
          <span className="font-display text-[length:calc(14px*var(--ds))] text-primary">{auto ? `${target}°C` : `${fan}%`}</span>
        </div>
        {auto ? (
          <Slider value={[target]} min={45} max={70} step={1} onValueChange={(v) => setTarget(Array.isArray(v) ? v[0] : (v as number))} aria-label="Target temperature" />
        ) : (
          <Slider value={[fan]} min={20} max={100} step={5} onValueChange={(v) => setFan(Array.isArray(v) ? v[0] : (v as number))} aria-label="Fan speed" />
        )}
      </div>
      <SaveRow
        label="Apply cooling"
        saving={saving}
        error={error}
        note="Applies immediately."
        onClick={() => save(() => fleet.save(device.id, auto ? { autofanspeed: 1, temptarget: target } : { autofanspeed: 0, fanspeed: fan, manualFanSpeed: fan }, false))}
      />
    </div>
  )
}

function DeviceTab({ device, onDone }: { device: Device; onDone: () => void }) {
  const [hostname, setHostname] = useState(device.info?.hostname ?? '')
  const { save, saving, error } = useSave(onDone)
  useEffect(() => setHostname(device.info?.hostname ?? ''), [device.info?.hostname])
  const info = device.info
  return (
    <div>
      <Field id={`${device.id}-hostname`} label="Name on your network" value={hostname} onChange={(v) => setHostname(v.replace(/[^a-zA-Z0-9-]/g, ''))} />
      <dl className="mt-4 grid grid-cols-2 gap-3 text-[13px]">
        {[
          ['Firmware', info?.version ?? '–'],
          ['Board', info?.boardVersion ?? '–'],
          ['Chip', `${info?.ASICModel ?? '–'}${device.asic?.asicCount && device.asic.asicCount > 1 ? ` ×${device.asic.asicCount}` : ''}`],
          ['Wi-Fi signal', info?.wifiRSSI ? `${info.wifiRSSI} dBm` : '–'],
        ].map(([k, v]) => (
          <div key={k} className="well p-3">
            <dt className="text-[11.5px] text-muted-foreground">{k}</dt>
            <dd className="mt-0.5 font-mono text-[12.5px]">{v}</dd>
          </div>
        ))}
      </dl>
      <SaveRow label="Rename" saving={saving} error={error} note="Restart to apply." onClick={() => save(() => fleet.save(device.id, { hostname }, true))} />
    </div>
  )
}

