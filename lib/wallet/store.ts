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

export interface WalletSummary {
  id: string
  name: string
  /** "phrase" (recovery phrase), "xprv" (imported from Saturn Core) or "key" (one private key) */
  kind: 'phrase' | 'xprv' | 'key'
  address: string
}

export interface WalletState {
  available: boolean // false in the browser preview
  loaded: boolean
  exists: boolean
  wallets: WalletSummary[]
  active: string | null
  /** receive addresses handed out by the active wallet, oldest first */
  addresses: string[]
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
  wallets: [],
  active: null,
  addresses: [],
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
      const info = await invokeCommand<{ exists: boolean; active: string | null; wallets: WalletSummary[]; address: string | null; storage: 'keychain' | 'file' }>(TAURI_COMMANDS.walletInfo)
      set({ loaded: true, exists: info.exists, wallets: info.wallets, active: info.active, address: info.address, storage: info.storage, error: null })
      if (info.exists) {
        const rows = await invokeCommand<Array<{ address: string; index: number }>>(TAURI_COMMANDS.walletAddresses).catch(() => [])
        set({ addresses: rows.map((r) => r.address) })
        void walletActions.refresh()
      } else {
        set({ addresses: [], spendableSats: 0, immatureSats: 0, coins: [] })
      }
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
  async create(name?: string, words: 12 | 24 = 12) {
    const r = await invokeCommand<{ id: string; phrase: string; address: string }>(TAURI_COMMANDS.walletCreate, { name: name || null, words })
    adoptAsPayout(r.address)
    await walletActions.load()
    return r
  },
  /** A recovery phrase, a Saturn Core descriptor/xprv (listdescriptors true), or a WIF private key. */
  async restore(secret: string, name?: string) {
    const r = await invokeCommand<{ id: string; kind: string; address: string }>(TAURI_COMMANDS.walletImport, { secret, name: name || null })
    adoptAsPayout(r.address)
    await walletActions.load()
    return r
  },
  async select(id: string) {
    if (id === state.active) return
    await invokeCommand(TAURI_COMMANDS.walletSelect, { id })
    set({ spendableSats: 0, immatureSats: 0, coins: [] })
    await walletActions.load()
  },
  async rename(id: string, name: string) {
    await invokeCommand(TAURI_COMMANDS.walletRename, { id, name })
    await walletActions.load()
  },
  async newAddress() {
    const r = await invokeCommand<{ address: string; index: number }>(TAURI_COMMANDS.walletNewAddress)
    set({ addresses: [...state.addresses, r.address] })
    return r.address
  },
  /** Mine to a specific address of any wallet. */
  mineTo(address: string) {
    adoptAsPayout(address, true)
  },
  reveal: () => invokeCommand<string>(TAURI_COMMANDS.walletReveal),
  descriptors: () => invokeCommand<{ receive: string; change: string; import: string }>(TAURI_COMMANDS.walletDescriptors),
  checkAddress: (address: string) => invokeCommand<void>(TAURI_COMMANDS.walletCheckAddress, { address }),
  useForMining() {
    if (state.address) adoptAsPayout(state.address, true)
  },
  async remove() {
    await invokeCommand(TAURI_COMMANDS.walletDelete, { id: state.active })
    set({ spendableSats: 0, immatureSats: 0, coins: [] })
    await walletActions.load()
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
