'use client'

import { useSyncExternalStore } from 'react'
import { minerActions } from '@/lib/miner/store'
import { bitaxe, buildPoolPatch, DEMO_HOST } from './client'
import type { Device, PoolSettings } from './types'

/** Bitaxe fleet: device list persisted locally, telemetry polled every few seconds. */

const STORAGE_KEY = 'saturn.bitaxes'
const POLL_MS = 3000
const HISTORY = 60

type Listener = () => void
let devices: Device[] = load()
const listeners = new Set<Listener>()
let timer: ReturnType<typeof setInterval> | null = null

function load(): Device[] {
  if (typeof window === 'undefined') return []
  try {
    const hosts: string[] = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]')
    return hosts.map((host) => ({ id: host, host, status: 'connecting', history: [], demo: host === DEMO_HOST }))
  } catch {
    return []
  }
}

function persist() {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(devices.map((d) => d.host)))
  } catch {
    /* storage unavailable */
  }
}

function emit() {
  for (const l of listeners) l()
}

function patchDevice(id: string, fn: (d: Device) => Device) {
  devices = devices.map((d) => (d.id === id ? fn(d) : d))
  emit()
}

async function poll(d: Device) {
  try {
    const info = await bitaxe.info(d.host)
    let asic = d.asic
    if (!asic) asic = await bitaxe.asic(d.host).catch(() => undefined)
    const wasOffline = d.status !== 'online'
    patchDevice(d.id, (x) => ({
      ...x,
      status: 'online',
      info,
      asic,
      error: undefined,
      lastSeen: Date.now(),
      history: [...x.history, Number(info.hashRate ?? 0)].slice(-HISTORY),
      pendingRestart: wasOffline && x.pendingRestart ? false : x.pendingRestart,
    }))
    if (wasOffline && d.status === 'offline') minerActions.log('success', 'SYSTEM', `Bitaxe ${info.hostname ?? d.host} is back online`)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (d.status === 'online') minerActions.log('warn', 'SYSTEM', `Lost contact with Bitaxe ${d.info?.hostname ?? d.host}`)
    patchDevice(d.id, (x) => ({ ...x, status: 'offline', error: message }))
  }
}

function pollAll() {
  for (const d of devices) void poll(d)
}

function subscribe(l: Listener) {
  listeners.add(l)
  if (!timer && typeof window !== 'undefined') {
    pollAll()
    timer = setInterval(pollAll, POLL_MS)
  }
  return () => {
    listeners.delete(l)
    if (listeners.size === 0 && timer) {
      clearInterval(timer)
      timer = null
    }
  }
}

export function useFleet<T>(selector: (d: Device[]) => T): T {
  return useSyncExternalStore(
    subscribe,
    () => selector(devices),
    () => selector([]),
  )
}

/** fleet totals; hashrate in H/s so it shares the app's formatter */
export function fleetTotals(list: Device[]) {
  const online = list.filter((d) => d.status === 'online' && d.info)
  const gh = online.reduce((a, d) => a + Number(d.info?.hashRate ?? 0), 0)
  const watts = online.reduce((a, d) => a + Number(d.info?.power ?? 0), 0)
  return {
    online: online.length,
    total: list.length,
    hashrate: gh * 1e9,
    watts,
    jPerTh: gh > 0 ? watts / (gh / 1000) : 0,
  }
}

export const fleet = {
  add(host: string) {
    if (devices.some((d) => d.host === host)) return
    const d: Device = { id: host, host, status: 'connecting', history: [], demo: host === DEMO_HOST }
    devices = [...devices, d]
    persist()
    emit()
    void poll(d)
    minerActions.log('info', 'SYSTEM', `Added Bitaxe at ${host}`)
  },
  remove(id: string) {
    devices = devices.filter((d) => d.id !== id)
    persist()
    emit()
  },
  refresh(id: string) {
    const d = devices.find((x) => x.id === id)
    if (d) void poll(d)
  },
  async save(id: string, patch: Record<string, unknown>, needsRestart: boolean) {
    const d = devices.find((x) => x.id === id)
    if (!d) return
    await bitaxe.patch(d.host, patch)
    patchDevice(id, (x) => ({ ...x, pendingRestart: x.pendingRestart || needsRestart }))
    void poll(d)
  },
  async setPool(id: string, pool: PoolSettings) {
    const d = devices.find((x) => x.id === id)
    if (!d) return
    await fleet.save(id, buildPoolPatch(d.info, pool), true)
    minerActions.log('info', 'POOL', `Pointed ${d.info?.hostname ?? d.host} at ${pool.url}:${pool.port}`)
  },
  async restart(id: string) {
    const d = devices.find((x) => x.id === id)
    if (!d) return
    await bitaxe.restart(d.host)
    patchDevice(id, (x) => ({ ...x, pendingRestart: false, status: 'connecting' }))
    minerActions.log('info', 'SYSTEM', `Restarting Bitaxe ${d.info?.hostname ?? d.host}`)
  },
  async identify(id: string) {
    const d = devices.find((x) => x.id === id)
    if (d) await bitaxe.identify(d.host)
  },
}
