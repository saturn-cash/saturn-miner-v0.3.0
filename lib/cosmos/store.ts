'use client'

import { useSyncExternalStore } from 'react'
import { sound } from '@/lib/audio/sound'

/**
 * Tiny event/state bus between the DOM shell and the 3D cosmos.
 * Imperative values (warp kicks, comets, shakes) are read by the scene every frame
 * without causing React renders. Only `altitude`/`traveling` are subscribable.
 */

export type DestinationId = 'overview' | 'mining' | 'wallet' | 'network' | 'activity' | 'diagnostics' | 'settings' | 'hardware' | 'launch'

type Listener = () => void

interface CosmosUiState {
  altitude: number
  velocity: number
  traveling: boolean
  /** ship position in the Saturn system's top-down plane, for the flight map */
  x: number
  z: number
}

let ui: CosmosUiState = { altitude: 0, velocity: 0, traveling: false, x: 0, z: 150 }
const listeners = new Set<Listener>()

export const cosmosImpulse = {
  destination: 'launch' as DestinationId,
  /** extra warp added on top of travel-derived warp; decays in the scene */
  warpKick: 0,
  shake: 0,
  flash: 0,
  comets: 0,
  supernovaAt: -1,
  /** set true by the boot sequence so the first flight is a long warp in from deep space */
  launching: true,
  /** pointer drag on empty space swings the camera around what it's looking at */
  drag: { active: false, dx: 0, dy: 0 },
}

export const cosmos = {
  travelTo(id: DestinationId) {
    if (cosmosImpulse.destination === id) return
    cosmosImpulse.destination = id
  },
  kick(warp = 0.6, shake = 0.4) {
    cosmosImpulse.warpKick = Math.max(cosmosImpulse.warpKick, warp)
    cosmosImpulse.shake = Math.max(cosmosImpulse.shake, shake)
  },
  comet() {
    cosmosImpulse.comets++
  },
  supernova() {
    cosmosImpulse.flash = 1
    cosmosImpulse.supernovaAt = performance.now()
    cosmos.kick(0.5, 1)
  },
  report(next: CosmosUiState) {
    if (
      Math.abs(next.altitude - ui.altitude) < 1 &&
      Math.abs(next.x - ui.x) < 0.01 &&
      Math.abs(next.z - ui.z) < 0.01 &&
      next.traveling === ui.traveling &&
      Math.abs(next.velocity - ui.velocity) < 1
    )
      return
    ui = next
    for (const l of listeners) l()
  },
}

function subscribe(l: Listener) {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function useCosmosUi<T>(selector: (s: CosmosUiState) => T): T {
  return useSyncExternalStore(
    subscribe,
    () => selector(ui),
    () => selector(ui),
  )
}

/* ------------------------------------------------------------------ */
/* Block-found celebration bus (DOM overlay listens)                   */
/* ------------------------------------------------------------------ */

export interface Celebration {
  id: number
  height: number
  reward: number
  preview?: boolean
}

let celebration: Celebration | null = null
const celebrationListeners = new Set<Listener>()
let celebrationId = 0

export function celebrate(height: number, reward: number, preview = false) {
  celebration = { id: ++celebrationId, height, reward, preview }
  cosmos.supernova()
  sound.block()
  for (const l of celebrationListeners) l()
}

export function clearCelebration() {
  celebration = null
  for (const l of celebrationListeners) l()
}

export function useCelebration() {
  return useSyncExternalStore(
    (l) => {
      celebrationListeners.add(l)
      return () => celebrationListeners.delete(l)
    },
    () => celebration,
    () => null,
  )
}
