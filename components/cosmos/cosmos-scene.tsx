'use client'

import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { MOONS, moonByName, moonClock, moonPosition, SATURN_KM, SATURN_TILT, sceneDistance, sceneRadius, angularSpeed, SWARM_COUNT, type Moon } from '@/lib/cosmos/moons'
import { cosmos, cosmosImpulse, type DestinationId } from '@/lib/cosmos/store'
import {
  auroraFragment,
  cometFragment,
  cometVertex,
  glowFragment,
  iceFragment,
  nebulaFragment,
  nebulaVertex,
  planetFragment,
  planetVertex,
  RING_INNER,
  RING_OUTER,
  ringFragment,
  ringVertex,
  shockFragment,
  starFragment,
  starVertex,
  moonFragment,
  orbitFragment,
  orbitVertex,
  rockVertex,
  swarmFragment,
  swarmVertex,
  titanFragment,
  warpFragment,
  warpVertex,
} from './shaders'

export interface CosmosSceneProps {
  energy: number
  pulseKey: number
  animate: boolean
  fpsCap: number
}

/* ------------------------------------------------------------------ */
/* World layout                                                        */
/* ------------------------------------------------------------------ */

const SUN_WORLD = new THREE.Vector3(-1.1, 0.35, 0.9).normalize()
const WORLD_UP = new THREE.Vector3(0, 1, 0)

const local = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).applyEuler(SATURN_TILT)

/** Hover over the north pole on the day side, with the hexagon framed right of centre. */
function hexagonView() {
  const pole = local(0, 1, 0)
  const pos = pole.clone().multiplyScalar(3.4).add(SUN_WORLD.clone().multiplyScalar(1.7))
  const dir = pole.clone().sub(pos).normalize()
  const right = dir.clone().cross(new THREE.Vector3(0, 1, 0)).normalize()
  return { pos, look: pole.clone().addScaledVector(right, -0.9).add(new THREE.Vector3(0, 0.55, 0)) }
}

type View = { pos: THREE.Vector3; look: THREE.Vector3 }

/** Fixed viewpoints. Saturn's radius is 1 unit (58,232 km). */
const STATIC_VIEWS: Partial<Record<DestinationId, View>> = {
  launch: { pos: new THREE.Vector3(-14, 9, 150), look: new THREE.Vector3(0, 0, 0) },
  overview: { pos: new THREE.Vector3(-2.4, 1.1, 9.8), look: new THREE.Vector3(-3.5, -0.9, 0) },
  mining: { pos: local(0.35, 0.16, 2.95), look: local(-0.9, 0.02, 0.4) },
  diagnostics: hexagonView(),
  settings: { pos: new THREE.Vector3(5.5, -2.2, 11.5), look: new THREE.Vector3(-1.6, 2.2, 0) },
}

/**
 * Moon viewpoints follow the moon around its orbit. The camera sits `dist` moon-radii out, behind
 * the moon (Saturn in the background) and pulled toward the sun so the near side is lit. The look
 * direction is then solved so the moon lands at screen position (nx, ny) in normalised device
 * coordinates, i.e. to the right of the content column instead of under the panels.
 */
const MOON_VIEWS: Partial<Record<DestinationId, { moon: string; dist: number; nx: number; ny: number }>> = {
  wallet: { moon: 'Titan', dist: 8, nx: 0.5, ny: -0.05 },
  activity: { moon: 'Enceladus', dist: 11, nx: 0.5, ny: -0.3 },
  hardware: { moon: 'Mimas', dist: 8, nx: 0.55, ny: -0.1 },
  network: { moon: 'Iapetus', dist: 10, nx: 0.62, ny: -0.2 },
}

const _f = new THREE.Vector3()
const _r = new THREE.Vector3()
const _u = new THREE.Vector3()
const _m = new THREE.Vector3()
const _d = new THREE.Vector3()
const TAN_V = Math.tan(THREE.MathUtils.degToRad(19))

function getWaypoint(dest: DestinationId, t: number, out: View, aspect = 1.6) {
  const fixed = STATIC_VIEWS[dest]
  if (fixed) {
    out.pos.copy(fixed.pos)
    out.look.copy(fixed.look)
    return out
  }
  const v = MOON_VIEWS[dest]!
  const m = moonByName(v.moon)
  const R = sceneRadius(m.radiusKm)
  moonPosition(m, t, _m)
  _f.copy(_m).negate().normalize() // toward Saturn
  _r.crossVectors(_f, WORLD_UP).normalize()
  const s = Math.sign(_r.dot(SUN_WORLD)) || 1
  _d.copy(_f).multiplyScalar(-0.7).addScaledVector(_r, s * 0.5).addScaledVector(WORLD_UP, 0.25).addScaledVector(SUN_WORLD, 1.3).normalize()
  out.pos.copy(_m).addScaledVector(_d, v.dist * R)
  // aim so the moon appears at (nx, ny) on screen
  _f.copy(_m).sub(out.pos)
  const range = _f.length()
  _f.normalize()
  _r.crossVectors(_f, WORLD_UP).normalize()
  _u.crossVectors(_r, _f)
  _f.addScaledVector(_r, -v.nx * TAN_V * aspect).addScaledVector(_u, -v.ny * TAN_V).normalize()
  out.look.copy(out.pos).addScaledVector(_f, range)
  return out
}

