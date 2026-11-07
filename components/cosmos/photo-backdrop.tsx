'use client'

import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { cosmosImpulse, type DestinationId } from '@/lib/cosmos/store'

/**
 * Real Saturn: one continuous world built on photos taken by NASA's Cassini spacecraft (public
 * domain, NASA/JPL-Caltech/Space Science Institute), upscaled 4x, with the life of the old 3D scene
 * painted onto them live:
 *
 *   - every screen is a viewpoint on "The Day the Earth Smiled" (PIA17172): Saturn backlit by the
 *     Sun, the whole ring system lit up; flying between screens glides and pulls back across it
 *   - ring particles orbit and glint along the real rings (inner ones faster, like real orbits)
 *   - the rings warm up with your hashrate, an aurora wakes over the north pole, the lit limb glows
 *   - every accepted share sends a bright wave out through the rings
 *   - the haze of the outer rings breathes with your hashrate; a soft sun flare sits off to the right
 *   - finding a block (and the arrival after launch) sets the rings and the lit rim ablaze
 * The live stars, comets, warp streaks and supernova of the 3D scene play around all of it; space in
 * the photos is see-through and the planet hides the stars behind it.
 */

type PhotoInfo = { src: string; hi: string; px: [number, number]; body: [number, number, number, number] }

const ECLIPSE: PhotoInfo = {
  src: '/saturn/cassini-eclipse.jpg',
  hi: '/saturn/cassini-eclipse-4x.jpg',
  px: [1920, 800],
  // planet disc in image coordinates (centre x, y from the top, radius x, radius y)
  body: [0.513, 0.54, 0.099, 0.219],
}
// the main rings: an ellipse fitted to the photo (pixels of the 1920 x 800 original)
const RING = { cx: 985, cy: 425, a: 442, b: 135 }

/** Put image point (ix, iy) at screen point (sx, sy) (both from the top-left), the photo `h` screens tall. */
type Frame = { ix: number; iy: number; sx: number; sy: number; h: number }

/*
 * The viewpoints were composed on the old portrait photo; carry each one over to the same spot on the
 * eclipse photo's rings (ring-relative position, and the same ring size on screen).
 */
const OLD_RING = { cx: 949 / 1920, cy: 481 / 981, a: 778 / 1920, b: 200 / 981, aspect: 1920 / 981 }
const NEW_RING = { cx: RING.cx / 1920, cy: RING.cy / 800, a: RING.a / 1920, b: RING.b / 800, aspect: 1920 / 800 }
const ZOOM = (OLD_RING.a * OLD_RING.aspect) / (NEW_RING.a * NEW_RING.aspect)
const carry = (f: Frame): Frame => ({
  ix: NEW_RING.cx + ((f.ix - OLD_RING.cx) * NEW_RING.a) / OLD_RING.a,
  iy: NEW_RING.cy + ((f.iy - OLD_RING.cy) * NEW_RING.b) / OLD_RING.b,
  sx: f.sx,
  sy: f.sy,
  h: f.h * ZOOM,
})

const PORTRAIT_FRAMES: Record<DestinationId, Frame> = {
  launch: { ix: 0.495, iy: 0.49, sx: 0.6, sy: 0.5, h: 0.75 },
  overview: { ix: 0.495, iy: 0.5, sx: 0.71, sy: 0.43, h: 1.0 },
  mining: { ix: 0.74, iy: 0.5, sx: 0.72, sy: 0.48, h: 2.4 },
  hardware: { ix: 0.62, iy: 0.62, sx: 0.75, sy: 0.55, h: 2.8 },
  wallet: { ix: 0.2, iy: 0.49, sx: 0.74, sy: 0.47, h: 2.3 },
  network: { ix: 0.5, iy: 0.5, sx: 0.62, sy: 0.5, h: 0.82 },
  activity: { ix: 0.5, iy: 0.68, sx: 0.66, sy: 0.55, h: 2.2 },
  diagnostics: { ix: 0.56, iy: 0.22, sx: 0.7, sy: 0.42, h: 2.2 },
  settings: { ix: 0.36, iy: 0.46, sx: 0.7, sy: 0.5, h: 1.45 },
}
const FRAMES = Object.fromEntries(Object.entries(PORTRAIT_FRAMES).map(([k, f]) => [k, carry(f)])) as Record<DestinationId, Frame>
// the whole-planet views pull back a little further, so the blue halo of the outer rings shows too
Object.assign(FRAMES, {
  launch: { ix: 0.513, iy: 0.53, sx: 0.6, sy: 0.48, h: 0.66 },
  overview: { ix: 0.513, iy: 0.53, sx: 0.64, sy: 0.36, h: 0.7 },
  network: { ix: 0.513, iy: 0.53, sx: 0.62, sy: 0.48, h: 0.64 },
})

const vertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

const fragment = /* glsl */ `
uniform sampler2D uEclipse;
uniform vec4 uFrame;     // ix, iy, sx, sy
uniform float uH;        // photo height in screens
uniform vec4 uBody;
uniform float uBlaze;    // 0..1: just found a block, or just arrived after launch
uniform vec2 uRes;
uniform vec2 uPointer;
uniform float uTime;
uniform float uEnergy;
uniform float uPulseAge;
uniform float uFlash;
varying vec2 vUv;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

// where a screen point lands on the photo, for a framing; outside 0..1 means off the photo
vec2 toImage(vec2 uv, vec4 frame, float h, float aspect) {
  float sa = uRes.x / uRes.y;
  vec2 d = uv - frame.zw;
  return frame.xy + vec2(d.x * sa / aspect, d.y) / h;
}
float edgeFade(vec2 iuv) {
  return smoothstep(0.0, 0.06, iuv.x) * smoothstep(0.0, 0.06, 1.0 - iuv.x) * smoothstep(0.0, 0.06, iuv.y) * smoothstep(0.0, 0.06, 1.0 - iuv.y);
}

// Saturn backlit by the Sun, alive
vec4 world(vec2 uv) {
  vec2 iuv = toImage(uv, uFrame, uH, ${(ECLIPSE.px[0] / ECLIPSE.px[1]).toFixed(5)});
  if (iuv.x < 0.0 || iuv.x > 1.0 || iuv.y < 0.0 || iuv.y > 1.0) return vec4(0.0);
  vec2 bq = (iuv - uBody.xy) / uBody.zw;
  float br = length(bq);
  float onBody = 1.0 - smoothstep(0.97, 1.0, br);
  // the night side's faint cloud bands drift: a tiny flowing shear inside the disc
  vec2 s = iuv;
  s.x += onBody * 0.0007 * sin(iuv.y * 90.0 + uTime * 0.12) * (1.0 - br * br);
  vec3 c = texture2D(uEclipse, vec2(s.x, 1.0 - s.y)).rgb;
  float edge = edgeFade(iuv);
  c *= edge;

  // ring coordinates: the ellipse fitted to the real rings
  vec2 q = iuv * vec2(${ECLIPSE.px[0]}.0, ${ECLIPSE.px[1]}.0) - vec2(${RING.cx}.0, ${RING.cy}.0);
  vec2 e = q / vec2(${RING.a}.0, ${RING.b}.0);
  float rr = length(e);
  float th = atan(e.y, e.x);
  float zone = smoothstep(0.44, 0.48, rr) * (1.0 - smoothstep(0.985, 1.01, rr));
  zone *= 1.0 - onBody * step(q.y, 0.0); // the far half of the rings is behind the planet
  float ringVis = zone * smoothstep(0.06, 0.28, lum(c));
  // the blue haze of the faint outer rings (E and G), well outside the main ones
  float haze = smoothstep(1.05, 1.25, rr) * (1.0 - smoothstep(1.6, 2.1, rr)) * (1.0 - onBody);

  // hashrate warms the rings and makes the outer haze breathe
  c += c * ringVis * uEnergy * vec3(0.32, 0.24, 0.12);
  float breath = 0.5 + 0.5 * sin(uTime * 0.35 - rr * 3.0);
  c += c * haze * (0.06 + 0.22 * uEnergy) * breath * vec3(0.8, 0.9, 1.15);

  // spokes: broad, faint patterns that sweep around the rings, inner ones faster (Kepler)
  float kep = 0.045 * pow(max(rr, 0.5), -1.5);
  float spokes = noise(vec2(th * 5.0 + uTime * kep * 6.2831853, rr * 7.0)) * noise(vec2(th * 11.0 + uTime * kep * 6.2831853 * 1.3, rr * 15.0 + 3.0));
  c += c * ringVis * (spokes - 0.25) * (0.22 + 0.25 * uEnergy);

  // glints: ring particles catching the sunlight, a brief flash each, more of them as you hash
  vec2 gq = q / 3.0;
  vec2 cellId = floor(gq);
  float hcell = hash(cellId);
  float phase = fract(uTime * (0.25 + hcell * 0.5) + hcell * 7.31);
  float flashOn = smoothstep(0.0, 0.08, phase) * (1.0 - smoothstep(0.08, 0.35, phase));
  vec2 fr = fract(gq) - 0.5;
  float shape = exp(-dot(fr, fr) * 40.0);
  float glint = step(0.955 - uEnergy * 0.03, hcell) * flashOn * shape;
  c += vec3(1.0, 0.95, 0.84) * glint * ringVis * (0.6 + 0.8 * uEnergy);

  // a share sends a bright wave out through the rings and on into the haze
  float wr = 0.48 + uPulseAge * 0.75;
  float wave = exp(-pow((rr - wr) / 0.03, 2.0)) * max(0.0, 1.0 - uPulseAge / 1.1);
  c += vec3(1.0, 0.82, 0.5) * wave * ringVis * 0.75 + vec3(0.6, 0.75, 1.0) * wave * haze * 0.12;

  // a block (or the arrival after launch): the rings and the outer haze flare up
  c += c * (ringVis * 0.9 + haze * 0.7) * uBlaze * (0.85 + 0.15 * sin(uTime * 2.0 + rr * 9.0));

  // aurora over the north pole, waking with the hashrate
  vec2 pole = (iuv - vec2(uBody.x, uBody.y - uBody.w * 0.97)) * vec2(${ECLIPSE.px[0]}.0, ${ECLIPSE.px[1]}.0) / 190.0;
  float curtain = noise(vec2(pole.x * 6.0 + uTime * 0.25, uTime * 0.15)) * noise(vec2(pole.x * 13.0 - uTime * 0.4, 1.7));
  float aur = exp(-pole.x * pole.x * 3.5) * exp(-pow((pole.y + 0.08) / 0.07, 2.0)) * (0.35 + curtain * 1.4);
  vec3 aurora = mix(vec3(0.15, 1.0, 0.55), vec3(0.35, 0.6, 1.0), smoothstep(-0.2, 0.2, pole.x)) * aur * (0.08 + uEnergy * 0.55 + uFlash * 0.6);

  // the sunlit rim glows all the way round (the Sun is right behind the planet), more with energy
  float limb = smoothstep(1.05, 0.995, br) * smoothstep(0.9, 0.995, br) * (0.75 + 0.25 * smoothstep(-0.6, 0.6, -bq.y));
  vec3 glow = vec3(1.0, 0.9, 0.72) * limb * (0.08 + 0.18 * uEnergy + 0.5 * uBlaze);

  float a = max(smoothstep(0.025, 0.11, lum(c)), onBody * edge);
  return vec4(c + (aurora + glow) * edge, a);
}

void main() {
  vec2 uv = vec2(vUv.x, 1.0 - vUv.y);
  vec4 c = world(uv);

  // a soft sun flare off to the right
  float sa = uRes.x / uRes.y;
  vec2 fp = vec2(1.02, 0.16) + uPointer * vec2(-0.03, -0.02);
  vec2 d = (uv - fp) * vec2(sa, 1.0);
  float flare = exp(-dot(d, d) * 9.0) * 0.18 + exp(-abs(d.y) * 160.0) * exp(-abs(d.x) * 1.4) * 0.12;
  vec3 sun = vec3(1.0, 0.88, 0.7) * flare * (0.6 + 0.4 * uEnergy + uFlash * 2.0);

  vec3 col = c.rgb + vec3(1.0, 0.85, 0.6) * uFlash * 0.3 * c.a + sun;
  gl_FragColor = vec4(col, c.a);
}
`

