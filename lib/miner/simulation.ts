import type { Block, LogEntry, LogLevel, LogSource, MinerState, Peer, Transaction } from './types'

const HISTORY_LENGTH = 120
const LOG_LIMIT = 200
const PER_THREAD_HS = 14.5e6
const BLOCK_REWARD = 50
const TARGET_BLOCK_SECONDS = 600

let logId = 0
let rngSeed = 20260131

function rand() {
  rngSeed = (rngSeed * 1664525 + 1013904223) % 4294967296
  return rngSeed / 4294967296
}

function hex(len: number) {
  let out = ''
  for (let i = 0; i < len; i++) out += Math.floor(rand() * 16).toString(16)
  return out
}

function blockHash() {
  return `000000${hex(58)}`
}

export function makeLog(level: LogLevel, source: LogSource, message: string, time = Date.now()): LogEntry {
  return { id: ++logId, time, level, source, message }
}

function seedPeers(height: number): Peer[] {
  const regions = ['Frankfurt', 'Ashburn', 'Singapore', 'São Paulo', 'Tokyo', 'Toronto', 'Sydney', 'Helsinki']
  return regions.map((location, i) => ({
    id: `peer-${i}`,
    address: `${Math.floor(rand() * 200) + 20}.${Math.floor(rand() * 255)}.${Math.floor(rand() * 255)}.${Math.floor(rand() * 255)}:9999`,
    latency: Math.round(18 + rand() * 220),
    version: i % 3 === 0 ? '/Saturn:0.1.0/' : '/Saturn:0.1.1/',
    height: height - (i === 5 ? 1 : 0),
    inbound: i % 2 === 1,
    location,
  }))
}

function seedBlocks(height: number, now: number): Block[] {
  return Array.from({ length: 10 }, (_, i) => ({
    height: height - i,
    hash: blockHash(),
    time: now - i * TARGET_BLOCK_SECONDS * 1000 - Math.floor(rand() * 120000),
    txCount: 1 + Math.floor(rand() * 40),
    size: 400 + Math.floor(rand() * 18000),
    minedByYou: i === 4,
    reward: BLOCK_REWARD,
  }))
}

function seedTransactions(address: string, now: number): Transaction[] {
  return [
    { id: hex(64), type: 'reward', amount: 50, confirmations: 112, time: now - 86400000 * 0.6, address },
    { id: hex(64), type: 'receive', amount: 12.5, confirmations: 340, time: now - 86400000 * 1.4, address: 'sat1q8w0…k3m2' },
    { id: hex(64), type: 'send', amount: -4.25, confirmations: 812, time: now - 86400000 * 3.2, address: 'sat1qz9d…7hfa' },
    { id: hex(64), type: 'reward', amount: 50, confirmations: 1460, time: now - 86400000 * 5.9, address },
  ]
}

export function createInitialState(): MinerState {
  const now = Date.now()
  const height = 48213
  const address = 'sat1qm4ztx8v2lw7e3gk9r5yhd0qfnpc6ua2xj8s4t'
  return {
    tick: 0,
    source: 'simulation',
    status: 'idle',
    hashrate: 0,
    history: Array(HISTORY_LENGTH).fill(0),
    threadRates: Array(8).fill(0),
    maxThreads: 16,
    acceptedShares: 0,
    rejectedShares: 0,
    blocksFound: 0,
    uptime: 0,
    temperature: 41,
    power: 18,
    pool: { connected: false, latency: 0, difficulty: 65536 },
    node: { connected: true, error: null, version: '/Saturn Core (simulated)/', hasWallet: true, progress: 1 },
    network: {
      height,
      difficulty: 1_482_331.27,
      networkHashrate: 2.41e12,
      peers: seedPeers(height),
      mempool: 37,
      synced: true,
    },
    wallet: {
      balance: 108.25,
      immature: 50,
      address,
      transactions: seedTransactions(address, now),
    },
    blocks: seedBlocks(height, now),
    log: [
      makeLog('info', 'SYSTEM', 'Saturn Miner v0.2.0-alpha initialised', now - 4000),
      makeLog('info', 'NODE', 'Connected to saturnd via RPC 127.0.0.1:8332', now - 3200),
      makeLog('success', 'NODE', `Chain synced — tip at height ${height}`, now - 2400),
      makeLog('info', 'WALLET', 'Wallet loaded (descriptor, encrypted)', now - 1600),
      makeLog('warn', 'SYSTEM', 'Browser preview: every number on screen is simulated. Install the desktop app to mine for real.', now - 800),
    ],
    config: {
      mode: 'pool',
      poolUrl: 'stratum+tcp://pool.saturn.boats:3333',
      worker: 'rig-01',
      payoutAddress: address,
      threads: 8,
      intensity: 80,
    },
    settings: {
      animations: true,
      sound: true,
      font: 'oxanium',
      volume: 0.6,
      fpsCap: 60,
      rpcUrl: 'http://127.0.0.1:8332',
      rpcUser: '',
      rpcPassword: '',
      launchOnStartup: false,
      minimizeToTray: true,
      ecoOnBattery: true,
    },
  }
}