/** Values shared by scene parts each frame (no React state). */
const fx = { warp: 0, flash: 0, energy: 0 }

/* ------------------------------------------------------------------ */

function FrameDriver({ animate, fpsCap }: { animate: boolean; fpsCap: number }) {
  const invalidate = useThree((s) => s.invalidate)
  useEffect(() => {
    invalidate()
    let raf = 0
    let last = 0
    let lastDest = cosmosImpulse.destination
    const interval = 1000 / fpsCap
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop)
      if (document.hidden) return
      if (!animate) {
        // static mode: only redraw when the destination changes
        if (cosmosImpulse.destination !== lastDest) {
          lastDest = cosmosImpulse.destination
          invalidate()
        }
        return
      }
      if (t - last < interval - 1) return
      last = t
      invalidate()
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [animate, fpsCap, invalidate])
  return null
}

/* ------------------------------------------------------------------ */
/* Camera: flies between waypoints, derives warp from its own speed    */
/* ------------------------------------------------------------------ */

function CameraRig({ animate }: { animate: boolean }) {
  const camera = useThree((s) => s.camera)
  const state = useMemo(
    () => ({
      pos: STATIC_VIEWS.launch!.pos.clone(),
      look: STATIC_VIEWS.launch!.look.clone(),
      prev: STATIC_VIEWS.launch!.pos.clone(),
      wp: { pos: new THREE.Vector3(), look: new THREE.Vector3() } as View,
      lastWp: { pos: new THREE.Vector3(), look: new THREE.Vector3() } as View,
      lastDest: '' as DestinationId | '',
      mouse: new THREE.Vector2(),
      mouseSmooth: new THREE.Vector2(),
      lastReport: 0,
      tmp: new THREE.Vector3(),
      right: new THREE.Vector3(),
      up: new THREE.Vector3(),
      offset: new THREE.Vector3(),
      /** drag-orbit angles: target follows the pointer, smooth chases target, both spring home on release */
      orbit: { yaw: 0, pitch: 0, yawS: 0, pitchS: 0 },
    }),
    [],
  )

  // Grab the universe: dragging empty space (not panels, text or controls) swings the camera.
  useEffect(() => {
    if (!animate) return
    const BLOCKED = '.glass, .glass-quiet, button, a, input, label, [role], aside, header, nav, p, span, h1, h2, dl, table, svg'
    const isEmpty = (el: EventTarget | null) => el instanceof Element && !el.closest(BLOCKED)
    const root = document.documentElement
    let hinting = false
    const drag = cosmosImpulse.drag
    const down = (e: PointerEvent) => {
      if (e.button !== 0 || !isEmpty(e.target)) return
      drag.active = true
      root.style.cursor = 'grabbing'
      root.style.userSelect = 'none'
    }
    const move = (e: PointerEvent) => {
      if (drag.active) {
        state.orbit.yaw = THREE.MathUtils.clamp(state.orbit.yaw - e.movementX * 0.006, -2.4, 2.4)
        state.orbit.pitch = THREE.MathUtils.clamp(state.orbit.pitch + e.movementY * 0.005, -1.0, 1.0)
        return
      }
      const empty = isEmpty(e.target)
      if (empty !== hinting) {
        hinting = empty
        root.style.cursor = empty ? 'grab' : ''
      }
    }
    const up = () => {
      if (!drag.active) return
      drag.active = false
      root.style.cursor = hinting ? 'grab' : ''
      root.style.userSelect = ''
    }
    window.addEventListener('pointerdown', down)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      window.removeEventListener('pointerdown', down)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      root.style.cursor = ''
    }
  }, [animate, state])

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      state.mouse.set((e.clientX / window.innerWidth) * 2 - 1, -((e.clientY / window.innerHeight) * 2 - 1))
    }
    window.addEventListener('pointermove', onMove)
    return () => window.removeEventListener('pointermove', onMove)
  }, [state])

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.25)
    const dest = cosmosImpulse.destination
    const wp = getWaypoint(dest, moonClock(), state.wp, (camera as THREE.PerspectiveCamera).aspect)
    const launching = cosmosImpulse.launching
    // moons keep orbiting: once parked, ride along with the moon instead of lagging behind it
    if (dest === state.lastDest) {
      state.pos.add(_m.copy(wp.pos).sub(state.lastWp.pos))
      state.look.add(_m.copy(wp.look).sub(state.lastWp.look))
    }
    state.lastDest = dest
    state.lastWp.pos.copy(wp.pos)
    state.lastWp.look.copy(wp.look)

    if (!animate) {
      state.pos.copy(wp.pos)
      state.look.copy(wp.look)
      fx.warp = 0
    } else {
      state.prev.copy(state.pos)
      const rate = launching ? 1.05 : 1.5
      const k = 1 - Math.exp(-delta * rate)
      state.pos.lerp(wp.pos, k)
      state.look.lerp(wp.look, 1 - Math.exp(-delta * (rate * 1.6)))

      // never fly through the planet: keep a safety bubble unless the waypoint is inside it
      const bubble = 2.55
      if (state.pos.length() < bubble && wp.pos.length() >= bubble - 0.5) {
        state.pos.setLength(bubble)
      }

      const speed = state.pos.distanceTo(state.prev) / Math.max(delta, 1e-4)
      if (launching && state.pos.distanceTo(wp.pos) < 0.2) cosmosImpulse.launching = false

      cosmosImpulse.warpKick *= Math.exp(-delta * 2.2)
      cosmosImpulse.shake *= Math.exp(-delta * 3.5)
      const travelWarp = Math.min(1, speed / 22)
      fx.warp += (Math.max(travelWarp, cosmosImpulse.warpKick) - fx.warp) * (1 - Math.exp(-delta * 6))

      const now = performance.now()
      if (now - state.lastReport > 140) {
        state.lastReport = now
        cosmos.report({
          altitude: Math.max(0, (state.pos.length() - 1) * SATURN_KM),
          velocity: speed * SATURN_KM,
          traveling: speed > 0.4,
          x: state.pos.x,
          z: state.pos.z,
        })
      }
    }

    state.mouseSmooth.lerp(state.mouse, 1 - Math.exp(-delta * 2.5))
    const o = state.orbit
    if (!cosmosImpulse.drag.active) {
      // springy return home once released
      o.yaw *= Math.exp(-delta * 1.6)
      o.pitch *= Math.exp(-delta * 1.6)
    }
    o.yawS += (o.yaw - o.yawS) * (1 - Math.exp(-delta * 7))
    o.pitchS += (o.pitch - o.pitchS) * (1 - Math.exp(-delta * 7))
    state.offset.copy(state.pos).sub(state.look)
    if (Math.abs(o.yawS) > 1e-4 || Math.abs(o.pitchS) > 1e-4) {
      state.offset.applyAxisAngle(WORLD_UP, o.yawS)
      state.right.crossVectors(WORLD_UP, state.offset)
      // looking almost straight down (the hexagon) leaves no stable pitch axis; skip pitch there
      if (state.right.lengthSq() > 1e-4) state.offset.applyAxisAngle(state.right.normalize(), o.pitchS)
    }
    camera.position.copy(state.look).add(state.offset)
    camera.lookAt(state.look)
    camera.updateMatrixWorld()
    // parallax + shake in camera space
    state.right.setFromMatrixColumn(camera.matrixWorld, 0)
    state.up.setFromMatrixColumn(camera.matrixWorld, 1)
    const dist = state.offset.length()
    const par = animate ? Math.min(0.5, dist * 0.035) : 0
    const sh = cosmosImpulse.shake * 0.06
    camera.position
      .addScaledVector(state.right, state.mouseSmooth.x * par + (Math.random() - 0.5) * sh)
      .addScaledVector(state.up, state.mouseSmooth.y * par * 0.6 + (Math.random() - 0.5) * sh)
    camera.lookAt(state.look)

    const fov = 38 + fx.warp * 22
    const cam = camera as THREE.PerspectiveCamera
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov = fov
      cam.updateProjectionMatrix()
    }
  })
  return null
}

