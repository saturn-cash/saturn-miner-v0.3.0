'use client'

import { useSyncExternalStore } from 'react'
import { invokeCommand, isTauri } from './miner/bridge'

/**
 * Self-update state. The desktop shell checks GitHub for a newer signed Saturn release
 * (src-tauri/src/updater.rs) shortly after launch and every few hours; installing keeps the
 * wallet, settings and node data, which live in the app data folder.
 */
export type UpdateState = {
  phase: 'idle' | 'checking' | 'available' | 'current' | 'installing' | 'error'
  version?: string
  current?: string
  notes?: string
  error?: string
  dismissed?: boolean
  checkedAt?: number
}

let state: UpdateState = { phase: 'idle' }
const listeners = new Set<() => void>()
const set = (patch: Partial<UpdateState>) => {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

export const updater = {
  supported: () => isTauri(),
  async check(quiet = false) {
    if (!isTauri() || state.phase === 'checking' || state.phase === 'installing') return
    set({ phase: 'checking', error: undefined })
    try {
      const r = await invokeCommand<{ available: boolean; version?: string; notes?: string; current: string }>('update_check')
      set({ phase: r.available ? 'available' : 'current', version: r.version, notes: r.notes, current: r.current, checkedAt: Date.now(), dismissed: quiet ? state.dismissed : false })
    } catch (e) {
      // offline, or GitHub unreachable: stay quiet on the automatic checks
      set({ phase: quiet ? 'idle' : 'error', error: String(e), checkedAt: Date.now() })
    }
  },
  async install() {
    if (!isTauri()) return
    set({ phase: 'installing', error: undefined })
    try {
      await invokeCommand('update_install')
    } catch (e) {
      set({ phase: 'error', error: String(e) })
    }
  },
  dismiss() {
    set({ dismissed: true })
  },
  /** First check a little after launch, then every 6 hours. */
  start() {
    if (!isTauri()) return () => {}
    invokeCommand<{ version?: string }>('backend_info').then((b) => b?.version && !state.current && set({ current: b.version })).catch(() => {})
    const first = setTimeout(() => updater.check(true), 8000)
    const every = setInterval(() => updater.check(true), 6 * 3600 * 1000)
    return () => {
      clearTimeout(first)
      clearInterval(every)
    }
  },
}

export function useUpdate() {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => state,
    () => state,
  )
}
