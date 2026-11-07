'use client'

import { useSyncExternalStore } from 'react'
import { isTauri } from '@/lib/miner/bridge'
import { minerActions } from '@/lib/miner/store'
import { bitaxe, buildPoolPatch, DEMO_HOST } from './client'
import type { Device, PoolSettings } from './types'

/** Bitaxe fleet: device list persisted locally, telemetry polled every few seconds. */

const STORAGE_KEY = 'saturn.bitaxes'
const POLL_MS = 3000
const HISTORY = 60
const RESTART_GRACE_MS = 50_000 // a Bitaxe takes 20-40 s to come back after a restart
const SEARCH_EVERY_MS = 60_000 // when one goes missing, look for it on the network at most this often

type Listener = () => void
let devices: Device[] = load()
const listeners = new Set<Listener>()
let timer: ReturnType<typeof setInterval> | null = null

type Saved = string | { host: string; mac?: string; name?: string }

function load(): Device[] {
  if (typeof window === 'undefined') return []
  try {
    const saved: Saved[] = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]')
    return saved.map((x) => {
      const s = typeof x === 'string' ? { host: x } : x
      return { id: s.host, host: s.host, mac: s.mac, name: s.name, status: 'connecting', history: [], demo: s.host === DEMO_HOST }
    })
  } catch {
    return []
  }
}

function persist() {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(devices.map((d) => ({ host: d.host, mac: d.mac, name: d.name }))))
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
  if (d.searching) return
  try {
    const info = await bitaxe.info(d.host)
    const mac = typeof info.macAddr === 'string' ? info.macAddr.toLowerCase() : d.mac
    const name = info.hostname ?? d.name
    if (mac !== d.mac || name !== d.name) {
      patchDevice(d.id, (x) => ({ ...x, mac, name }))
      persist()
    }
    let asic = d.asic
    if (!asic) asic = await bitaxe.asic(d.host).catch(() => undefined)
    const wasOffline = d.status !== 'online'
    patchDevice(d.id, (x) => ({
      ...x,
      status: 'online',
      info,
      asic,
      error: undefined,
      missed: 0,
      graceUntil: undefined,
      lastSeen: Date.now(),
      history: [...x.history, Number(info.hashRate ?? 0)].slice(-HISTORY),
      pendingRestart: wasOffline && x.pendingRestart ? false : x.pendingRestart,
    }))
    if (wasOffline && d.status === 'offline') minerActions.log('success', 'SYSTEM', `Bitaxe ${info.hostname ?? d.host} is back online`)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const missed = (d.missed ?? 0) + 1
    // just restarted: it's on its way back, not lost
    if (d.graceUntil && Date.now() < d.graceUntil) {
      patchDevice(d.id, (x) => ({ ...x, status: 'connecting', missed }))
      return
    }
    if (d.status === 'online') minerActions.log('warn', 'SYSTEM', `Lost contact with Bitaxe ${d.info?.hostname ?? d.host}`)
    patchDevice(d.id, (x) => ({ ...x, status: 'offline', error: message, missed }))
    // gone twice in a row: it may have a new IP, so go and look for it
    if (missed >= 2 && !d.demo && isTauri() && (d.mac || d.name) && Date.now() - (d.lastSearch ?? 0) > SEARCH_EVERY_MS) void find(d.id)
  }
}

/** Search the network for a saved Bitaxe (by MAC address, else hostname) and follow it to its new IP. */
async function find(id: string) {
  const d = devices.find((x) => x.id === id)
  if (!d || d.searching) return
  patchDevice(id, (x) => ({ ...x, searching: true, lastSearch: Date.now() }))
  try {
    const names = d.name ? [d.name, `${d.name}.local`] : []
    const r = await bitaxe.scan(names)
    const i = r.found.findIndex((host, k) => (d.mac && r.macs?.[k] ? r.macs[k] === d.mac : !!d.name && r.names[k] === d.name))
    const host = i >= 0 ? r.found[i] : null
    if (host && host !== d.host && !devices.some((x) => x.host === host && x.id !== id)) {
      minerActions.log('success', 'SYSTEM', `Found Bitaxe ${d.name ?? d.host} at its new address ${host}`)
      patchDevice(id, (x) => ({ ...x, host, searching: false, status: 'connecting', missed: 0, error: undefined }))
      persist()
    } else {
      patchDevice(id, (x) => ({ ...x, searching: false }))
    }
  } catch {
    patchDevice(id, (x) => ({ ...x, searching: false }))
  }
  const now = devices.find((x) => x.id === id)
  if (now) void poll(now)
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
    if (!d) return
    // a manual retry on a device that's been missing also looks for it on the network
    if ((d.missed ?? 0) >= 1 && !d.demo && isTauri() && (d.mac || d.name)) void find(id)
    else void poll(d)
  },
  async save(id: string, patch: Record<string, unknown>, needsRestart: boolean) {
    const d = devices.find((x) => x.id === id)
    if (!d) return
    await bitaxe.patch(d.host, patch)
    // AxeOS restarts itself after pool and some other changes; give it time to come back
    patchDevice(id, (x) => ({ ...x, pendingRestart: x.pendingRestart || needsRestart, graceUntil: needsRestart ? Date.now() + RESTART_GRACE_MS : x.graceUntil }))
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
    patchDevice(id, (x) => ({ ...x, pendingRestart: false, status: 'connecting', graceUntil: Date.now() + RESTART_GRACE_MS }))
    minerActions.log('info', 'SYSTEM', `Restarting Bitaxe ${d.info?.hostname ?? d.host}`)
  },
  async identify(id: string) {
    const d = devices.find((x) => x.id === id)
    if (d) await bitaxe.identify(d.host)
  },
}