/* ------------------------------------------------------------------ */
/* Bloom: the rings, aurora, warp and flashes glow like a film render   */
/* ------------------------------------------------------------------ */

function Bloom() {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  const dpr = useThree((s) => s.viewport.dpr)
  const { composer, bloom } = useMemo(() => {
    const composer = new EffectComposer(gl)
    composer.addPass(new RenderPass(scene, camera))
    // half-resolution bloom keeps the GPU free for hashing on integrated graphics
    // Bloom is the last pass and writes straight to screen. No OutputPass: the custom shaders already
    // output display-ready colour, so an extra sRGB conversion would wash everything out.
    const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.3, 0.4, 1.0)
    composer.addPass(bloom)
    return { composer, bloom }
  }, [gl, scene, camera])
  useEffect(() => {
    composer.setPixelRatio(dpr)
    composer.setSize(size.width, size.height)
    bloom.resolution.set(Math.round(size.width / 3), Math.round(size.height / 3))
  }, [composer, bloom, size, dpr])
  useEffect(() => () => composer.dispose(), [composer])
  useFrame((_, delta) => {
    // the supernova flash briefly cranks the glow
    bloom.strength = 0.3 + fx.energy * 0.2 + fx.flash * 1.6 + fx.warp * 0.3
    composer.render(delta)
  }, 1)
  return null
}

