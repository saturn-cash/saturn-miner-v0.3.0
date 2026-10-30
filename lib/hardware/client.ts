'use client'

import { invokeCommand, isTauri } from '@/lib/miner/bridge'
import type { AsicInfo, BitaxeInfo, PoolSettings } from './types'

/**
 * Talks to a Bitaxe over AxeOS's local REST API (no auth; LAN only).
 *
 * In the desktop app every request goes through the Rust command `bitaxe_request`, because the
 * webview can't reach plain-http LAN devices directly (mixed content + AxeOS's private-origin check).
 * In the browser preview we try a direct fetch, which only works when the page itself is served
 * from a private-network address. The demo device never touches the network.
 */

export const DEMO_HOST = 'demo-gamma.local'

const HOST_RE = /^[a-zA-Z0-9.-]+(:\d{1,5})?$/

export function normalizeHost(input: string) {
  const host = input
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/.*$/, '')
  return HOST_RE.test(host) ? host : null
}

async function request<T>(host: string, method: 'GET' | 'POST' | 'PATCH', path: string, body?: unknown): Promise<T> {
  if (host === DEMO_HOST) return demo.handle(method, path, body) as T
  if (isTauri()) return invokeCommand<T>('bitaxe_request', { host, method, path, body: body ?? null })

  const res = await fetch(`http://${host}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(4000),
  })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  const text = await res.text()
  try {
    return JSON.parse(text) as T
  } catch {
    return text as T
  }
}

export const bitaxe = {
  info: (host: string) => request<BitaxeInfo>(host, 'GET', '/api/system/info'),
  asic: (host: string) => request<AsicInfo>(host, 'GET', '/api/system/asic'),
  patch: (host: string, body: Record<string, unknown>) => request<unknown>(host, 'PATCH', '/api/system', body),
  restart: (host: string) => request<unknown>(host, 'POST', '/api/system/restart'),
  identify: (host: string) => request<unknown>(host, 'POST', '/api/system/identify'),
  async scan(): Promise<string[]> {
    if (!isTauri()) throw new Error('Network scan needs the desktop app')
    return invokeCommand<string[]>('bitaxe_scan')
  },
}

/* ------------------------------------------------------------------ */
/* Settings builders                                                   */
/* ------------------------------------------------------------------ */

/** AxeOS wants a bare host for stratumURL ("pool.example.com"), no scheme and no port. */
export function parseStratum(url: string): { host: string; port: number | null } {
  const bare = url.trim().replace(/^[a-z+]+:\/\//i, '')
  const [host, port] = bare.split(':')
  const n = Number(port)
  return { host: host ?? '', port: Number.isFinite(n) && n > 0 ? n : null }
}

/**
 * Builds the PATCH body for the primary pool. Firmware v2.15+ replaced the flat stratum* keys with
 * a `pools` array, so when the device reports one we mirror the key names it uses.
 */
export function buildPoolPatch(info: BitaxeInfo | undefined, pool: PoolSettings): Record<string, unknown> {
  if (info && Array.isArray(info.pools)) {
    const idx = typeof info.primaryPoolIndex === 'number' ? info.primaryPoolIndex : 0
    const current = info.pools[idx] ?? {}
    const keys = Object.keys(current)
    const find = (re: RegExp, fallback: string) => keys.find((k) => re.test(k) && !/tls|cert|v2|protocol/i.test(k)) ?? fallback
    return {
      pools: [
        {
          id: idx,
          [find(/url|host/i, 'stratumURL')]: pool.url,
          [find(/port/i, 'stratumPort')]: pool.port,
          [find(/user/i, 'stratumUser')]: pool.user,
          [find(/pass/i, 'stratumPassword')]: pool.password,
        },
      ],
    }
  }
  return { stratumURL: pool.url, stratumPort: pool.port, stratumUser: pool.user, stratumPassword: pool.password }
}

/** Current primary pool, whichever firmware generation the device runs. */
export function currentPool(info: BitaxeInfo | undefined): { url: string; port: number; user: string } | null {
  if (!info) return null
  if (Array.isArray(info.pools)) {
    const p = info.pools[typeof info.primaryPoolIndex === 'number' ? info.primaryPoolIndex : 0]
    if (!p) return null
    const get = (re: RegExp) => Object.entries(p).find(([k]) => re.test(k) && !/tls|cert|v2|protocol/i.test(k))?.[1]
    return { url: String(get(/url|host/i) ?? ''), port: Number(get(/port/i) ?? 0), user: String(get(/user/i) ?? '') }
  }
  return { url: info.stratumURL ?? '', port: info.stratumPort ?? 0, user: info.stratumUser ?? '' }
}

/* ------------------------------------------------------------------ */
/* Tuning presets                                                      */
/* ------------------------------------------------------------------ */

/** Stock clocks per chip, used when older firmware has no /api/system/asic endpoint. */
const CHIP_DEFAULTS: Record<string, { f: number; v: number; device: string }> = {
  BM1397: { f: 425, v: 1400, device: 'Max' },
  BM1366: { f: 485, v: 1200, device: 'Ultra' },
  BM1368: { f: 490, v: 1166, device: 'Supra' },
  BM1370: { f: 525, v: 1150, device: 'Gamma' },
}

export function tuningOptions(asic: AsicInfo | undefined, model: string | undefined) {
  const chip = CHIP_DEFAULTS[model ?? ''] ?? CHIP_DEFAULTS.BM1370
  const defF = asic?.defaultFrequency ?? chip.f
  const defV = asic?.defaultVoltage ?? chip.v
  const freqs = asic?.frequencyOptions?.length ? [...asic.frequencyOptions].sort((a, b) => a - b) : [0.8, 0.85, 0.9, 0.95, 1, 1.05, 1.1].map((k) => Math.round(defF * k))
  const volts = asic?.voltageOptions?.length ? [...asic.voltageOptions].sort((a, b) => a - b) : [-100, -50, 0, 50, 100].map((d) => defV + d)
  const below = <T extends number>(list: T[], x: number) => [...list].reverse().find((v) => v <= x) ?? list[0]
  const above = <T extends number>(list: T[], x: number) => list.find((v) => v >= x) ?? list[list.length - 1]
  const vIdx = Math.max(0, volts.indexOf(below(volts, defV)))
  return {
    device: asic?.deviceModel ?? chip.device,
    freqs,
    volts,
    presets: {
      eco: { frequency: below(freqs, defF * 0.86), coreVoltage: volts[Math.max(0, vIdx - 1)] },
      stock: { frequency: defF, coreVoltage: defV },
      turbo: { frequency: above(freqs, defF * 1.06), coreVoltage: volts[Math.min(volts.length - 1, vIdx + 1)] },
    },
  }
}

/* ------------------------------------------------------------------ */
/* Demo device: a simulated Bitaxe Gamma so the screen works anywhere   */
/* ------------------------------------------------------------------ */

const demo = (() => {
  const s: BitaxeInfo = {
    hostname: 'bitaxe-demo',
    ASICModel: 'BM1370',
    deviceModel: 'Gamma',
    boardVersion: '601',
    version: 'v2.14.2',
    frequency: 525,
    coreVoltage: 1150,
    autofanspeed: 1,
    temptarget: 60,
    fanspeed: 48,
    stratumURL: 'public-pool.io',
    stratumPort: 21496,
    stratumUser: 'bc1qdemo.bitaxe',
    sharesAccepted: 4210,
    sharesRejected: 3,
    bestDiff: 49224525,
    bestSessionDiff: 2038368,
    uptimeSeconds: 86400 * 3 + 4123,
    wifiRSSI: -54,
  }
  let restartingUntil = 0
  const asic: AsicInfo = {
    ASICModel: 'BM1370',
    deviceModel: 'Gamma',
    asicCount: 1,
    defaultFrequency: 525,
    frequencyOptions: [400, 425, 450, 475, 500, 525, 550, 575, 600],
    defaultVoltage: 1150,
    voltageOptions: [1100, 1150, 1200, 1250],
  }
  function tick() {
    const load = (s.frequency ?? 525) / 525
    const fan = s.autofanspeed ? 40 + Math.max(0, (s.temp ?? 55) - (s.temptarget ?? 60)) * 6 : (s.fanspeed ?? 50)
    s.fanspeed = Math.min(100, fan)
    s.expectedHashrate = 1100 * load * 1.0
    s.hashRate = s.expectedHashrate * (0.94 + Math.random() * 0.1)
    s.power = 18.5 * load * ((s.coreVoltage ?? 1150) / 1150) ** 2 + Math.random() * 0.4
    s.temp = 48 + s.power * 0.9 - s.fanspeed * 0.12 + Math.random()
    s.vrTemp = s.temp + 4 + Math.random()
    s.uptimeSeconds = (s.uptimeSeconds ?? 0) + 3
    if (Math.random() < 0.6) s.sharesAccepted = (s.sharesAccepted ?? 0) + 1
  }
  return {
    async handle(method: string, path: string, body: unknown) {
      await new Promise((r) => setTimeout(r, 120))
      if (Date.now() < restartingUntil) throw new Error('Device is restarting')
      if (method === 'GET' && path === '/api/system/info') {
        tick()
        return { ...s }
      }
      if (method === 'GET' && path === '/api/system/asic') return asic
      if (method === 'PATCH' && path === '/api/system') {
        Object.assign(s, body as object)
        return ''
      }
      if (method === 'POST' && path === '/api/system/restart') {
        restartingUntil = Date.now() + 4000
        s.uptimeSeconds = 0
        return 'Restarting'
      }
      if (method === 'POST' && path === '/api/system/identify') return ''
      throw new Error(`Demo device has no ${method} ${path}`)
    },
  }
})()
