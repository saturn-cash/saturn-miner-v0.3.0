export type MinerStatus = 'idle' | 'starting' | 'mining' | 'stopping'
export type LogLevel = 'info' | 'success' | 'warn' | 'error'
export type LogSource = 'MINER' | 'POOL' | 'NODE' | 'WALLET' | 'SYSTEM'

export interface LogEntry {
  id: number
  time: number
  level: LogLevel
  source: LogSource
  message: string
}

export interface Transaction {
  id: string
  type: 'reward' | 'send' | 'receive'
  amount: number
  confirmations: number
  time: number
  address: string
}

export interface Block {
  height: number
  hash: string
  time: number
  txCount: number
  size: number
  minedByYou: boolean
  reward: number
}

export interface Peer {
  id: string
  address: string
  latency: number
  version: string
  height: number
  inbound: boolean
  location: string
}

export interface MinerConfig {
  mode: 'solo' | 'pool'
  poolUrl: string
  worker: string
  payoutAddress: string
  threads: number
  intensity: number
}

export interface Settings {
  animations: boolean
  sound: boolean
  font: 'orbitron' | 'oxanium' | 'rajdhani' | 'chakra'
  /** 0–1 */
  volume: number
  fpsCap: 30 | 60
  rpcUrl: string
  rpcUser: string
  rpcPassword: string
  launchOnStartup: boolean
  minimizeToTray: boolean
  ecoOnBattery: boolean
}

export interface MinerState {
  tick: number
  source: 'simulation' | 'tauri'
  status: MinerStatus
  hashrate: number
  history: number[]
  threadRates: number[]
  maxThreads: number
  acceptedShares: number
  rejectedShares: number
  blocksFound: number
  uptime: number
  temperature: number
  power: number
  pool: { connected: boolean; latency: number; difficulty: number }
  /** Saturn Core node link (desktop only) */
  node: { connected: boolean; error: string | null; version: string; hasWallet: boolean; progress: number }
  network: {
    height: number
    difficulty: number
    networkHashrate: number
    peers: Peer[]
    mempool: number
    synced: boolean
  }
  wallet: {
    balance: number
    immature: number
    address: string
    transactions: Transaction[]
  }
  blocks: Block[]
  log: LogEntry[]
  config: MinerConfig
  settings: Settings
}