/* ------------------------------------------------------------------ */
/* Backdrop                                                            */
/* ------------------------------------------------------------------ */

function Nebula() {
  const uniforms = useMemo(() => ({ uTime: { value: 0 }, uFlash: { value: 0 } }), [])
  const mesh = useRef<THREE.Mesh>(null)
  const camera = useThree((s) => s.camera)
  useFrame((state) => {
    uniforms.uTime.value = state.clock.elapsedTime
    uniforms.uFlash.value = fx.flash
    if (mesh.current) mesh.current.position.copy(camera.position)
  })
  return (
    <mesh ref={mesh} renderOrder={-10} frustumCulled={false}>
      <sphereGeometry args={[600, 32, 20]} />
      <shaderMaterial args={[{ vertexShader: nebulaVertex, fragmentShader: nebulaFragment, uniforms: uniforms }]} side={THREE.BackSide} depthWrite={false} />
    </mesh>
  )
}

function Stars({ count = 4200 }: { count?: number }) {
  const dpr = useThree((s) => s.viewport.dpr)
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry()
    const pos = new Float32Array(count * 3)
    const size = new Float32Array(count)
    const phase = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      const r = 160 + Math.random() * 280
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta)
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta)
      pos[i * 3 + 2] = r * Math.cos(phi)
      size[i] = 0.6 + Math.random() ** 4 * 4.2
      phase[i] = Math.random()
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1))
    g.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1))
    return g
  }, [count])
  const uniforms = useMemo(() => ({ uTime: { value: 0 }, uPixelRatio: { value: 1 } }), [])
  const points = useRef<THREE.Points>(null)
  useFrame((state, delta) => {
    uniforms.uTime.value = state.clock.elapsedTime
    uniforms.uPixelRatio.value = dpr
    if (points.current) points.current.rotation.y += delta * 0.003
  })
  return (
    <points ref={points} geometry={geometry} frustumCulled={false}>
      <shaderMaterial args={[{ vertexShader: starVertex, fragmentShader: starFragment, uniforms: uniforms }]} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
    </points>
  )
}

function WarpTunnel({ count = 650 }: { count?: number }) {
  // each streak is a thin quad (4 verts) so it has real width on every GPU, unlike 1px GL lines
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry()
    const pos = new Float32Array(count * 4 * 3)
    const seed = new Float32Array(count * 4)
    const end = new Float32Array(count * 4)
    const side = new Float32Array(count * 4)
    const index: number[] = []
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2
      const r = 0.6 + Math.random() * 26
      const lineSeed = Math.random()
      for (let j = 0; j < 4; j++) {
        const k = i * 4 + j
        pos[k * 3] = Math.cos(a) * r
        pos[k * 3 + 1] = Math.sin(a) * r
        pos[k * 3 + 2] = 0
        seed[k] = lineSeed
        end[k] = j < 2 ? 0 : 1
        side[k] = j % 2 === 0 ? -1 : 1
      }
      const o = i * 4
      index.push(o, o + 1, o + 2, o + 1, o + 3, o + 2)
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1))
    g.setAttribute('aEnd', new THREE.BufferAttribute(end, 1))
    g.setAttribute('aSide', new THREE.BufferAttribute(side, 1))
    g.setIndex(index)
    return g
  }, [count])
  const uniforms = useMemo(() => ({ uTravel: { value: 0 }, uWarp: { value: 0 } }), [])
  const mesh = useRef<THREE.Mesh>(null)
  useFrame((_, delta) => {
    uniforms.uTravel.value += Math.min(delta, 0.1) * (8 + fx.warp * 140)
    uniforms.uWarp.value = fx.warp
    if (mesh.current) mesh.current.visible = fx.warp > 0.02
  })
  return (
    <mesh ref={mesh} geometry={geometry} frustumCulled={false} renderOrder={20}>
      <shaderMaterial args={[{ vertexShader: warpVertex, fragmentShader: warpFragment, uniforms: uniforms }]} transparent depthWrite={false} depthTest={false} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} />
    </mesh>
  )
}

const COMET_COLORS = [new THREE.Color('#ffe3b8'), new THREE.Color('#dfeeff'), new THREE.Color('#ffffff')]

