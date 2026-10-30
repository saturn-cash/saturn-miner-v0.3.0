'use client'

import { useSyncExternalStore } from 'react'
import { invokeCommand, isTauri, TAURI_COMMANDS } from './bridge'
import { createInitialState, makeLog, step } from './simulation'
import type { LogEntry, MinerConfig, MinerState, Settings } from './types'

type Listener = () => void

const SETTINGS_KEY = 'saturn.settings'
const CONFIG_KEY = 'saturn.config'
const LOG_LIMIT = 300

/** settings survive restarts; everything else is live telemetry */
function loadSettings(s: MinerState): MinerState {
  if (typeof window === 'undefined') return s
  try {
    const saved = JSON.parse(window.localStorage.getItem(SETTINGS_KEY) ?? 'null')
    return saved ? { ...s, settings: { ...s.settings, ...saved } } : s
  } catch {
    return s
  }
}

function saveSettings(settings: MinerState['settings']) {
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    /* storage unavailable: settings just won't persist */
  }
}

let state: MinerState = loadSettings(createInitialState())
const listeners = new Set<Listener>()
let timer: ReturnType<typeof setInterval> | null = null
let telemetryInFlight = false

function emit() {
  for (const l of listeners) l()
}

function setState(next: MinerState) {
  state = next
  emit()
}

function update(fn: (s: MinerState) => MinerState) {
  setState(fn(state))
}

function saveConfig(config: MinerConfig) {
  try {
    window.localStorage.setItem(CONFIG_KEY, JSON.stringify(config))
  } catch {
    /* ignore */
  }
}

/** id of the last log line received from the Rust engine, so each poll only fetches new lines */
let lastLogId = 0

/** What the Rust engine reports each second. Wallet and network data come from a node, not from here. */
interface Telemetry {
  status: MinerState['status']
  hashrate: number
  threadRates: number[]
  maxThreads: number
  acceptedShares: number
  rejectedShares: number
  blocksFound: number
  uptime: number
  pool: MinerState['pool']
  log: LogEntry[]
  jobHeight: number | null
}

/**
 * Switch from the demo simulation to the real engine: drop every made-up number, load the saved
 * mining config, and leave wallet/network empty until a Saturn Core node is connected.
 */
function enterNativeMode(maxThreads: number) {
  let saved: Partial<MinerConfig> = {}
  try {
    saved = JSON.parse(window.localStorage.getItem(CONFIG_KEY) ?? '{}')
  } catch {
    saved = {}
  }
  const fresh = createInitialState()
  const config: MinerConfig = {
    mode: 'pool',
    poolUrl: 'stratum+tcp://pool.saturn.boats:3333',
    worker: 'rig-01',
    payoutAddress: '',
    threads: Math.max(1, Math.floor(maxThreads * 0.75)),
    intensity: 100,
    ...saved,
  }
  config.threads = Math.min(Math.max(1, config.threads), maxThreads)
  setState({
    ...fresh,
    settings: state.settings,
    source: 'tauri',
    config,
    maxThreads,
    threadRates: Array(config.threads).fill(0),
    pool: { connected: false, latency: 0, difficulty: 0 },
    node: { connected: false, error: null, version: '', hasWallet: false, progress: 0 },
    network: { height: 0, difficulty: 0, networkHashrate: 0, peers: [], mempool: 0, synced: false },
    wallet: { balance: 0, immature: 0, address: config.payoutAddress, transactions: [] },
    blocks: [],
    log: [
      makeLog('info', 'SYSTEM', 'Saturn Miner desktop engine ready. Mining is real; wallet and network data need a node.'),
      makeLog('info', 'SYSTEM', `${maxThreads} CPU threads available`),
      ...(config.payoutAddress ? [] : [makeLog('warn', 'MINER', 'Set your sat1 payout address on the Mining screen before you start')]),
    ],
  })
}

interface NodeSnapshot {
  connected: boolean
  error: string | null
  version: string
  height: number
  headers: number
  difficulty: number
  networkHashrate: number
  mempool: number
  synced: boolean
  progress: number
  peers: MinerState['network']['peers']
  blocks: MinerState['blocks']
  hasWallet: boolean
  balance: number
  immature: number
  transactions: MinerState['wallet']['transactions']
}

