/** Subset of AxeOS (ESP-Miner) GET /api/system/info that Saturn uses. Units per AxeOS: hashRate GH/s, power W, temps °C, frequency MHz, coreVoltage mV. */
export interface BitaxeInfo {
  hostname?: string
  ASICModel?: string
  boardVersion?: string
  deviceModel?: string
  version?: string
  axeOSVersion?: string
  hashRate?: number
  expectedHashrate?: number
  power?: number
  voltage?: number
  temp?: number
  vrTemp?: number
  frequency?: number
  coreVoltage?: number
  coreVoltageActual?: number
  fanspeed?: number
  fanrpm?: number
  autofanspeed?: number
  temptarget?: number
  sharesAccepted?: number
  sharesRejected?: number
  bestDiff?: number | string
  bestSessionDiff?: number | string
  uptimeSeconds?: number
  stratumURL?: string
  stratumPort?: number
  stratumUser?: string
  fallbackStratumURL?: string
  fallbackStratumPort?: number
  fallbackStratumUser?: string
  isUsingFallbackStratum?: number | boolean
  /** v2.15+: pools moved into an array */
  pools?: Array<Record<string, unknown>>
  primaryPoolIndex?: number
  miningPaused?: number | boolean
  overheat_mode?: number
  wifiRSSI?: number
  [key: string]: unknown
}

/** GET /api/system/asic */
export interface AsicInfo {
  ASICModel?: string
  deviceModel?: string
  asicCount?: number
  defaultFrequency?: number
  frequencyOptions?: number[]
  defaultVoltage?: number
  voltageOptions?: number[]
}

export type DeviceStatus = 'connecting' | 'online' | 'offline'

export interface Device {
  id: string
  host: string
  status: DeviceStatus
  info?: BitaxeInfo
  asic?: AsicInfo
  /** hashrate history in GH/s, newest last */
  history: number[]
  lastSeen?: number
  error?: string
  demo?: boolean
  /** settings that only take effect after a restart */
  pendingRestart?: boolean
}

export interface PoolSettings {
  url: string
  port: number
  user: string
  password: string
}
