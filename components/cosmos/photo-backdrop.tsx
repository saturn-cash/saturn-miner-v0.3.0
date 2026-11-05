'use client'

import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { cosmosImpulse, type DestinationId } from '@/lib/cosmos/store'

/**
 * Real Saturn: photos taken by NASA's Cassini spacecraft (public domain, NASA/JPL-Caltech/Space
 * Science Institute), drawn as the backdrop of the 3D scene so the stars, comets, warp streaks and
 * the supernova all still play around them.
 *
 *   cassini-portrait.jpg  PIA06193 "The Greatest Saturn Portrait …Yet" (6 Oct 2004)
 *   cassini-eclipse.jpg   PIA17172 "The Day the Earth Smiled" (19 Jul 2013), Saturn backlit by the Sun
 *
 * Every destination frames a part of a photo. Flying between two framings of the same photo pans
 * and zooms across it; switching photos cross-fades with a push-in. The photo also breathes very
 * slowly and leans away from the mouse. Space in the photos is see-through, so the live stars show
 * there; the planet itself hides the stars behind it.
 */

type Photo = 'portrait' | 'eclipse'

const PHOTOS: Record<Photo, { src: string; aspect: number; body: [number, number, number, number] }> = {
  // body: the planet's disc in image coordinates (centre x, y from the top, radius x, radius y)
  portrait: { src: '/saturn/cassini-portrait.jpg', aspect: 1920 / 981, body: [0.495, 0.51, 0.177, 0.346] },
  eclipse: { src: '/saturn/cassini-eclipse.jpg', aspect: 1920 / 800, body: [0.511, 0.541, 0.098, 0.235] },
}

/** Put image point (ix, iy) at screen point (sx, sy) (both from the top-left), the photo `h` screens tall. */
type Frame = { photo: Photo; ix: number; iy: number; sx: number; sy: number; h: number }

const FRAMES: Record<DestinationId, Frame> = {
  launch: { photo: 'eclipse', ix: 0.511, iy: 0.541, sx: 0.5, sy: 0.5, h: 1.25 },
  overview: { photo: 'portrait', ix: 0.495, iy: 0.5, sx: 0.71, sy: 0.43, h: 1.0 },
  mining: { photo: 'eclipse', ix: 0.511, iy: 0.541, sx: 0.72, sy: 0.42, h: 1.55 },
  wallet: { photo: 'portrait', ix: 0.2, iy: 0.47, sx: 0.74, sy: 0.46, h: 2.3 },
  activity: { photo: 'portrait', ix: 0.8, iy: 0.47, sx: 0.66, sy: 0.55, h: 2.1 },
  network: { photo: 'eclipse', ix: 0.3, iy: 0.53, sx: 0.72, sy: 0.5, h: 2.1 },
  hardware: { photo: 'eclipse', ix: 0.53, iy: 0.62, sx: 0.78, sy: 0.55, h: 2.6 },
  diagnostics: { photo: 'portrait', ix: 0.57, iy: 0.3, sx: 0.7, sy: 0.3, h: 2.4 },
  settings: { photo: 'eclipse', ix: 0.511, iy: 0.541, sx: 0.64, sy: 0.5, h: 1.05 },
}

const vertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

const fragment = /* glsl */ `
uniform sampler2D uTexA;
uniform sampler2D uTexB;
uniform vec4 uFrameA;   // ix, iy, sx, sy
uniform vec2 uScaleA;   // h, image aspect
uniform vec4 uBodyA;
uniform vec4 uFrameB;
uniform vec2 uScaleB;
uniform vec4 uBodyB;
uniform float uMix;
uniform vec2 uRes;
uniform float uPulse;
uniform float uFlash;
varying vec2 vUv;

vec4 photo(sampler2D tex, vec4 frame, vec2 sc, vec4 body, vec2 uv) {
  float sa = uRes.x / uRes.y;
  vec2 d = uv - frame.zw;
  vec2 iuv = frame.xy + vec2(d.x * sa / sc.y, d.y) / sc.x;
  if (iuv.x < 0.0 || iuv.x > 1.0 || iuv.y < 0.0 || iuv.y > 1.0) return vec4(0.0);
  vec3 c = texture2D(tex, vec2(iuv.x, 1.0 - iuv.y)).rgb;
  // fade out toward the photo's edges so its border never shows
  float edge = smoothstep(0.0, 0.05, iuv.x) * smoothstep(0.0, 0.05, 1.0 - iuv.x) * smoothstep(0.0, 0.05, iuv.y) * smoothstep(0.0, 0.05, 1.0 - iuv.y);
  c *= edge;
  // space is see-through (the live stars show there); the planet, even its night side, is solid
  float lum = dot(c, vec3(0.299, 0.587, 0.114));
  float inBody = 1.0 - smoothstep(0.97, 1.0, length((iuv - body.xy) / body.zw));
  float a = max(smoothstep(0.025, 0.11, lum), inBody * edge);
  return vec4(c, a);
}

void main() {
  vec2 uv = vec2(vUv.x, 1.0 - vUv.y);
  vec4 a = photo(uTexA, uFrameA, uScaleA, uBodyA, uv);
  vec4 b = uMix > 0.0 ? photo(uTexB, uFrameB, uScaleB, uBodyB, uv) : vec4(0.0);
  vec4 c = mix(a, b, uMix);
  // a share makes the planet glint; the supernova floods it with warm light
  vec3 col = c.rgb * (0.94 + uPulse * 0.08) + vec3(1.0, 0.85, 0.6) * uFlash * 0.35 * c.a;
  gl_FragColor = vec4(col, c.a);
}
`

const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2)
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