/** One comet streak per accepted share, drawn on the sky in camera space. */
function Comets({ pool = 6 }: { pool?: number }) {
  const meshes = useRef<Array<THREE.Mesh | null>>([])
  const slots = useMemo(
    () =>
      Array.from({ length: pool }, () => ({
        life: 1,
        dur: 1.4,
        from: new THREE.Vector2(),
        dir: new THREE.Vector2(),
        uniforms: { uLife: { value: 1 }, uColor: { value: COMET_COLORS[0].clone() } },
      })),
    [pool],
  )
  const seen = useRef(cosmosImpulse.comets)
  const geometry = useMemo(() => new THREE.PlaneGeometry(1, 1), [])

  useFrame((_, delta) => {
    if (cosmosImpulse.comets !== seen.current) {
      seen.current = cosmosImpulse.comets
      const slot = slots.find((s) => s.life >= 1) ?? slots[0]
      const angle = -0.35 - Math.random() * 0.5 + (Math.random() < 0.5 ? Math.PI : 0)
      slot.dir.set(Math.cos(angle), Math.sin(angle))
      slot.from.set((Math.random() - 0.5) * 50, 8 + Math.random() * 14).addScaledVector(slot.dir, -30)
      slot.life = 0
      slot.dur = 1.1 + Math.random() * 0.8
      slot.uniforms.uColor.value.copy(COMET_COLORS[Math.floor(Math.random() * COMET_COLORS.length)])
    }
    slots.forEach((s, i) => {
      const m = meshes.current[i]
      if (!m) return
      if (s.life >= 1) {
        m.visible = false
        return
      }
      s.life = Math.min(1, s.life + delta / s.dur)
      s.uniforms.uLife.value = s.life
      const travel = s.life * 60
      const len = 14
      m.visible = true
      m.position.set(s.from.x + s.dir.x * travel, s.from.y + s.dir.y * travel, -70)
      m.rotation.set(0, 0, Math.atan2(s.dir.y, s.dir.x))
      m.scale.set(len, 0.35, 1)
      m.translateX(-len / 2)
    })
  })

  return (
    <>
      {slots.map((s, i) => (
        <mesh
          key={i}
          ref={(el) => {
            meshes.current[i] = el
          }}
          geometry={geometry}
          frustumCulled={false}
          visible={false}
          renderOrder={15}
        >
          <shaderMaterial args={[{ vertexShader: cometVertex, fragmentShader: cometFragment, uniforms: s.uniforms }]} transparent depthWrite={false} depthTest={false} blending={THREE.AdditiveBlending} />
        </mesh>
      ))}
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Saturn system                                                       */
/* ------------------------------------------------------------------ */

function RingParticles({ count = 1200 }: { count?: number }) {
  const mesh = useRef<THREE.InstancedMesh>(null)
  const geometry = useMemo(() => new THREE.IcosahedronGeometry(1, 0), [])
  useEffect(() => {
    const m = mesh.current
    if (!m) return
    const dummy = new THREE.Object3D()
    for (let i = 0; i < count; i++) {
      const r = RING_INNER + 0.05 + Math.random() * (RING_OUTER - RING_INNER - 0.05)
      const a = Math.random() * Math.PI * 2
      dummy.position.set(Math.cos(a) * r, (Math.random() - 0.5) * 0.025, Math.sin(a) * r)
      dummy.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6)
      const s = 0.0012 + Math.random() ** 8 * 0.009
      dummy.scale.set(s, s * (0.6 + Math.random() * 0.6), s)
      dummy.updateMatrix()
      m.setMatrixAt(i, dummy.matrix)
    }
    m.instanceMatrix.needsUpdate = true
  }, [count])
  useFrame((_, delta) => {
    if (mesh.current) mesh.current.rotation.y += delta * (0.012 + fx.energy * 0.05)
  })
  return (
    <instancedMesh ref={mesh} args={[geometry, undefined, count]}>
      <meshStandardMaterial color="#e9dcc4" emissive="#1a1510" roughness={1} flatShading />
    </instancedMesh>
  )
}

function Shockwave() {
  const mesh = useRef<THREE.Mesh>(null)
  const uniforms = useMemo(() => ({ uAge: { value: 10 } }), [])
  useFrame(() => {
    const age = cosmosImpulse.supernovaAt < 0 ? 10 : (performance.now() - cosmosImpulse.supernovaAt) / 1000
    uniforms.uAge.value = age
    if (mesh.current) mesh.current.visible = age < 3
  })
  return (
    <mesh ref={mesh} rotation={[-Math.PI / 2, 0, 0]} visible={false} renderOrder={5}>
      <planeGeometry args={[40, 40]} />
      <shaderMaterial args={[{ vertexShader: ringVertex, fragmentShader: shockFragment, uniforms: uniforms }]} transparent depthWrite={false} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} />
    </mesh>
  )
}

