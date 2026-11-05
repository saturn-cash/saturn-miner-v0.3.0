'use client'

import { Cpu, Server, User } from 'lucide-react'
import { motion } from 'motion/react'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import { formatHashrate } from '@/lib/format'
import { minerActions, useMiner } from '@/lib/miner/store'
import { cn } from '@/lib/utils'
import { Bars, Gauge } from '../hud/charts'
import { IgnitionButton } from '../hud/ignition-button'
import { Label, Panel } from '../hud/panel'

export function MiningScreen() {
  return (
    <div className="grid gap-5 xl:grid-cols-3">
      <div className="flex flex-col gap-5 xl:col-span-2">
        <EnginePanel />
        <ThreadsPanel />
      </div>
      <div className="flex flex-col gap-5">
        <ControlPanel />
        <ConfigPanel />
      </div>
    </div>
  )
}

function EnginePanel() {
  const hashrate = useMiner((s) => s.hashrate)
  const temperature = useMiner((s) => s.temperature)
  const power = useMiner((s) => s.power)
  const intensity = useMiner((s) => s.config.intensity)
  const mining = useMiner((s) => s.status === 'mining')
  const efficiency = power > 0 ? hashrate / 1e6 / power : 0
  return (
    <Panel title="Engine" meta="Load, heat and power draw">
      <div className="grid grid-cols-2 place-items-center gap-6 py-2 md:grid-cols-4">
        <Gauge value={intensity * (mining ? 1 : 0)} max={100} label="Load" display={`${mining ? intensity : 0}`} unit="%" />
        <Gauge value={temperature} max={100} label="CPU temp" display={temperature.toFixed(0)} unit="°C" tone={temperature > 78 ? 'red' : 'cyan'} />
        <Gauge value={power} max={180} label="Power" display={power.toFixed(0)} unit="W" tone="cyan" />
        <Gauge value={efficiency} max={2} label="Efficiency" display={efficiency.toFixed(2)} unit="MH/W" />
      </div>
      <p className="secondary mt-4 text-center">
        Combined output <span className="text-primary">{formatHashrate(hashrate)}</span>
      </p>
    </Panel>
  )
}

function ThreadsPanel() {
  const rates = useMiner((s) => s.threadRates)
  const threads = useMiner((s) => s.config.threads)
  const active = rates.slice(0, threads)
  return (
    <Panel title="Worker threads" meta={`${threads} running`}>
      <Bars values={active.length ? active : Array(threads).fill(0)} max={16e6} className="h-40" />
      <div className="mt-3 grid gap-1" style={{ gridTemplateColumns: `repeat(${threads}, minmax(0, 1fr))` }}>
        {Array.from({ length: threads }, (_, i) => (
          <span key={i} className="t-caption tertiary text-center">
            T{i}
          </span>
        ))}
      </div>
    </Panel>
  )
}

function ControlPanel() {
  return (
    <Panel title="Reactor" bodyClassName="grid place-items-center py-6">
      <IgnitionButton />
    </Panel>
  )
}

function ConfigPanel() {
  const config = useMiner((s) => s.config)
  const maxThreads = useMiner((s) => s.maxThreads)
  const locked = useMiner((s) => s.status !== 'idle')

  return (
    <Panel title="Configuration">
      <fieldset disabled={locked} className="flex flex-col gap-4 disabled:opacity-60">
        <legend className="sr-only">Mining configuration</legend>
        <div>
          <Label className="mb-1.5">Mode</Label>
          <div className="mac-segmented grid w-full grid-cols-2" role="radiogroup" aria-label="Mining mode">
            {(['pool', 'solo'] as const).map((mode) => (
              <button key={mode} type="button" role="radio" aria-checked={config.mode === mode} onClick={() => minerActions.updateConfig({ mode })} className="capitalize">
                {mode}
              </button>
            ))}
          </div>
        </div>

        {config.mode === 'pool' && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="flex flex-col gap-5 overflow-hidden">
            <Field id="pool-url" label="Pool URL" icon={Server} value={config.poolUrl} onChange={(poolUrl) => minerActions.updateConfig({ poolUrl })} />
            <Field id="worker" label="Worker name" icon={User} value={config.worker} onChange={(worker) => minerActions.updateConfig({ worker })} />
          </motion.div>
        )}
        <Field
          id="payout"
          label="Payout address"
          value={config.payoutAddress}
          onChange={(payoutAddress) => minerActions.updateConfig({ payoutAddress: payoutAddress.trim() })}
          placeholder="sat1…"
          hint="Your Saturn Core receiving address. The pool pays every share you find to this address."
        />

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <Label>
              <Cpu className="mr-1 inline size-3" aria-hidden="true" />
              Threads
            </Label>
            <span className="t-subhead secondary tabular-nums">
              {config.threads} of {maxThreads}
            </span>
          </div>
          <Slider value={[config.threads]} min={1} max={maxThreads} step={1} onValueChange={(v) => minerActions.updateConfig({ threads: Array.isArray(v) ? v[0] : (v as number) })} aria-label="Thread count" />
        </div>
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <Label>Intensity</Label>
            <span className="t-subhead secondary tabular-nums">{config.intensity}%</span>
          </div>
          <Slider value={[config.intensity]} min={10} max={100} step={5} onValueChange={(v) => minerActions.updateConfig({ intensity: Array.isArray(v) ? v[0] : (v as number) })} aria-label="Mining intensity" />
        </div>
        {locked && <p className="t-subhead secondary">Stop mining to change these settings.</p>}
      </fieldset>
    </Panel>
  )
}

function Field({ id, label, value, onChange, icon: Icon, placeholder, hint }: { id: string; label: string; value: string; onChange: (v: string) => void; icon?: typeof Server; placeholder?: string; hint?: string }) {
  return (
    <div>
      <label htmlFor={id} className="t-subhead secondary mb-1 block">
        {Icon && <Icon className="mr-1 inline size-3" aria-hidden="true" />}
        {label}
      </label>
      <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="font-mono text-[12px]" spellCheck={false} />
      {hint && <p className="t-subhead tertiary mt-1 leading-snug">{hint}</p>}
    </div>
  )
}