let nodeInFlight = false
let nodeWasConnected: boolean | null = null

/** Every few seconds, pull wallet + chain + peers from the Saturn Core node named in Settings. */
async function tickNode() {
  if (nodeInFlight) return
  nodeInFlight = true
  try {
    const { rpcUrl, rpcUser, rpcPassword } = state.settings
    const n = await invokeCommand<NodeSnapshot>(TAURI_COMMANDS.nodeSnapshot, {
      auth: { url: rpcUrl, user: rpcUser, password: rpcPassword },
      payoutAddress: state.config.payoutAddress,
    })
    update((s) => {
      let log = s.log
      if (n.connected && nodeWasConnected !== true) log = [...log, makeLog('success', 'NODE', `Connected to Saturn Core ${n.version} at height ${n.height}`)]
      if (!n.connected && nodeWasConnected !== false) log = [...log, makeLog('warn', 'NODE', n.error ?? 'Node unreachable')]
      nodeWasConnected = n.connected
      if (!n.connected) return { ...s, log, node: { ...s.node, connected: false, error: n.error } }
      return {
        ...s,
        log,
        node: { connected: true, error: null, version: n.version, hasWallet: n.hasWallet, progress: n.progress },
        network: { height: n.height, difficulty: n.difficulty, networkHashrate: n.networkHashrate, peers: n.peers, mempool: n.mempool, synced: n.synced },
        blocks: n.blocks,
        wallet: n.hasWallet ? { ...s.wallet, balance: n.balance, immature: n.immature, transactions: n.transactions } : s.wallet,
      }
    })
  } catch (err) {
    update((s) => ({ ...s, node: { ...s.node, connected: false, error: String(err) } }))
  } finally {
    nodeInFlight = false
  }
}

async function tickTauri() {
  if (telemetryInFlight) return
  telemetryInFlight = true
  try {
    const t = await invokeCommand<Telemetry>(TAURI_COMMANDS.telemetry, { since: lastLogId })
    update((s) => {
      const incoming = t.log ?? []
      if (incoming.length) lastLogId = incoming[incoming.length - 1].id
      // keep the engine's ids distinct from locally generated ones
      const merged = [...s.log, ...incoming.map((e) => ({ ...e, id: e.id + 1_000_000 }))]
      const log = merged.length > LOG_LIMIT ? merged.slice(merged.length - LOG_LIMIT) : merged
      // the Rust side only knows idle/starting/mining; keep a local "stopping" until it confirms idle
      const status = s.status === 'stopping' && t.status !== 'idle' ? 'stopping' : t.status
      const threadRates = t.threadRates.slice(0, s.config.threads)
      return {
        ...s,
        tick: s.tick + 1,
        status,
        hashrate: t.hashrate,
        history: [...s.history.slice(1), t.hashrate],
        threadRates,
        maxThreads: t.maxThreads,
        acceptedShares: t.acceptedShares,
        rejectedShares: t.rejectedShares,
        blocksFound: t.blocksFound,
        uptime: t.uptime,
        pool: t.pool,
        network: t.jobHeight && t.jobHeight > s.network.height ? { ...s.network, height: t.jobHeight } : s.network,
        log,
      }
    })
  } catch (err) {
    update((s) => ({ ...s, tick: s.tick + 1, log: [...s.log, makeLog('error', 'SYSTEM', `Telemetry unavailable: ${String(err)}`)] }))
  } finally {
    telemetryInFlight = false
  }
}

/**
 * True only when the desktop shell reports a real mining engine. The shell can exist without one
 * (Bitaxe control works on its own), in which case CPU mining stays simulated.
 */
let nativeMiner = false