function Saturn({ energy, pulseKey }: { energy: number; pulseKey: number }) {
  const group = useRef<THREE.Group>(null)
  const planet = useRef<THREE.Mesh>(null)
  const ring = useRef<THREE.Mesh>(null)
  const energyRef = useRef(energy)
  energyRef.current = energy

  const planetUniforms = useMemo(
    () => ({ uTime: { value: 0 }, uSunLocal: { value: new THREE.Vector3() }, uSunWorld: { value: SUN_WORLD.clone() }, uEnergy: { value: 0 } }),
    [],
  )
  const auroraUniforms = useMemo(() => ({ uTime: { value: 0 }, uEnergy: { value: 0 } }), [])
  const ringUniforms = useMemo(
    () => ({ uTime: { value: 0 }, uSunLocal: { value: new THREE.Vector3() }, uEnergy: { value: 0 }, uPulse: { value: 0 }, uPulseAge: { value: 10 } }),
    [],
  )
  const glowUniforms = useMemo(() => ({ uEnergy: { value: 0 }, uFlash: { value: 0 } }), [])
  const inverse = useMemo(() => new THREE.Matrix4(), [])
  const firstPulse = useRef(true)

  useEffect(() => {
    if (firstPulse.current) {
      firstPulse.current = false
      return
    }
    ringUniforms.uPulseAge.value = 0
    ringUniforms.uPulse.value = 1
  }, [pulseKey, ringUniforms])

  useFrame((state, rawDelta) => {
    const delta = Math.min(rawDelta, 0.1)
    const t = state.clock.elapsedTime
    fx.energy += (energyRef.current - fx.energy) * Math.min(1, delta * 1.2)
    cosmosImpulse.flash *= Math.exp(-delta * 1.4)
    fx.flash = cosmosImpulse.flash
    const e = fx.energy

    if (planet.current) planet.current.rotation.y += delta * (0.025 + e * 0.08)
    if (ring.current) ring.current.rotation.z += delta * (0.006 + e * 0.03)
    if (group.current) group.current.position.y = Math.sin(t * 0.4) * 0.03

    planetUniforms.uTime.value = t
    planetUniforms.uEnergy.value = e
    auroraUniforms.uTime.value = t
    auroraUniforms.uEnergy.value = Math.min(1.4, e + fx.flash)
    ringUniforms.uTime.value = t
    ringUniforms.uEnergy.value = Math.min(1.5, e + fx.flash)
    ringUniforms.uPulseAge.value += delta
    glowUniforms.uEnergy.value = e
    glowUniforms.uFlash.value = fx.flash

    if (planet.current) {
      planet.current.updateMatrixWorld()
      inverse.copy(planet.current.matrixWorld).invert()
      planetUniforms.uSunLocal.value.copy(SUN_WORLD).transformDirection(inverse)
    }
    if (ring.current) {
      ring.current.updateMatrixWorld()
      inverse.copy(ring.current.matrixWorld).invert()
      ringUniforms.uSunLocal.value.copy(SUN_WORLD).transformDirection(inverse)
    }
  })

  return (
    <group ref={group} rotation={SATURN_TILT}>
      <mesh ref={planet}>
        <sphereGeometry args={[1, 128, 128]} />
        <shaderMaterial args={[{ vertexShader: planetVertex, fragmentShader: planetFragment, uniforms: planetUniforms }]} />
      </mesh>
      <mesh scale={1.035}>
        <sphereGeometry args={[1, 96, 64]} />
        <shaderMaterial args={[{ vertexShader: planetVertex, fragmentShader: auroraFragment, uniforms: auroraUniforms }]} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
      <mesh scale={1.14}>
        <sphereGeometry args={[1, 64, 64]} />
        <shaderMaterial args={[{ vertexShader: planetVertex, fragmentShader: glowFragment, uniforms: glowUniforms }]} side={THREE.BackSide} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[RING_INNER, RING_OUTER, 256, 1]} />
        <shaderMaterial args={[{ vertexShader: ringVertex, fragmentShader: ringFragment, uniforms: ringUniforms }]} side={THREE.DoubleSide} transparent depthWrite={false} />
      </mesh>
      <RingParticles />
      <Shockwave />
    </group>
  )
}

const FEATURE_ID: Record<string, number> = { craters: 0, mimas: 1, iapetus: 2, sponge: 3, tethys: 4, dione: 5, rhea: 6, dark: 7 }

/** Places a moon on its orbit every frame and keeps one face toward Saturn (tidal locking). */
function useOrbit(m: Moon) {
  const ref = useRef<THREE.Group>(null)
  useFrame(() => {
    const g = ref.current
    if (!g) return
    moonPosition(m, moonClock(), g.position)
    g.lookAt(0, 0, 0)
  })
  return ref
}