function pushLog(log: LogEntry[], entry: LogEntry) {
  const next = [...log, entry]
  return next.length > LOG_LIMIT ? next.slice(next.length - LOG_LIMIT) : next
}

function ease(current: number, target: number, factor: number) {
  return current + (target - current) * factor
}

/** Advances the simulated miner by one second. */
export function step(prev: MinerState): MinerState {
  const now = Date.now()
  const s: MinerState = { ...prev, tick: prev.tick + 1 }
  const { threads, intensity, mode } = s.config
  let log = s.log

  if (s.status === 'starting' && prev.tick % 1 === 0) {
    s.status = 'mining'
    s.pool = { ...s.pool, connected: mode === 'pool', latency: 42 }
    if (mode === 'pool') log = pushLog(log, makeLog('success', 'POOL', `Authorised worker "${s.config.worker}" on ${s.config.poolUrl}`))
    log = pushLog(log, makeLog('info', 'MINER', `SHA-256d engine online — ${threads} threads @ ${intensity}% intensity`))
  } else if (s.status === 'stopping') {
    s.status = 'idle'
    s.pool = { ...s.pool, connected: false, latency: 0 }
    log = pushLog(log, makeLog('info', 'MINER', 'Workers halted. Engine idle.'))
  }

  const mining = s.status === 'mining'
  const load = mining ? intensity / 100 : 0

  s.threadRates = Array.from({ length: threads }, (_, i) => {
    const current = prev.threadRates[i] ?? 0
    const target = mining ? PER_THREAD_HS * load * (0.92 + rand() * 0.14) : 0
    return ease(current, target, mining ? 0.35 : 0.5)
  })
  s.hashrate = s.threadRates.reduce((a, b) => a + b, 0)
  s.history = [...prev.history.slice(1), s.hashrate]

  s.temperature = ease(prev.temperature, 40 + load * (threads / s.maxThreads) * 42 + rand() * 1.5, 0.08)
  s.power = ease(prev.power, 16 + load * threads * 7.2 + rand() * 2, 0.15)

  if (mining) {
    s.uptime = prev.uptime + 1
    s.pool = { ...s.pool, latency: Math.round(ease(s.pool.latency, 38 + rand() * 30, 0.3)) }

    if (mode === 'pool') {
      const sharesPerSecond = s.hashrate / (s.pool.difficulty * 4294967296) * 1e4
      if (rand() < Math.min(0.55, sharesPerSecond)) {
        if (rand() < 0.985) {
          s.acceptedShares = prev.acceptedShares + 1
          if (s.acceptedShares % 5 === 0) log = pushLog(log, makeLog('success', 'POOL', `Share accepted (${s.acceptedShares}) · diff ${s.pool.difficulty.toLocaleString()} · ${s.pool.latency}ms`))
        } else {
          s.rejectedShares = prev.rejectedShares + 1
          log = pushLog(log, makeLog('warn', 'POOL', 'Share rejected — stale job (new block template)'))
        }
      }
    }
  }

  const networkJitter = 1 + (rand() - 0.5) * 0.02
  s.network = { ...prev.network, networkHashrate: prev.network.networkHashrate * networkJitter, mempool: Math.max(0, Math.round(prev.network.mempool + (rand() - 0.5) * 4)) }

  if (rand() < 1 / 90) {
    const height = s.network.height + 1
    const youFound = mining && rand() < 0.08
    const block: Block = {
      height,
      hash: blockHash(),
      time: now,
      txCount: 1 + Math.floor(rand() * 40),
      size: 400 + Math.floor(rand() * 18000),
      minedByYou: youFound,
      reward: BLOCK_REWARD,
    }
    s.network = { ...s.network, height, mempool: Math.floor(rand() * 8), peers: s.network.peers.map((p) => ({ ...p, height })) }
    s.blocks = [block, ...prev.blocks].slice(0, 25)
    log = pushLog(log, makeLog('info', 'NODE', `New block ${height} · ${block.txCount} tx · ${block.hash.slice(0, 16)}…`))
    if (youFound) {
      s.blocksFound = prev.blocksFound + 1
      s.wallet = {
        ...prev.wallet,
        immature: prev.wallet.immature + BLOCK_REWARD,
        transactions: [{ id: hex(64), type: 'reward', amount: BLOCK_REWARD, confirmations: 0, time: now, address: prev.wallet.address }, ...prev.wallet.transactions],
      }
      log = pushLog(log, makeLog('success', 'MINER', `BLOCK FOUND at height ${height}! +${BLOCK_REWARD} SAT (immature, 100 conf)`))
    } else {
      s.wallet = { ...prev.wallet, transactions: prev.wallet.transactions.map((t) => ({ ...t, confirmations: t.confirmations + 1 })) }
    }
  }

  if (prev.tick % 6 === 0) {
    s.network = { ...s.network, peers: s.network.peers.map((p) => ({ ...p, latency: Math.max(8, Math.round(p.latency + (rand() - 0.5) * 14)) })) }
  }

  s.log = log
  return s
}