export function PhotoBackdrop({ pulseKey, flash }: { pulseKey: number; flash: { current: number } }) {
  const invalidate = useThree((s) => s.invalidate)
  const size = useThree((s) => s.size)
  const textures = useMemo(() => {
    const loader = new THREE.TextureLoader()
    const out = {} as Record<Photo, THREE.Texture>
    for (const [k, p] of Object.entries(PHOTOS) as [Photo, (typeof PHOTOS)[Photo]][]) {
      const t = loader.load(p.src, () => invalidate())
      t.minFilter = THREE.LinearMipmapLinearFilter
      t.magFilter = THREE.LinearFilter
      t.anisotropy = 4
      out[k] = t
    }
    return out
  }, [invalidate])
  useEffect(() => () => Object.values(textures).forEach((t) => t.dispose()), [textures])

  const uniforms = useMemo(
    () => ({
      uTexA: { value: textures.eclipse },
      uTexB: { value: textures.eclipse },
      uFrameA: { value: new THREE.Vector4() },
      uScaleA: { value: new THREE.Vector2(1, 1) },
      uBodyA: { value: new THREE.Vector4() },
      uFrameB: { value: new THREE.Vector4() },
      uScaleB: { value: new THREE.Vector2(1, 1) },
      uBodyB: { value: new THREE.Vector4() },
      uMix: { value: 0 },
      uRes: { value: new THREE.Vector2(1, 1) },
      uPulse: { value: 0 },
      uFlash: { value: 0 },
    }),
    [textures],
  )

  // the framing on screen now, where it's heading, and when the move started
  const anim = useRef({ from: { ...FRAMES.launch }, to: { ...FRAMES.launch }, start: -1, dest: 'launch' as DestinationId })
  const pointer = useRef({ x: 0, y: 0, sx: 0, sy: 0 })
  const pulse = useRef(0)
  const first = useRef(true)

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      pointer.current.x = e.clientX / window.innerWidth - 0.5
      pointer.current.y = e.clientY / window.innerHeight - 0.5
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => window.removeEventListener('pointermove', onMove)
  }, [])

  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    pulse.current = 1
  }, [pulseKey])

  useFrame((state, rawDelta) => {
    const delta = Math.min(rawDelta, 0.1)
    const t = state.clock.elapsedTime
    const a = anim.current
    const dest = cosmosImpulse.destination
    if (dest !== a.dest) {
      // start from wherever the photo is right now
      a.from = current(a, t)
      a.to = { ...FRAMES[dest] }
      a.start = t
      a.dest = dest
    }
    const samePhoto = a.from.photo === a.to.photo
    const dur = samePhoto ? 1.8 : 1.6
    const k = a.start < 0 ? 1 : Math.min(1, (t - a.start) / dur)
    const e = easeInOut(k)

    const p = pointer.current
    p.sx += (p.x - p.sx) * Math.min(1, delta * 2)
    p.sy += (p.y - p.sy) * Math.min(1, delta * 2)
    // breathing and parallax
    const breathe = 1 + 0.025 * Math.sin(t * 0.07)
    const px = -p.sx * 0.012
    const py = -p.sy * 0.008

    const set = (f: Frame, frame: THREE.Vector4, scale: THREE.Vector2, body: THREE.Vector4, zoom: number) => {
      frame.set(f.ix, f.iy, f.sx + px, f.sy + py)
      scale.set(f.h * breathe * zoom, PHOTOS[f.photo].aspect)
      const b = PHOTOS[f.photo].body
      body.set(b[0], b[1], b[2], b[3])
    }
    if (samePhoto || k >= 1) {
      const f = k >= 1 ? a.to : current(a, t)
      uniforms.uTexA.value = textures[f.photo]
      set(f, uniforms.uFrameA.value, uniforms.uScaleA.value, uniforms.uBodyA.value, 1)
      uniforms.uMix.value = 0
    } else {
      // outgoing photo pushes in and fades; the new one settles in from slightly further out
      uniforms.uTexA.value = textures[a.from.photo]
      set(a.from, uniforms.uFrameA.value, uniforms.uScaleA.value, uniforms.uBodyA.value, 1 + e * 0.35)
      uniforms.uTexB.value = textures[a.to.photo]
      set(a.to, uniforms.uFrameB.value, uniforms.uScaleB.value, uniforms.uBodyB.value, 0.88 + e * 0.12)
      uniforms.uMix.value = e
    }
    uniforms.uRes.value.set(size.width, size.height)
    pulse.current *= Math.exp(-delta * 4)
    uniforms.uPulse.value = pulse.current
    uniforms.uFlash.value = flash.current
  })

  return (
    <mesh frustumCulled={false} renderOrder={1}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        args={[{ vertexShader: vertex, fragmentShader: fragment, uniforms }]}
        transparent
        depthTest={false}
        depthWrite={false}
        blending={THREE.CustomBlending}
        blendSrc={THREE.OneFactor}
        blendDst={THREE.OneMinusSrcAlphaFactor}
      />
    </mesh>
  )
}

/** The framing at time t of a move between two framings of the same photo. */
function current(a: { from: Frame; to: Frame; start: number }, t: number): Frame {
  if (a.start < 0) return { ...a.to }
  const k = easeInOut(Math.min(1, (t - a.start) / 1.8))
  if (a.from.photo !== a.to.photo) return k < 0.5 ? { ...a.from } : { ...a.to }
  return {
    photo: a.to.photo,
    ix: lerp(a.from.ix, a.to.ix, k),
    iy: lerp(a.from.iy, a.to.iy, k),
    sx: lerp(a.from.sx, a.to.sx, k),
    sy: lerp(a.from.sy, a.to.sy, k),
    h: lerp(a.from.h, a.to.h, k),
  }
}