function RockyMoon({ m, index }: { m: Moon; index: number }) {
  const ref = useOrbit(m)
  const R = sceneRadius(m.radiusKm)
  const small = m.kind !== 'major' || m.feature === 'sponge'
  const uniforms = useMemo(
    () => ({
      uSunWorld: { value: SUN_WORLD.clone() },
      uColorA: { value: new THREE.Color(m.colorA) },
      uColorB: { value: new THREE.Color(m.colorB) },
      uFeature: { value: FEATURE_ID[m.feature] ?? 0 },
      uSeed: { value: index * 7.13 },
      uBump: { value: small ? 0.45 : 0.03 },
    }),
    [m, index, small],
  )
  const shape = m.shape ?? [1, 1, 1]
  return (
    <group ref={ref}>
      <mesh scale={[R * shape[0], R * shape[1], R * shape[2]]}>
        <sphereGeometry args={[1, small ? 32 : 64, small ? 24 : 48]} />
        <shaderMaterial args={[{ vertexShader: rockVertex, fragmentShader: moonFragment, uniforms }]} />
      </mesh>
    </group>
  )
}

function Titan() {
  const m = moonByName('Titan')
  const ref = useOrbit(m)
  const R = sceneRadius(m.radiusKm)
  const uniforms = useMemo(() => ({ uTime: { value: 0 }, uSunWorld: { value: SUN_WORLD.clone() } }), [])
  const haze = useMemo(() => ({ uEnergy: { value: 0.4 }, uFlash: { value: 0 } }), [])
  useFrame((state) => {
    uniforms.uTime.value = state.clock.elapsedTime
  })
  return (
    <group ref={ref}>
      <mesh scale={R}>
        <sphereGeometry args={[1, 96, 96]} />
        <shaderMaterial args={[{ vertexShader: planetVertex, fragmentShader: titanFragment, uniforms: uniforms }]} />
      </mesh>
      <mesh scale={R * 1.12}>
        <sphereGeometry args={[1, 48, 48]} />
        <shaderMaterial args={[{ vertexShader: planetVertex, fragmentShader: glowFragment, uniforms: haze }]} side={THREE.BackSide} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
    </group>
  )
}

/** Faint orbit tracks for the major moons, in Saturn's ring plane (Iapetus and Phoebe tilted). */
function OrbitTracks() {
  const tracks = useMemo(
    () =>
      MOONS.filter((m) => m.kind === 'major' || m.kind === 'outer').map((m) => {
        const d = sceneDistance(m.orbitKm)
        const pts: THREE.Vector3[] = []
        for (let i = 0; i <= 256; i++) {
          const a = (i / 256) * Math.PI * 2
          pts.push(new THREE.Vector3(Math.cos(a) * d, 0, Math.sin(a) * d))
        }
        const g = new THREE.BufferGeometry().setFromPoints(pts)
        const uniforms = { uOpacity: { value: m.kind === 'outer' ? 0.035 : m.name === 'Titan' ? 0.09 : 0.06 } }
        return { m, g, uniforms }
      }),
    [],
  )
  return (
    <group rotation={SATURN_TILT}>
      {tracks.map(({ m, g, uniforms }) => (
        <group key={m.name} rotation={[THREE.MathUtils.degToRad(m.incl ?? 0), 0, 0]}>
          <lineLoop geometry={g}>
            <shaderMaterial args={[{ vertexShader: orbitVertex, fragmentShader: orbitFragment, uniforms }]} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
          </lineLoop>
        </group>
      ))}
    </group>
  )
}

/** The ~270 small irregular moons: distant, tilted, mostly retrograde orbits. */
function IrregularSwarm({ count = SWARM_COUNT }: { count?: number }) {
  const dpr = useThree((s) => s.viewport.dpr)
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry()
    const pos = new Float32Array(count * 3)
    const orb = new Float32Array(count * 4)
    const w = new Float32Array(count)
    const size = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      const retro = Math.random() < 0.8
      // real irregulars sit 11–30 million km out; compress the same way as Phoebe
      const km = 1.1e7 + Math.random() * 1.9e7
      const r = sceneDistance(km) * (0.92 + Math.random() * 0.16)
      const incl = retro ? THREE.MathUtils.degToRad(140 + Math.random() * 40) : THREE.MathUtils.degToRad(30 + Math.random() * 25)
      orb.set([r, incl, Math.random() * Math.PI * 2, Math.random() * Math.PI * 2], i * 4)
      w[i] = Math.abs(angularSpeed(km)) * (retro ? -1 : 1)
      size[i] = 0.6 + Math.random() ** 3 * 1.6
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('aOrb', new THREE.BufferAttribute(orb, 4))
    g.setAttribute('aW', new THREE.BufferAttribute(w, 1))
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1))
    return g
  }, [count])
  const uniforms = useMemo(() => ({ uTime: { value: 0 }, uPixelRatio: { value: 1 } }), [])
  useFrame(() => {
    uniforms.uTime.value = moonClock()
    uniforms.uPixelRatio.value = dpr
  })
  return (
    <group rotation={SATURN_TILT}>
      <points geometry={geometry} frustumCulled={false}>
        <shaderMaterial args={[{ vertexShader: swarmVertex, fragmentShader: swarmFragment, uniforms }]} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
      </points>
    </group>
  )
}