const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2)
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

function loadTexture(info: PhotoInfo, hi: boolean, onLoad: () => void) {
  const loader = new THREE.TextureLoader()
  const tex = loader.load(info.src, onLoad)
  const prep = (t: THREE.Texture) => {
    t.minFilter = THREE.LinearMipmapLinearFilter
    t.magFilter = THREE.LinearFilter
    t.anisotropy = 8
  }
  prep(tex)
  // the 4x version replaces it once it has arrived (the small one shows immediately)
  if (hi) {
    loader.load(info.hi, (big) => {
      prep(big)
      tex.image = big.image
      tex.needsUpdate = true
      onLoad()
    })
  }
  return tex
}

export function PhotoBackdrop({ pulseKey, flash, energy }: { pulseKey: number; flash: { current: number }; energy: { current: number } }) {
  const invalidate = useThree((s) => s.invalidate)
  const gl = useThree((s) => s.gl)
  const size = useThree((s) => s.size)
  const textures = useMemo(() => {
    // 7680-pixel textures need a GPU that takes 8192; older ones keep the 1920 originals
    const hi = gl.capabilities.maxTextureSize >= 8192
    return { eclipse: loadTexture(ECLIPSE, hi, invalidate) }
  }, [gl, invalidate])
  useEffect(() => () => Object.values(textures).forEach((t) => t.dispose()), [textures])

  const uniforms = useMemo(
    () => ({
      uEclipse: { value: textures.eclipse },
      uFrame: { value: new THREE.Vector4() },
      uH: { value: 1 },
      uBody: { value: new THREE.Vector4(...ECLIPSE.body) },
      uBlaze: { value: 1 },
      uRes: { value: new THREE.Vector2(1, 1) },
      uPointer: { value: new THREE.Vector2() },
      uTime: { value: 0 },
      uEnergy: { value: 0 },
      uPulseAge: { value: 10 },
      uFlash: { value: 0 },
    }),
    [textures],
  )

  const anim = useRef({ from: { ...FRAMES.launch }, to: { ...FRAMES.launch }, start: -1, dur: 2, dest: 'launch' as DestinationId, arrivedAt: -1 })
  const pointer = useRef({ x: 0, y: 0, sx: 0, sy: 0 })
  const pulseStart = useRef(-10)
  const first = useRef(true)
  const clock = useRef(0)

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
    pulseStart.current = clock.current
  }, [pulseKey])

  useFrame((state, rawDelta) => {
    const delta = Math.min(rawDelta, 0.1)
    const t = state.clock.elapsedTime
    clock.current = t
    const a = anim.current
    const dest = cosmosImpulse.destination
    if (dest !== a.dest) {
      const now = frameAt(a, t)
      a.from = now
      a.to = { ...FRAMES[dest] }
      // longer moves take a little longer
      const dist = Math.hypot(a.to.ix - now.ix, a.to.iy - now.iy) + Math.abs(Math.log(a.to.h / now.h)) * 0.3
      a.dur = 1.6 + Math.min(1.2, dist * 2.2)
      a.start = t
      if (a.dest === 'launch') a.arrivedAt = t
      a.dest = dest
    }
    const f = frameAt(a, t)

    const p = pointer.current
    p.sx += (p.x - p.sx) * Math.min(1, delta * 2)
    p.sy += (p.y - p.sy) * Math.min(1, delta * 2)
    const breathe = 1 + 0.03 * Math.sin(t * 0.06)
    uniforms.uFrame.value.set(f.ix + Math.sin(t * 0.021) * 0.004, f.iy + Math.cos(t * 0.017) * 0.003, f.sx - p.sx * 0.014, f.sy - p.sy * 0.009)
    uniforms.uH.value = f.h * breathe
    uniforms.uPointer.value.set(p.sx, p.sy)

    // the rings ablaze: during launch, and for a while after you find a block
    const since = cosmosImpulse.supernovaAt < 0 ? 1e9 : (performance.now() - cosmosImpulse.supernovaAt) / 1000
    const block = smooth(0, 0.8, since) * (1 - smooth(6, 8, since))
    const launch = a.dest === 'launch' ? 1 : a.arrivedAt < 0 ? 1 : 1 - smooth(0, 2.2, t - a.arrivedAt)
    uniforms.uBlaze.value = Math.max(block, launch)

    uniforms.uRes.value.set(size.width, size.height)
    uniforms.uTime.value = t
    uniforms.uEnergy.value = energy.current
    uniforms.uPulseAge.value = t - pulseStart.current
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

/** The framing at time t: an eased glide that pulls back a little in the middle of long moves. */
function frameAt(a: { from: Frame; to: Frame; start: number; dur: number }, t: number): Frame {
  if (a.start < 0) return { ...a.to }
  const k = Math.min(1, (t - a.start) / a.dur)
  const e = easeInOut(k)
  const dist = Math.hypot(a.to.ix - a.from.ix, a.to.iy - a.from.iy)
  const pull = 1 - Math.min(0.35, dist * 0.9) * Math.sin(Math.PI * e)
  // zoom in log space so it feels even
  const h = Math.exp(lerp(Math.log(a.from.h), Math.log(a.to.h), e)) * pull
  return { ix: lerp(a.from.ix, a.to.ix, e), iy: lerp(a.from.iy, a.to.iy, e), sx: lerp(a.from.sx, a.to.sx, e), sy: lerp(a.from.sy, a.to.sy, e), h }
}
