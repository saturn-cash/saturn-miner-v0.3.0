/**
 * The launch intro, drawn as one green hologram on a canvas: you leave Earth in a little ship, jump
 * to hyperspeed (the stars stretch into light), drop out of it at Saturn, and the outline Saturn from
 * the logo pings like the website's cursor while the ship slips into orbit.
 *
 * Everything is a function of time, except the hyperspace stars, which fly forward frame by frame.
 * `createIntro(canvas)` returns `draw(t)` (t in seconds since the intro started); call it every frame.
 */

export const INTRO_LENGTH = 5.8 // s, including the fade-out handled by the caller

// timeline (s)
const LIFTOFF = 0.75
const JUMP = 1.65 // flash, stars start to stretch
const CRUISE = 2.15 // full hyperspeed
const BRAKE = 3.0 // stars start to shrink back
const ARRIVE = 3.35 // out of hyperspace, Saturn comes up
const PINGS = [3.7, 4.2, 4.7]
const BIG_PING = 5.05

const G = [61, 255, 139]
const rgba = (c: number[], a: number) => `rgba(${c[0]},${c[1]},${c[2]},${Math.max(0, Math.min(1, a)).toFixed(3)})`
const CORE = [205, 255, 226]
const GOLD = [255, 214, 150]

const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x))
const span = (t: number, a: number, b: number) => clamp((t - a) / (b - a))
const easeOut = (x: number) => 1 - (1 - x) ** 3
const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2)
const backOut = (x: number) => 1 + 2.2 * (x - 1) ** 3 + 1.2 * (x - 1) ** 2
const TAU = Math.PI * 2

// rough continent outlines (lon, lat in degrees), enough for a hologram to read as Earth
const LAND: [number, number][][] = [
  // North America
  [[-165, 65], [-150, 70], [-125, 70], [-95, 72], [-80, 68], [-62, 58], [-55, 50], [-67, 45], [-75, 38], [-81, 31], [-81, 25], [-90, 29], [-97, 26], [-105, 20], [-95, 16], [-85, 11], [-80, 8], [-88, 15], [-105, 22], [-112, 30], [-118, 33], [-124, 40], [-125, 48], [-135, 57], [-150, 60], [-165, 62]],
  // South America
  [[-80, 8], [-72, 12], [-62, 10], [-50, 2], [-35, -6], [-38, -13], [-40, -22], [-48, -27], [-58, -35], [-63, -40], [-66, -48], [-70, -55], [-74, -50], [-72, -40], [-71, -30], [-70, -18], [-76, -12], [-81, -5], [-80, 1]],
  // Europe + Asia
  [[-10, 36], [-9, 43], [-2, 44], [-5, 48], [3, 51], [8, 54], [5, 58], [12, 64], [20, 70], [30, 71], [45, 68], [60, 70], [75, 72], [95, 76], [110, 74], [130, 71], [150, 70], [170, 66], [180, 65], [170, 60], [160, 55], [142, 46], [140, 38], [128, 35], [122, 30], [120, 22], [108, 18], [106, 10], [100, 8], [98, 16], [92, 22], [88, 22], [80, 14], [77, 8], [72, 20], [66, 25], [57, 25], [52, 28], [48, 30], [56, 23], [58, 18], [52, 15], [44, 12], [40, 20], [35, 28], [34, 32], [36, 36], [28, 37], [26, 40], [22, 38], [20, 40], [15, 38], [12, 44], [8, 44], [3, 42], [0, 39], [-5, 36]],
  // Africa
  [[-17, 21], [-10, 30], [-5, 35], [10, 37], [20, 32], [32, 31], [35, 27], [43, 12], [51, 11], [42, -2], [40, -15], [35, -24], [27, -34], [18, -34], [12, -18], [13, -7], [9, 4], [-5, 5], [-15, 11]],
  // Australia
  [[114, -22], [122, -18], [131, -12], [137, -12], [142, -11], [146, -19], [153, -26], [150, -37], [141, -38], [131, -31], [118, -35], [114, -28]],
]

