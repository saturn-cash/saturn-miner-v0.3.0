import * as THREE from 'three'

/**
 * Saturn's moons: every named ring moon and major moon on its real orbit radius, plus a
 * procedural swarm standing in for the ~270 small irregular moons (most are a few km wide,
 * named only by catalogue number). Wikipedia lists 293 confirmed moons as of June 2026.
 *
 * Scene units: Saturn's equatorial radius = 1 (58,232 km). Orbits inside Titan are true to scale;
 * beyond ~22 radii they're compressed so Iapetus and Phoebe still fit in the scene.
 * Moon sizes are exaggerated (true scale, Titan would be a speck) but keep their relative order.
 */

export const SATURN_KM = 58232
export const SATURN_TILT = new THREE.Euler(0.42, 0, -0.32)

export type MoonFeature = 'craters' | 'mimas' | 'ice' | 'tethys' | 'dione' | 'rhea' | 'titan' | 'sponge' | 'iapetus' | 'dark'

export interface Moon {
  name: string
  orbitKm: number
  radiusKm: number
  /** starting angle in degrees */
  phase: number
  /** inclination to the ring plane in degrees (>90 = retrograde) */
  incl?: number
  feature: MoonFeature
  colorA: string
  colorB: string
  /** non-uniform scale for the potato-shaped small moons */
  shape?: [number, number, number]
  kind: 'ring' | 'major' | 'trojan' | 'outer'
  note?: string
}

export const MOONS: Moon[] = [
  // ring moons and shepherds
  { name: 'Pan', orbitKm: 133584, radiusKm: 14, phase: 10, feature: 'craters', colorA: '#cdbfa8', colorB: '#8f826e', shape: [1.2, 0.6, 1.2], kind: 'ring', note: 'Walnut-shaped; sweeps the Encke Gap' },
  { name: 'Daphnis', orbitKm: 136505, radiusKm: 3.8, phase: 140, feature: 'craters', colorA: '#d6cab5', colorB: '#9d907b', shape: [1.1, 0.7, 1], kind: 'ring', note: 'Raises waves in the Keeler Gap' },
  { name: 'Atlas', orbitKm: 137670, radiusKm: 15, phase: 250, feature: 'craters', colorA: '#d0c4ae', colorB: '#8c7f6b', shape: [1.25, 0.6, 1.2], kind: 'ring', note: 'Flying-saucer moon at the edge of the A Ring' },
  { name: 'Prometheus', orbitKm: 139380, radiusKm: 43, phase: 60, feature: 'craters', colorA: '#c9bca6', colorB: '#7e715e', shape: [1.6, 0.8, 0.9], kind: 'ring', note: 'Shepherds the inner F Ring' },
  { name: 'Pandora', orbitKm: 141720, radiusKm: 41, phase: 300, feature: 'craters', colorA: '#c4b6a0', colorB: '#7a6d5a', shape: [1.2, 0.9, 0.9], kind: 'ring', note: 'Shepherds the outer F Ring' },
  { name: 'Epimetheus', orbitKm: 151422, radiusKm: 58, phase: 190, feature: 'craters', colorA: '#bfb29d', colorB: '#756857', shape: [1.2, 1, 0.9], kind: 'ring', note: 'Swaps orbits with Janus every four years' },
  { name: 'Janus', orbitKm: 151472, radiusKm: 89, phase: 20, feature: 'craters', colorA: '#c2b5a0', colorB: '#776a58', shape: [1.1, 0.95, 0.9], kind: 'ring', note: 'Co-orbital partner of Epimetheus' },
  // small inner moons
  { name: 'Methone', orbitKm: 194440, radiusKm: 1.6, phase: 95, feature: 'craters', colorA: '#e8e2d6', colorB: '#bdb5a6', shape: [1.5, 1, 1], kind: 'trojan', note: 'Egg-shaped and almost crater-free' },
  { name: 'Anthe', orbitKm: 197700, radiusKm: 0.5, phase: 170, feature: 'craters', colorA: '#ddd6c9', colorB: '#aaa293', kind: 'trojan' },
  { name: 'Pallene', orbitKm: 212280, radiusKm: 2.2, phase: 320, feature: 'craters', colorA: '#e2ddd2', colorB: '#b0a99b', kind: 'trojan' },
  // major moons
  { name: 'Mimas', orbitKm: 185539, radiusKm: 198, phase: 215, feature: 'mimas', colorA: '#d9d6d0', colorB: '#8e8a83', kind: 'major', note: 'Herschel crater makes it look like the Death Star' },
  { name: 'Enceladus', orbitKm: 237948, radiusKm: 252, phase: 150, feature: 'ice', colorA: '#ffffff', colorB: '#bfe3ff', kind: 'major', note: 'Ice geysers erupt from its south pole' },
  { name: 'Tethys', orbitKm: 294619, radiusKm: 531, phase: 300, feature: 'tethys', colorA: '#e9e6df', colorB: '#a9a59c', kind: 'major', note: 'Odysseus crater and the Ithaca Chasma canyon' },
  { name: 'Telesto', orbitKm: 294619, radiusKm: 12, phase: 360, feature: 'craters', colorA: '#ece8e0', colorB: '#b6b0a4', shape: [1.3, 0.9, 1], kind: 'trojan', note: 'Leads Tethys by 60°' },
  { name: 'Calypso', orbitKm: 294619, radiusKm: 10, phase: 240, feature: 'craters', colorA: '#f1eee8', colorB: '#bbb5aa', shape: [1.4, 0.9, 0.9], kind: 'trojan', note: 'Trails Tethys by 60°' },
  { name: 'Dione', orbitKm: 377396, radiusKm: 561, phase: 35, feature: 'dione', colorA: '#d9d6cf', colorB: '#8d8981', kind: 'major', note: 'Bright ice cliffs streak its trailing side' },
  { name: 'Helene', orbitKm: 377396, radiusKm: 18, phase: 95, feature: 'craters', colorA: '#e6e2da', colorB: '#a9a398', shape: [1.2, 0.95, 1], kind: 'trojan', note: 'Leads Dione by 60°' },
  { name: 'Polydeuces', orbitKm: 377396, radiusKm: 1.3, phase: 335, feature: 'craters', colorA: '#e0dbd1', colorB: '#a49e92', kind: 'trojan', note: 'Trails Dione' },
  { name: 'Rhea', orbitKm: 527108, radiusKm: 764, phase: 260, feature: 'rhea', colorA: '#d6d2ca', colorB: '#8a857d', kind: 'major', note: 'Second-largest moon, saturated with craters' },
  { name: 'Titan', orbitKm: 1221870, radiusKm: 2575, phase: 325, feature: 'titan', colorA: '#e6a24e', colorB: '#b86f2a', kind: 'major', note: 'Bigger than Mercury, with a thick orange atmosphere' },
  { name: 'Hyperion', orbitKm: 1481010, radiusKm: 135, phase: 120, feature: 'sponge', colorA: '#c8a684', colorB: '#6d5843', shape: [1.3, 1, 0.85], kind: 'major', note: 'Sponge-like and tumbling chaotically' },
  { name: 'Iapetus', orbitKm: 3560820, radiusKm: 735, phase: 160, incl: 15.5, feature: 'iapetus', colorA: '#e8e2d4', colorB: '#2a2018', kind: 'major', note: 'One side coal-black, the other snow-white' },
  { name: 'Phoebe', orbitKm: 12947780, radiusKm: 107, phase: 70, incl: 175, feature: 'dark', colorA: '#5b5650', colorB: '#2b2825', kind: 'outer', note: 'Retrograde captured object; source of the giant Phoebe ring' },
]