function Moons() {
  return (
    <>
      <OrbitTracks />
      {MOONS.map((m, i) => {
        if (m.name === 'Titan') return <Titan key={m.name} />
        if (m.name === 'Enceladus') return <Enceladus key={m.name} />
        return <RockyMoon key={m.name} m={m} index={i} />
      })}
      <IrregularSwarm />
    </>
  )
}

const plumeVertex = /* glsl */ `
attribute float aSeed;
uniform float uTime;
uniform float uPixelRatio;
varying float vA;
void main() {
  float life = fract(aSeed * 7.31 + uTime * (0.08 + fract(aSeed * 3.7) * 0.06));
  vec3 dir = normalize(position);
  vec3 p = vec3(0.0, -1.0, 0.0) + dir * life * 3.2 + vec3(0.0, -life * life * 1.5, 0.0);
  vA = (1.0 - life) * smoothstep(0.0, 0.08, life);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = (2.0 + fract(aSeed * 11.0) * 3.0) * uPixelRatio * (6.0 / -mv.z);
  gl_Position = projectionMatrix * mv;
}
`
const plumeFragment = /* glsl */ `
varying float vA;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = (1.0 - smoothstep(0.0, 0.5, d)) * vA * 0.5;
  gl_FragColor = vec4(vec3(0.7, 0.9, 1.0) * a, a);
}
`

function Enceladus() {
  const m = moonByName('Enceladus')
  const ref = useOrbit(m)
  const R = sceneRadius(m.radiusKm)
  const uniforms = useMemo(() => ({ uSunWorld: { value: SUN_WORLD.clone() } }), [])
  const dpr = useThree((s) => s.viewport.dpr)
  const plumeUniforms = useMemo(() => ({ uTime: { value: 0 }, uPixelRatio: { value: 1 } }), [])
  const plume = useMemo(() => {
    const n = 900
    const g = new THREE.BufferGeometry()
    const pos = new Float32Array(n * 3)
    const seed = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2
      const spread = Math.random() * 0.45
      pos[i * 3] = Math.cos(a) * spread
      pos[i * 3 + 1] = -1
      pos[i * 3 + 2] = Math.sin(a) * spread
      seed[i] = Math.random()
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1))
    return g
  }, [])
  useFrame((state) => {
    plumeUniforms.uTime.value = state.clock.elapsedTime
    plumeUniforms.uPixelRatio.value = dpr
  })
  return (
    <group ref={ref}>
     <group scale={R}>
      <mesh>
        <sphereGeometry args={[1, 64, 64]} />
        <shaderMaterial args={[{ vertexShader: planetVertex, fragmentShader: iceFragment, uniforms: uniforms }]} />
      </mesh>
      <points geometry={plume} frustumCulled={false}>
        <shaderMaterial args={[{ vertexShader: plumeVertex, fragmentShader: plumeFragment, uniforms: plumeUniforms }]} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
      </points>
     </group>
    </group>
  )
}

export default function CosmosScene({ energy, pulseKey, animate, fpsCap }: CosmosSceneProps) {
  return (
    <Canvas
      frameloop="demand"
      dpr={[1, 1.5]}
      camera={{ position: STATIC_VIEWS.launch!.pos.toArray(), fov: 38, near: 0.002, far: 2000 }}
      gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
      // custom shaders output display-ready colour; keep three from tone-mapping or re-encoding it
      // (otherwise the bloom pass's final copy would wash the planet out)
      flat
      linear
      aria-hidden="true"
    >
      <color attach="background" args={['#020308']} />
      <FrameDriver animate={animate} fpsCap={fpsCap} />
      <CameraRig animate={animate} />
      {animate && <Bloom />}
      <ambientLight intensity={0.05} />
      <directionalLight position={SUN_WORLD.clone().multiplyScalar(30)} intensity={2.0} color="#fff3dc" />
      <Nebula />
      <Stars />
      <Saturn energy={energy} pulseKey={pulseKey} />
      <Moons />
      <Comets />
      <WarpTunnel />
    </Canvas>
  )
}