function startLoop() {
  if (timer || typeof window === 'undefined') return
  if (isTauri()) {
    invokeCommand<{ miner?: boolean; maxThreads?: number }>(TAURI_COMMANDS.backendInfo)
      .then((info) => {
        nativeMiner = !!info?.miner
        if (nativeMiner) enterNativeMode(info?.maxThreads ?? 4)
      })
      .catch(() => {
        nativeMiner = false
      })
  }
  let n = 0
  timer = setInterval(() => {
    if (nativeMiner) {
      void tickTauri()
      if (n++ % 5 === 0) void tickNode()
    } else setState(step(state))
  }, 1000)
}

function subscribe(listener: Listener) {
  listeners.add(listener)
  startLoop()
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && timer) {
      clearInterval(timer)
      timer = null
    }
  }
}

const serverState = createInitialState()

/** Selectors must return a value already present on state (or a primitive) to keep renders incremental. */
export function useMiner<T>(selector: (s: MinerState) => T): T {
  return useSyncExternalStore(
    subscribe,
    () => selector(state),
    () => selector(serverState),
  )
}

export const minerActions = {
  async start() {
    if (state.status !== 'idle') return
    if (nativeMiner && !state.config.payoutAddress.trim().startsWith('sat1')) {
      update((s) => ({ ...s, log: [...s.log, makeLog('error', 'MINER', 'Enter your sat1 payout address on the Mining screen first. Shares are paid to that address.')] }))
      return
    }
    update((s) => ({ ...s, status: 'starting', log: [...s.log, makeLog('info', 'MINER', 'Spinning up SHA-256d workers…')] }))
    if (nativeMiner) {
      try {
        await invokeCommand(TAURI_COMMANDS.start, { config: state.config })
      } catch (err) {
        update((s) => ({ ...s, status: 'idle', log: [...s.log, makeLog('error', 'MINER', `Failed to start: ${String(err)}`)] }))
      }
    }
  },
  async stop() {
    if (state.status !== 'mining') return
    update((s) => ({ ...s, status: 'stopping', log: [...s.log, makeLog('info', 'MINER', 'Stop requested — draining work queue…')] }))
    if (nativeMiner) {
      try {
        await invokeCommand(TAURI_COMMANDS.stop)
      } finally {
        update((s) => ({ ...s, status: 'idle' }))
      }
    }
  },
  updateConfig(patch: Partial<MinerConfig>) {
    update((s) => {
      const config = { ...s.config, ...patch }
      const wallet = nativeMiner && patch.payoutAddress !== undefined ? { ...s.wallet, address: config.payoutAddress } : s.wallet
      return { ...s, config, wallet }
    })
    if (nativeMiner) saveConfig(state.config)
  },
  updateSettings(patch: Partial<Settings>) {
    update((s) => ({ ...s, settings: { ...s.settings, ...patch } }))
    saveSettings(state.settings)
    if (nativeMiner && ('rpcUrl' in patch || 'rpcUser' in patch || 'rpcPassword' in patch)) {
      nodeWasConnected = null
      void tickNode()
    }
  },
  /** Ask the node's wallet for a fresh receiving address and use it as the payout address. */
  async useNodeAddress() {
    if (!nativeMiner) return
    try {
      const { rpcUrl, rpcUser, rpcPassword } = state.settings
      const addr = await invokeCommand<string>(TAURI_COMMANDS.nodeRpc, { auth: { url: rpcUrl, user: rpcUser, password: rpcPassword }, method: 'getnewaddress', params: ['Saturn Miner', 'bech32'] })
      if (typeof addr === 'string' && addr.startsWith('sat1')) {
        minerActions.updateConfig({ payoutAddress: addr })
        update((s) => ({ ...s, log: [...s.log, makeLog('success', 'WALLET', `Payout address set to ${addr}`)] }))
      }
    } catch (err) {
      update((s) => ({ ...s, log: [...s.log, makeLog('error', 'WALLET', `Could not get an address from the node: ${String(err)}`)] }))
    }
  },
  log(level: Parameters<typeof makeLog>[0], source: Parameters<typeof makeLog>[1], message: string) {
    update((s) => ({ ...s, log: [...s.log, makeLog(level, source, message)] }))
  },
  getSnapshot() {
    return state
  },
}