type Star = { x: number; y: number; z: number; c: number[]; w: number }

export function createIntro(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')!
  let W = 0
  let H = 0
  let dpr = 1

  // deterministic stars, so every launch looks the same
  let seed = 11
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  const stars: Star[] = Array.from({ length: 320 }, () => ({
    x: (rnd() * 2 - 1) * 1.6,
    y: (rnd() * 2 - 1) * 1.1,
    z: 0.08 + rnd() * 0.92,
    c: rnd() < 0.12 ? GOLD : rnd() < 0.55 ? CORE : [255, 255, 255],
    w: 0.6 + rnd() * 1.1,
  }))
  let lastT = 0
  let travelled = 0

  function resize() {
    dpr = Math.min(1.5, window.devicePixelRatio || 1)
    W = canvas.clientWidth
    H = canvas.clientHeight
    canvas.width = Math.round(W * dpr)
    canvas.height = Math.round(H * dpr)
  }
  resize()

  /** a line twice: a wide faint glow, then the bright core (on 'lighter', so overlaps glow) */
  function glowStroke(path: () => void, a: number, width = 1.4, color = G) {
    ctx.lineWidth = width * 3.4
    ctx.strokeStyle = rgba(color, 0.16 * a)
    ctx.beginPath()
    path()
    ctx.stroke()
    ctx.lineWidth = width
    ctx.strokeStyle = rgba(color, 0.95 * a)
    ctx.beginPath()
    path()
    ctx.stroke()
  }

  /** the speed of hyperspace travel at time t (0 parked .. 1 full) */
  const warp = (t: number) => (t < JUMP ? 0 : t < CRUISE ? easeInOut(span(t, JUMP, CRUISE)) : t < BRAKE ? 1 : 1 - easeOut(span(t, BRAKE, ARRIVE + 0.15)))

  function drawStars(t: number, cx: number, cy: number, u: number) {
    const v = warp(t)
    const dt = Math.max(0, Math.min(0.1, t - lastT))
    const step = v * v * 2.4 * dt
    travelled += step
    const F = u * 0.62
    const shake = v > 0.6 ? (v - 0.6) * u * 0.004 : 0
    const ox = cx + Math.sin(t * 61) * shake
    const oy = cy + Math.cos(t * 47) * shake
    const fadeIn = span(t, 0, 0.6)
    for (const s of stars) {
      s.z -= step
      if (s.z <= 0.04) {
        s.z += 1
        s.x = (rnd() * 2 - 1) * 1.6
        s.y = (rnd() * 2 - 1) * 1.1
      }
      const sx = ox + (s.x / s.z) * F * 0.5
      const sy = oy + (s.y / s.z) * F * 0.5
      if (sx < -50 || sx > W + 50 || sy < -50 || sy > H + 50) continue
      const near = 1 - s.z
      const a = fadeIn * (0.25 + 0.75 * near) * (0.75 + 0.25 * Math.sin(t * 2 + s.x * 9))
      // the streak: where this star was a moment ago at this speed
      const tail = Math.min(0.9, v * 0.32)
      if (tail > 0.004) {
        const z0 = Math.min(1.2, s.z + tail)
        const tx = ox + (s.x / z0) * F * 0.5
        const ty = oy + (s.y / z0) * F * 0.5
        const col = v > 0.2 ? (s.c === GOLD ? GOLD : s.z < 0.5 ? CORE : G) : s.c
        ctx.lineWidth = s.w * (0.6 + near * 1.6)
        ctx.strokeStyle = rgba(col, a * (0.5 + 0.5 * v))
        ctx.beginPath()
        ctx.moveTo(tx, ty)
        ctx.lineTo(sx, sy)
        ctx.stroke()
      } else {
        ctx.fillStyle = rgba(s.c, a * 0.8)
        ctx.beginPath()
        ctx.arc(sx, sy, s.w * (0.4 + near * 0.9), 0, TAU)
        ctx.fill()
      }
    }
    // rings of light flying past while at full speed, like going through a tunnel
    if (v > 0.15) {
      for (let i = 0; i < 4; i++) {
        let z = 1 - (((travelled * 1.6 + i / 4) % 1) + 1) % 1
        z = 0.06 + z * 0.94
        const r = (u * 0.2) / z
        const a = v * (1 - z) * 0.55 * span(z, 0.06, 0.25)
        if (a < 0.01 || r > Math.hypot(W, H)) continue
        glowStroke(() => {
          for (let k = 0; k <= 6; k++) {
            const ang = (k / 6) * TAU + Math.PI / 6
            const px = ox + Math.cos(ang) * r
            const py = oy + Math.sin(ang) * r * 0.8
            if (k) ctx.lineTo(px, py)
            else ctx.moveTo(px, py)
          }
        }, a, 1.2)
      }
    }
    lastT = t
  }

  function drawEarth(t: number, cx: number, cy: number, u: number) {
    const appear = easeOut(span(t, 0.05, 0.9))
    // at the jump the camera rushes past Earth: it swells and fades
    const rush = easeInOut(span(t, JUMP - 0.2, JUMP + 0.35))
    const a = appear * (1 - rush)
    if (a <= 0.01) return
    const R = u * 0.17 * (0.9 + 0.1 * appear) * (1 + rush * 2.6)
    const ex = cx
    const ey = cy + rush * u * 0.4
    const spin = t * 0.55 + 1.9
    const tilt = 0.38
    const ct = Math.cos(tilt)
    const st = Math.sin(tilt)
    const proj = (lonDeg: number, latDeg: number) => {
      const lon = (lonDeg * Math.PI) / 180 + spin
      const lat = (latDeg * Math.PI) / 180
      const x = Math.cos(lat) * Math.sin(lon)
      const y = Math.sin(lat)
      const z = Math.cos(lat) * Math.cos(lon)
      const y2 = y * ct - z * st
      const z2 = y * st + z * ct
      return { x: ex + x * R, y: ey - y2 * R, z: z2 }
    }
    const line = (pts: { x: number; y: number; z: number }[], alpha: number, width: number) => {
      // draw front and back halves separately so the far side stays dim
      for (const front of [false, true]) {
        glowStroke(() => {
          let down = false
          for (const p of pts) {
            const vis = front ? p.z >= 0 : p.z < 0
            if (vis) {
              if (down) ctx.lineTo(p.x, p.y)
              else ctx.moveTo(p.x, p.y)
              down = true
            } else down = false
          }
        }, alpha * (front ? 1 : 0.18), width)
      }
    }
    // atmosphere + rim
    const halo = ctx.createRadialGradient(ex, ey, R * 0.9, ex, ey, R * 1.35)
    halo.addColorStop(0, rgba(G, 0.22 * a))
    halo.addColorStop(1, rgba(G, 0))
    ctx.fillStyle = halo
    ctx.beginPath()
    ctx.arc(ex, ey, R * 1.35, 0, TAU)
    ctx.fill()
    ctx.globalCompositeOperation = 'source-over'
    ctx.fillStyle = rgba([3, 12, 8], 0.85 * a)
    ctx.beginPath()
    ctx.arc(ex, ey, R, 0, TAU)
    ctx.fill()
    ctx.globalCompositeOperation = 'lighter'
    glowStroke(() => ctx.arc(ex, ey, R, 0, TAU), a, 1.6)
    // graticule
    for (let lat = -60; lat <= 60; lat += 30) {
      const pts = []
      for (let lon = -180; lon <= 180; lon += 6) pts.push(proj(lon, lat))
      line(pts, a * 0.35, 0.8)
    }
    for (let lon = -180; lon < 180; lon += 30) {
      const pts = []
      for (let lat = -90; lat <= 90; lat += 6) pts.push(proj(lon, lat))
      line(pts, a * 0.3, 0.8)
    }
    // continents
    for (const poly of LAND) {
      const pts = []
      for (let i = 0; i <= poly.length; i++) {
        const [lo0, la0] = poly[i % poly.length]
        const [lo1, la1] = poly[(i + 1) % poly.length]
        for (let k = 0; k < 3; k++) pts.push(proj(lo0 + ((lo1 - lo0) * k) / 3, la0 + ((la1 - la0) * k) / 3))
      }
      line(pts, a * 0.95, 1.3)
    }
  }

  /** the ship: a small arrowhead hologram pointing along `ang`, with an engine glow behind it */
  function drawShip(x: number, y: number, ang: number, size: number, a: number, flame: number) {
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(ang)
    const s = size
    if (flame > 0) {
      const g = ctx.createRadialGradient(-s * 0.9, 0, 0, -s * 0.9, 0, s * (1.2 + flame * 1.6))
      g.addColorStop(0, rgba(CORE, 0.9 * a * flame))
      g.addColorStop(0.4, rgba(G, 0.45 * a * flame))
      g.addColorStop(1, rgba(G, 0))
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(-s * 0.9, 0, s * (1.2 + flame * 1.6), 0, TAU)
      ctx.fill()
    }
    ctx.fillStyle = rgba([4, 14, 9], 0.8 * a)
    const hull = () => {
      ctx.moveTo(s * 1.25, 0)
      ctx.lineTo(-s * 0.8, s * 0.7)
      ctx.lineTo(-s * 0.4, 0)
      ctx.lineTo(-s * 0.8, -s * 0.7)
      ctx.closePath()
    }
    ctx.beginPath()
    hull()
    ctx.fill()
    glowStroke(hull, a, Math.max(1, s * 0.09), CORE)
    glowStroke(() => {
      ctx.moveTo(s * 1.25, 0)
      ctx.lineTo(-s * 0.4, 0)
    }, a * 0.5, Math.max(0.6, s * 0.05))
    ctx.restore()
  }

  /** the ship seen from behind at hyperspeed: a chevron with two engines */
  function drawShipBehind(x: number, y: number, s: number, a: number, burn: number) {
    for (const side of [-1, 1]) {
      const g = ctx.createRadialGradient(x + side * s * 0.42, y + s * 0.12, 0, x + side * s * 0.42, y + s * 0.12, s * (0.35 + burn * 0.45))
      g.addColorStop(0, rgba(CORE, a * (0.6 + 0.4 * burn)))
      g.addColorStop(0.5, rgba(G, a * 0.4))
      g.addColorStop(1, rgba(G, 0))
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(x + side * s * 0.42, y + s * 0.12, s * (0.35 + burn * 0.45), 0, TAU)
      ctx.fill()
    }
    const hull = () => {
      ctx.moveTo(x, y - s * 0.32)
      ctx.lineTo(x + s, y + s * 0.26)
      ctx.lineTo(x + s * 0.3, y + s * 0.1)
      ctx.lineTo(x, y + s * 0.2)
      ctx.lineTo(x - s * 0.3, y + s * 0.1)
      ctx.lineTo(x - s, y + s * 0.26)
      ctx.closePath()
    }
    ctx.fillStyle = rgba([4, 14, 9], 0.85 * a)
    ctx.beginPath()
    hull()
    ctx.fill()
    glowStroke(hull, a, Math.max(1, s * 0.035), CORE)
  }

  // launch path: off Earth's upper right, curving out towards the top right
  function launchPoint(k: number, cx: number, cy: number, u: number) {
    const R = u * 0.17
    const a0 = (-40 * Math.PI) / 180
    const p0 = [cx + Math.cos(a0) * R, cy + Math.sin(a0) * R]
    const p1 = [cx + R * 1.75, cy - R * 0.55]
    const p2 = [cx + R * 1.6, cy - R * 2.3]
    const q = 1 - k
    const x = q * q * p0[0] + 2 * q * k * p1[0] + k * k * p2[0]
    const y = q * q * p0[1] + 2 * q * k * p1[1] + k * k * p2[1]
    const dx = 2 * q * (p1[0] - p0[0]) + 2 * k * (p2[0] - p1[0])
    const dy = 2 * q * (p1[1] - p0[1]) + 2 * k * (p2[1] - p1[1])
    return { x, y, ang: Math.atan2(dy, dx), p0 }
  }

  function drawPing(x: number, y: number, rx: number, k: number, big: boolean) {
    if (k <= 0 || k >= 1) return
    const sc = k < 0.1 ? 0.6 + (k / 0.1) * 0.45 : 1.05 + ((k - 0.1) / 0.9) * ((big ? 6 : 3) - 1.05) * easeOut((k - 0.1) / 0.9)
    const a = k < 0.1 ? k / 0.1 : 1 - (k - 0.1) / 0.9
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate((-20 * Math.PI) / 180)
    glowStroke(() => ctx.ellipse(0, 0, rx * sc, rx * sc * 0.28, 0, 0, TAU), a, big ? 2.4 : 1.7)
    ctx.restore()
  }

  /** the outline Saturn from the cursor and logo (same geometry as the app's boot mark) */
  function drawSaturn(x: number, y: number, k: number, a: number, t: number) {
    ctx.save()
    ctx.translate(x, y)
    ctx.scale(k, k)
    ctx.rotate((-20 * Math.PI) / 180)
    // line widths are in Saturn units and get scaled with it: keep them about as fine as the logo
    const lw = Math.min(1, 2.6 / (k * 1.5))
    const rings: [number, number, number, number][] = [
      [45, 12.5, 1.5, 1],
      [38.5, 10.7, 0.7, 0.45],
      [32, 8, 1.1, 0.75],
    ]
    const half = (back: boolean) => {
      for (const [rx, ry, w, o] of rings) glowStroke(() => ctx.ellipse(0, 0, rx, ry, 0, back ? Math.PI : 0, back ? TAU : Math.PI), a * o, w * lw)
    }
    // spin axis
    ctx.setLineDash([1.5, 2.5])
    glowStroke(() => {
      ctx.moveTo(0, -30)
      ctx.lineTo(0, 30)
    }, a * 0.45, 0.8 * lw)
    ctx.setLineDash([])
    half(true)
    // the disc is solid, so it hides the back half of the rings (everything else adds light)
    ctx.globalCompositeOperation = 'source-over'
    ctx.fillStyle = rgba([3, 9, 6], 0.96 * a)
    ctx.beginPath()
    ctx.arc(0, 0, 18.6, 0, TAU)
    ctx.fill()
    ctx.globalCompositeOperation = 'lighter'
    glowStroke(() => ctx.arc(0, 0, 19, 0, TAU), a, 1.5 * lw)
    ctx.save()
    ctx.beginPath()
    ctx.arc(0, 0, 19, 0, TAU)
    ctx.clip()
    ;[-11, -4, 3, 10].forEach((by, i) => glowStroke(() => ctx.ellipse(0, by, 19, 3 + (i % 2) * 0.6, 0, 0, Math.PI), a * 0.6, 0.9 * lw))
    // meridians turn slowly, so the planet reads as a globe
    for (let i = 0; i < 4; i++) {
      const l = 0.55 + (i * Math.PI) / 4 + t * 0.35
      glowStroke(() => ctx.ellipse(0, 0, Math.max(0.01, Math.abs(Math.sin(l)) * 19), 19, 0, 0, TAU), a * (0.2 + 0.65 * Math.max(0, Math.cos(l))), 0.9 * lw)
    }
    ctx.restore()
    half(false)
    ctx.restore()
  }

  function draw(t: number) {
    if (canvas.clientWidth !== W || canvas.clientHeight !== H) resize()
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.globalCompositeOperation = 'source-over'
    ctx.clearRect(0, 0, W, H)
    ctx.globalCompositeOperation = 'lighter'
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    const u = Math.min(W, H * 1.25)
    const cx = W / 2
    const cy = H * 0.44
    // a faint green glow at the heart of the screen, brighter at hyperspeed
    const v = warp(t)
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, u * 0.75)
    glow.addColorStop(0, rgba(G, 0.05 + 0.1 * v))
    glow.addColorStop(1, rgba(G, 0))
    ctx.fillStyle = glow
    ctx.fillRect(0, 0, W, H)

    drawStars(t, cx, cy, u)
    drawEarth(t, cx, cy, u)

    // 1. liftoff
    if (t >= LIFTOFF - 0.1 && t < JUMP + 0.1) {
      const k = easeInOut(span(t, LIFTOFF, JUMP))
      const p = launchPoint(k, cx, cy, u)
      // the dashed trail from the pad
      ctx.setLineDash([3, 5])
      glowStroke(() => {
        for (let i = 0; i <= 24; i++) {
          const q = launchPoint((k * i) / 24, cx, cy, u)
          if (i) ctx.lineTo(q.x, q.y)
          else ctx.moveTo(q.x, q.y)
        }
      }, 0.7 * (1 - span(t, JUMP - 0.15, JUMP + 0.1)), 1)
      ctx.setLineDash([])
      drawPing(p.p0[0], p.p0[1], u * 0.05, span(t, LIFTOFF, LIFTOFF + 1.1), false)
      const shipA = span(t, LIFTOFF - 0.1, LIFTOFF + 0.1) * (1 - span(t, JUMP - 0.05, JUMP + 0.1))
      drawShip(p.x, p.y, p.ang, u * 0.022, shipA, 0.4 + 0.6 * k)
    }

    // 2. the jump: a flash, then the ship from behind riding the light
    const flash = Math.max(0, 1 - Math.abs(t - JUMP) / 0.22)
    if (flash > 0) {
      const f = ctx.createRadialGradient(cx, cy, 0, cx, cy, u * 0.9)
      f.addColorStop(0, rgba([235, 255, 244], 0.85 * flash))
      f.addColorStop(0.35, rgba(G, 0.35 * flash))
      f.addColorStop(1, rgba(G, 0))
      ctx.fillStyle = f
      ctx.fillRect(0, 0, W, H)
    }
    if (t > JUMP - 0.05 && t < ARRIVE + 0.75) {
      const inA = span(t, JUMP - 0.05, JUMP + 0.25)
      // after hyperspace the ship heads in to Saturn: it shrinks into the distance
      const away = easeInOut(span(t, BRAKE + 0.1, ARRIVE + 0.7))
      const s = u * 0.075 * (1 - away * 0.92)
      const bob = Math.sin(t * 7) * u * 0.003
      const x = cx + Math.sin(t * 3.1) * u * 0.006
      const y = cy + u * (0.12 - away * 0.12) + bob
      drawShipBehind(x, y, s, inA * (1 - span(t, ARRIVE + 0.45, ARRIVE + 0.75)), v)
    }

    // 3. Saturn
    if (t > ARRIVE - 0.05) {
      const k = backOut(span(t, ARRIVE, ARRIVE + 0.75))
      const a = span(t, ARRIVE - 0.05, ARRIVE + 0.35) * (0.94 + 0.06 * Math.sin(t * 37))
      const size = (u * 0.42) / 100 // the art is 100 units wide
      drawSaturn(cx, cy, size * (0.15 + 0.85 * k), a, t)
      for (const p of PINGS) drawPing(cx, cy, u * 0.42 * 0.39, span(t, p, p + 1.7), false)
      drawPing(cx, cy, u * 0.42 * 0.39, span(t, BIG_PING, BIG_PING + 1.15), true)
      // the ship, now a speck, settles into orbit along the outer ring
      const o = span(t, ARRIVE + 0.6, INTRO_LENGTH)
      if (o > 0) {
        const ang = Math.PI * 0.85 + o * Math.PI * 1.1
        const rx = 46 * size
        const ry = 12.9 * size
        const tl = (-20 * Math.PI) / 180
        const ex = Math.cos(ang) * rx
        const ey = Math.sin(ang) * ry
        const px = cx + ex * Math.cos(tl) - ey * Math.sin(tl)
        const py = cy + ex * Math.sin(tl) + ey * Math.cos(tl)
        const sa = span(t, ARRIVE + 0.6, ARRIVE + 0.9)
        ctx.fillStyle = rgba(CORE, sa)
        ctx.beginPath()
        ctx.arc(px, py, Math.max(1.4, u * 0.004), 0, TAU)
        ctx.fill()
        ctx.fillStyle = rgba(G, 0.35 * sa)
        ctx.beginPath()
        ctx.arc(px, py, Math.max(4, u * 0.012), 0, TAU)
        ctx.fill()
      }
    }
    ctx.globalCompositeOperation = 'source-over'
  }

  // ---- hologram glitches: short bursts where bands of the picture slip sideways and flicker ----
  const BURSTS: [number, number, number][] = [
    // [start s, length s, strength]
    [0.42, 0.08, 0.6],
    [LIFTOFF + 0.05, 0.07, 0.5],
    [JUMP - 0.04, 0.12, 1],
    [2.55, 0.05, 0.4],
    [ARRIVE - 0.06, 0.1, 0.9],
    [ARRIVE + 0.28, 0.06, 0.5],
    [4.35, 0.05, 0.35],
    [BIG_PING + 0.02, 0.14, 0.7],
  ]
  const hash = (n: number) => {
    const x = Math.sin(n * 127.1 + 311.7) * 43758.5453
    return x - Math.floor(x)
  }
  let buf: HTMLCanvasElement | null = null
  const burstAt = (t: number) => {
    let g = 0
    for (const [a, l, k] of BURSTS) if (t >= a && t < a + l) g = Math.max(g, k)
    return g
  }
  function glitch(t: number) {
    const g = burstAt(t)
    if (!g) return
    if (!buf) buf = document.createElement('canvas')
    if (buf.width !== canvas.width || buf.height !== canvas.height) {
      buf.width = canvas.width
      buf.height = canvas.height
    }
    const b = buf.getContext('2d')!
    b.clearRect(0, 0, buf.width, buf.height)
    b.drawImage(canvas, 0, 0)
    const frame = Math.floor(t * 30)
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.globalCompositeOperation = 'source-over'
    const bands = 2 + Math.floor(g * 4)
    for (let i = 0; i < bands; i++) {
      const y = Math.floor(hash(frame * 7 + i) * canvas.height)
      const h = Math.max(2, Math.floor((0.012 + hash(frame * 13 + i) * 0.07) * canvas.height))
      const dx = Math.round((hash(frame * 3 + i * 5) - 0.5) * canvas.width * 0.07 * g)
      ctx.clearRect(0, y, canvas.width, h)
      ctx.drawImage(buf, 0, y, canvas.width, h, dx, y, canvas.width, h)
      // a faint cyan ghost of the band, offset the other way
      ctx.globalAlpha = 0.35 * g
      ctx.globalCompositeOperation = 'lighter'
      ctx.drawImage(buf, 0, y, canvas.width, h, -dx * 0.6, y + 1, canvas.width, h)
      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = 'source-over'
    }
    // the whole projection dips for a frame
    if (hash(frame * 17) < 0.5) {
      ctx.fillStyle = `rgba(0,0,0,${(0.25 * g).toFixed(3)})`
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    }
  }

  function drawWithGlitch(t: number) {
    draw(t)
    glitch(t)
  }

  return { draw: drawWithGlitch, resize }
}
