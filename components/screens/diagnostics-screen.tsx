'use client'

import { AlertTriangle, CheckCircle2, Loader2, Play, XCircle } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { minerActions, useMiner } from '@/lib/miner/store'
import type { MinerState } from '@/lib/miner/types'
import { cn } from '@/lib/utils'
import { Label, Panel } from '../hud/panel'

type Result = 'pass' | 'warn' | 'fail'

interface Check {
  id: string
  name: string
  evaluate: (s: MinerState) => { result: Result; detail: string }
}

const CHECKS: Check[] = [
  {
    id: 'backend',
    name: 'Tauri backend',
    evaluate: (s) => (s.source === 'tauri' ? { result: 'pass', detail: 'Rust command bridge responding' } : { result: 'warn', detail: 'Not detected — running in browser with simulated data' }),
  },
  {
    id: 'rpc',
    name: 'Saturn Core RPC',
    evaluate: (s) => (s.node.connected ? { result: 'pass', detail: `${s.settings.rpcUrl} reachable` } : { result: 'warn', detail: s.node.error ?? 'No node connected (pool mining still works)' }),
  },
  {
    id: 'sync',
    name: 'Chain synchronisation',
    evaluate: (s) => (s.network.synced ? { result: 'pass', detail: `Height ${s.network.height.toLocaleString()}` } : { result: 'warn', detail: 'Node still syncing — solo mining paused' }),
  },
  {
    id: 'wallet',
    name: 'Wallet loaded',
    evaluate: (s) => (s.node.connected ? (s.node.hasWallet ? { result: 'pass', detail: 'Node wallet available' } : { result: 'warn', detail: 'Node has no wallet loaded' }) : { result: 'warn', detail: 'Needs a connected node' }),
  },
  {
    id: 'payout',
    name: 'Payout address',
    evaluate: (s) => (s.config.payoutAddress.startsWith('sat1') ? { result: 'pass', detail: 'Bech32 address valid' } : { result: 'fail', detail: 'Address must start with sat1' }),
  },
  {
    id: 'pool',
    name: 'Pool connectivity',
    evaluate: (s) =>
      s.config.mode === 'solo'
        ? { result: 'pass', detail: 'Solo mode — pool not required' }
        : s.pool.connected
          ? { result: 'pass', detail: `${s.pool.latency}ms to ${s.config.poolUrl.replace('stratum+tcp://', '')}` }
          : { result: 'warn', detail: 'Pool connects when mining starts' },
  },
  {
    id: 'thermal',
    name: 'Thermal headroom',
    evaluate: (s) => (s.temperature < 80 ? { result: 'pass', detail: `${s.temperature.toFixed(0)}°C — within limits` } : { result: 'warn', detail: `${s.temperature.toFixed(0)}°C — consider lowering intensity` }),
  },
  { id: 'peers', name: 'Peer connections', evaluate: (s) => (s.network.peers.length >= 4 ? { result: 'pass', detail: `${s.network.peers.length} peers` } : { result: 'warn', detail: 'Low peer count' }) },
]

const ICON = { pass: CheckCircle2, warn: AlertTriangle, fail: XCircle }
const WORD = { pass: 'Pass', warn: 'Warning', fail: 'Fail' }
const TONE = { pass: 'text-ok', warn: 'text-warn', fail: 'text-destructive' }

