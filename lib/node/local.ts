'use client'

import { useSyncExternalStore } from 'react'
import { invokeCommand, isTauri, TAURI_COMMANDS } from '../miner/bridge'
import { minerActions } from '../miner/store'

/**
 * The full Saturn Core node the app can run on this computer (src-tauri/src/local_node.rs).
 * When it's on, the app downloads saturnd once, starts it with Saturn, points the node connection
 * (Settings → Saturn Core connection) at it, and stops it cleanly when Saturn quits.
 */
export interface LocalNodeStatus {
  supported: boolean
  installed: boolean
  version: string
  running: boolean
  rpcReachable: boolean
  pid: number | null
  datadir: string
  binary: string
  downloading: { received: number; total: number } | null
  error: string | null
  rpcUrl: string
}

export interface LocalNodeState {
  available: boolean
  status: LocalNodeStatus | null
  busy: 'installing' | 'starting' | 'stopping' | null
  /** when the node we started came up, for the "looking for peers" hint */
  startedAt: number | null
}

let state: LocalNodeState = { available: false, status: null, busy: null, startedAt: null }
const server: LocalNodeState = { ...state }
const listeners = new Set<() => void>()
function set(patch: Partial<LocalNodeState>) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

let started = false
let autostarted = false
function start() {
  if (started || typeof window === 'undefined') return
  started = true
  if (!isTauri()) return
  set({ available: true })
  const poll = async () => {
    await refresh()
    setTimeout(poll, state.busy || state.status?.downloading ? 700 : 3000)
  }
  void poll()
}

async function refresh() {
  try {
    const status = await invokeCommand<LocalNodeStatus>(TAURI_COMMANDS.localNodeStatus)
    const wasRunning = state.status?.running
    set({ status })
    if (wasRunning && !status.running && !state.busy && status.error) minerActions.log('error', 'NODE', status.error)
    // first look after launch: bring the node back up if it was on last time
    if (!autostarted) {
      autostarted = true
      if (minerActions.getSnapshot().settings.runNode && status.installed && !status.running && !status.rpcReachable) void localNodeActions.start()
    }
  } catch {
    /* status is best-effort */
  }
}

export function useLocalNode<T>(selector: (s: LocalNodeState) => T): T {
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

/** Point the app's node connection at the node on this computer (cookie auth, no password). */
function connectToLocal(url: string) {
  const s = minerActions.getSnapshot().settings
  if (s.rpcUrl !== url || s.rpcUser || s.rpcPassword) minerActions.updateSettings({ rpcUrl: url, rpcUser: '', rpcPassword: '' })
  else minerActions.updateSettings({ rpcUrl: url }) // re-check the connection now
}

export const localNodeActions = {
  /** Turn the built-in node on: download it the first time, then start it. */
  async enable() {
    minerActions.updateSettings({ runNode: true })
    if (!state.status?.installed) {
      const ok = await localNodeActions.install()
      if (!ok) return
    }
    await localNodeActions.start()
  },
  async disable() {
    minerActions.updateSettings({ runNode: false })
    await localNodeActions.stop()
  },
  async install() {
    set({ busy: 'installing' })
    minerActions.log('info', 'NODE', 'Downloading Saturn Core…')
    try {
      await invokeCommand(TAURI_COMMANDS.localNodeInstall)
      minerActions.log('success', 'NODE', 'Saturn Core downloaded and verified')
      return true
    } catch (err) {
      minerActions.log('error', 'NODE', `Couldn't install Saturn Core: ${String(err)}`)
      return false
    } finally {
      set({ busy: null })
      await refresh()
    }
  },
  async start() {
    set({ busy: 'starting' })
    try {
      await invokeCommand(TAURI_COMMANDS.localNodeStart)
      set({ startedAt: Date.now() })
      minerActions.log('success', 'NODE', 'Saturn Core is running on this computer. It connects to pool.saturn.boats:9999 and downloads the chain.')
      connectToLocal(state.status?.rpcUrl ?? 'http://127.0.0.1:9998')
    } catch (err) {
      const msg = String(err)
      // someone already runs a node here: use that one
      if (/already running/i.test(msg)) connectToLocal(state.status?.rpcUrl ?? 'http://127.0.0.1:9998')
      minerActions.log(/already running/i.test(msg) ? 'info' : 'error', 'NODE', msg)
    } finally {
      set({ busy: null })
      await refresh()
    }
  },
  async stop() {
    if (!state.status?.running) return
    set({ busy: 'stopping' })
    try {
      await invokeCommand(TAURI_COMMANDS.localNodeStop)
      minerActions.log('info', 'NODE', 'Saturn Core stopped')
    } catch (err) {
      minerActions.log('error', 'NODE', `Couldn't stop Saturn Core: ${String(err)}`)
    } finally {
      set({ busy: null, startedAt: null })
      await refresh()
    }
  },
}
