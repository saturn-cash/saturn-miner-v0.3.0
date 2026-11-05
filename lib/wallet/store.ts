'use client'

import { useSyncExternalStore } from 'react'
import { invokeCommand, isTauri, TAURI_COMMANDS } from '../miner/bridge'
import { minerActions, poolApi } from '../miner/store'

/**
 * The in-app Saturn wallet (keys live in src-tauri/src/wallet.rs). Balances and sending go through
 * Saturn Pool's light-wallet API, so no local node is needed.
 */
export interface Coin {
  txid: string
  vout: number
  sats: number
  address: string | null
  height: number
  confirmations: number
  coinbase: boolean
  spendable: boolean
}

export interface SentTx {
  txid: string
  amountSats: number
  feeSats: number
  to: string
  time: number
}

export interface WalletState {
  available: boolean // false in the browser preview
  loaded: boolean
  exists: boolean
  address: string | null
  storage: 'keychain' | 'file' | null
  spendableSats: number
  immatureSats: number
  coins: Coin[]
  height: number
  refreshing: boolean
  error: string | null
  sent: SentTx[]
}

const SENT_KEY = 'saturn.wallet.sent'

function loadSent(): SentTx[] {
  try {
    return JSON.parse(window.localStorage.getItem(SENT_KEY) ?? '[]')
  } catch {
    return []
  }
}

let state: WalletState = {
  available: false,
  loaded: false,
  exists: false,
  address: null,
  storage: null,
  spendableSats: 0,
  immatureSats: 0,
  coins: [],
  height: 0,
  refreshing: false,
  error: null,
  sent: [],
}
const listeners = new Set<() => void>()
function set(patch: Partial<WalletState>) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

let started = false
let timer: ReturnType<typeof setInterval> | null = null
function start() {
  if (started || typeof window === 'undefined') return
  started = true
  if (!isTauri()) {
    set({ available: false, loaded: true })
    return
  }
  set({ available: true, sent: loadSent() })
  void walletActions.load()
  timer = setInterval(() => void walletActions.refresh(), 30_000)
}

const server: WalletState = { ...state }
export function useWallet<T>(selector: (s: WalletState) => T): T {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      start()
      return () => listeners.delete(l)
    },
    () => selector(state),
    () => selector(server),
  )
}

const api = () => poolApi(minerActions.getSnapshot().config.poolUrl)

/** Use the wallet's address for mining payouts when none is set yet. */
function adoptAsPayout(address: string, force = false) {
  const current = minerActions.getSnapshot().config.payoutAddress.trim()
  if (force || !current) {
    minerActions.updateConfig({ payoutAddress: address })
    minerActions.log('success', 'WALLET', `Mining payouts now go to your wallet: ${address}`)
  }
}

export const walletActions = {
  async load() {
    try {
      const info = await invokeCommand<{ exists: boolean; address: string | null; storage: 'keychain' | 'file' }>(TAURI_COMMANDS.walletInfo)
      set({ loaded: true, exists: info.exists, address: info.address, storage: info.storage, error: null })
      if (info.exists) void walletActions.refresh()
    } catch (err) {
      set({ loaded: true, error: String(err) })
    }
  },
  async refresh() {
    if (!state.exists || state.refreshing) return
    set({ refreshing: true })
    try {
      const b = await invokeCommand<{ height: number; spendableSats: number; immatureSats: number; coins: Coin[] }>(TAURI_COMMANDS.walletBalance, { api: api() })
      set({ spendableSats: b.spendableSats, immatureSats: b.immatureSats, coins: b.coins, height: b.height, error: null })
    } catch (err) {
      set({ error: String(err) })
    } finally {
      set({ refreshing: false })
    }
  },
  /** Returns the recovery phrase, to be shown once and written down. */
  async create(words: 12 | 24 = 12) {
    const r = await invokeCommand<{ phrase: string; address: string }>(TAURI_COMMANDS.walletCreate, { words })
    set({ exists: true, address: r.address })
    adoptAsPayout(r.address)
    void walletActions.refresh()
    return r
  },
  async restore(phrase: string) {
    const address = await invokeCommand<string>(TAURI_COMMANDS.walletImport, { phrase })
    set({ exists: true, address })
    adoptAsPayout(address)
    void walletActions.refresh()
    return address
  },
  reveal: () => invokeCommand<string>(TAURI_COMMANDS.walletReveal),
  descriptors: () => invokeCommand<{ receive: string; change: string; import: string }>(TAURI_COMMANDS.walletDescriptors),
  checkAddress: (address: string) => invokeCommand<void>(TAURI_COMMANDS.walletCheckAddress, { address }),
  useForMining() {
    if (state.address) adoptAsPayout(state.address, true)
  },
  async remove() {
    await invokeCommand(TAURI_COMMANDS.walletDelete)
    set({ exists: false, address: null, spendableSats: 0, immatureSats: 0, coins: [] })
  },
  /** amountSats null sends everything spendable */
  async send(to: string, amountSats: number | null, feeRate = 2) {
    const r = await invokeCommand<{ txid: string; feeSats: number; amountSats: number }>(TAURI_COMMANDS.walletSend, { api: api(), to, amountSats, feeRate })
    const sent = [{ ...r, to, time: Date.now() }, ...state.sent].slice(0, 50)
    set({ sent })
    try {
      window.localStorage.setItem(SENT_KEY, JSON.stringify(sent))
    } catch {
      /* history is a convenience */
    }
    minerActions.log('success', 'WALLET', `Sent ${(r.amountSats / 1e8).toFixed(8)} SAT to ${to} (fee ${(r.feeSats / 1e8).toFixed(8)})`)
    setTimeout(() => void walletActions.refresh(), 1500)
    return r
  },
}

export const satsToCoin = (s: number) => s / 1e8
/** "1.5" → 150000000 sats; null when it isn't a valid amount */
export function coinToSats(text: string): number | null {
  const t = text.trim()
  if (!/^\d+(\.\d{0,8})?$/.test(t)) return null
  const [i, f = ''] = t.split('.')
  return Number(i) * 1e8 + Number(f.padEnd(8, '0'))
}

export function stopWalletPolling() {
  if (timer) clearInterval(timer)
}