export function DiagnosticsScreen() {
  const [index, setIndex] = useState(-1)
  const [results, setResults] = useState<Record<string, { result: Result; detail: string }>>({})
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const running = index >= 0 && index < CHECKS.length

  useEffect(() => {
    if (!running) return
    timer.current = setTimeout(() => {
      const check = CHECKS[index]
      const outcome = check.evaluate(minerActions.getSnapshot())
      setResults((r) => ({ ...r, [check.id]: outcome }))
      setIndex((i) => i + 1)
      if (index === CHECKS.length - 1) minerActions.log('info', 'SYSTEM', 'Diagnostics sweep complete')
    }, 420)
    return () => clearTimeout(timer.current)
  }, [index, running])

  const run = () => {
    setResults({})
    setIndex(0)
  }

  const values = Object.values(results)
  const counts = { pass: values.filter((v) => v.result === 'pass').length, warn: values.filter((v) => v.result === 'warn').length, fail: values.filter((v) => v.result === 'fail').length }
  const progress = Math.max(0, Math.min(CHECKS.length, index)) / CHECKS.length

  return (
    <div className="grid gap-5 xl:grid-cols-3">
      <Panel title="System checks" meta="Eight probes across node, wallet and hardware" className="xl:col-span-2">
        <ul className="flex flex-col gap-2">
          {CHECKS.map((c, i) => {
            const r = results[c.id]
            const active = running && i === index
            const Icon = r ? ICON[r.result] : null
            return (
              <li key={c.id} className={cn('well relative flex items-center gap-4 overflow-hidden px-4 py-3 transition-colors', active && 'bg-primary/10 shadow-[inset_0_0_0_1px_rgb(242_182_109/0.5)]')}>
                {active && <motion.span aria-hidden="true" className="absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-primary/15 to-transparent" initial={{ x: '-100%' }} animate={{ x: '300%' }} transition={{ duration: 0.8, repeat: Infinity }} />}
                <span className="grid size-6 shrink-0 place-items-center">
                  <AnimatePresence mode="wait">
                    {active ? (
                      <motion.span key="spin" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        <Loader2 className="size-5 animate-spin text-primary" aria-hidden="true" />
                      </motion.span>
                    ) : Icon && r ? (
                      <motion.span key="done" initial={{ scale: 0, rotate: -90 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 15 }}>
                        <Icon className={cn('size-5', TONE[r.result])} aria-hidden="true" />
                      </motion.span>
                    ) : (
                      <span className="size-2 rounded-full bg-muted-foreground/40" />
                    )}
                  </AnimatePresence>
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm">{c.name}</p>
                  <p className="truncate font-mono text-[11px] text-muted-foreground">{r?.detail ?? (active ? 'Probing…' : 'Waiting')}</p>
                </div>
                {r && <span className={cn('text-[12px] font-medium', TONE[r.result])}>{WORD[r.result]}</span>}
              </li>
            )
          })}
        </ul>
      </Panel>

      <Panel title="Scan" bodyClassName="flex flex-col gap-6">
        <div className="relative mx-auto grid size-40 place-items-center">
          <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90" aria-hidden="true">
            <circle cx="50" cy="50" r="44" fill="none" stroke="var(--muted)" strokeWidth="4" />
            <motion.circle cx="50" cy="50" r="44" fill="none" stroke="var(--primary)" strokeWidth="4" strokeLinecap="round" pathLength={1} strokeDasharray="1 1" animate={{ strokeDashoffset: 1 - progress }} transition={{ duration: 0.4 }} style={{ filter: 'drop-shadow(0 0 6px var(--primary))' }} />
          </svg>
          <div className="text-center">
            <p className="display text-[length:calc(34px*var(--ds))] tabular-nums">{Math.round(progress * 100)}%</p>
            <Label>{running ? 'Scanning' : index >= CHECKS.length ? 'Done' : 'Ready to scan'}</Label>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          {(['pass', 'warn', 'fail'] as const).map((k) => (
            <div key={k} className="well py-2">
              <p className={cn('font-display text-[length:calc(22px*var(--ds))] font-semibold', TONE[k])}>{counts[k]}</p>
              <Label>{WORD[k]}</Label>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={run}
          disabled={running}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 shadow-[0_0_30px_-6px_var(--primary)] text-[13px] font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-60"
        >
          {running ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Play className="size-4" aria-hidden="true" />}
          {running ? 'Running' : 'Run diagnostics'}
        </button>
      </Panel>
    </div>
  )
}