export const MOON_COUNT = 293
export const SWARM_COUNT = MOON_COUNT - MOONS.length

/** compress very distant orbits so Iapetus and Phoebe still fit */
export function sceneDistance(orbitKm: number) {
  const d = orbitKm / SATURN_KM
  return d <= 22 ? d : 22 + Math.pow(d - 22, 0.62)
}

/** exaggerated but order-preserving display radius */
export function sceneRadius(radiusKm: number) {
  return Math.max(0.0045, 5.5 * Math.pow(radiusKm / SATURN_KM, 0.8))
}

/** angular speed (rad/s): Kepler-style falloff, sped up enormously so you can see it */
export function angularSpeed(orbitKm: number, incl = 0) {
  const d = orbitKm / SATURN_KM
  const w = 0.022 * Math.pow(3.19 / d, 1.5)
  return incl > 90 ? -w : w
}

const _v = new THREE.Vector3()
const _incl = new THREE.Euler()

/** world-space position of a moon at time t (seconds) */
export function moonPosition(m: Moon, t: number, out = new THREE.Vector3()) {
  const d = sceneDistance(m.orbitKm)
  const a = THREE.MathUtils.degToRad(m.phase) + angularSpeed(m.orbitKm, m.incl) * t
  _v.set(Math.cos(a) * d, 0, Math.sin(a) * d)
  if (m.incl) {
    _incl.set(THREE.MathUtils.degToRad(m.incl), 0, 0)
    _v.applyEuler(_incl)
  }
  return out.copy(_v).applyEuler(SATURN_TILT)
}

export function moonByName(name: string) {
  const m = MOONS.find((x) => x.name === name)
  if (!m) throw new Error(`Unknown moon ${name}`)
  return m
}

/** shared clock so the scene, camera and flight map agree on where every moon is */
export function moonClock() {
  return typeof performance === 'undefined' ? 0 : performance.now() / 1000
}
