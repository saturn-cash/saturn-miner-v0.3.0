'use client'

/**
 * Saturn's soundscape, synthesized live with WebAudio — no audio files to ship.
 *
 *   drone   two detuned low sines + filtered "solar wind" noise; opens up as hashrate climbs
 *   warp    a noise whoosh swept through a band-pass, with a sub-bass sweep under it
 *   ignite  a rising reactor tone and a thump; powerDown is the reverse
 *   share   a soft crystalline ping on a pentatonic note, echoed
 *   block   a slow major-ninth swell with shimmer
 *   arrive  a low bell when the ship settles at a destination
 *
 * Browsers only allow audio after a user gesture, so nothing is created until `unlock()`.
 */

type Nodes = {
  ctx: AudioContext
  master: GainNode
  droneGain: GainNode
  droneFilter: BiquadFilterNode
  engineGain: GainNode
  windGain: GainNode
  echo: GainNode
  noise: AudioBuffer
}

const PENTATONIC = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3, 2]

class SoundEngine {
  private n: Nodes | null = null
  private enabled = true
  private volume = 0.6
  private energy = 0
  private lastShare = 0

  /** Call from any user gesture. Safe to call repeatedly. */
  unlock() {
    if (typeof window === 'undefined') return
    if (!this.n) this.build()
    if (this.n && this.n.ctx.state === 'suspended') void this.n.ctx.resume()
    this.applyMaster(0.8)
  }

  configure({ enabled, volume }: { enabled: boolean; volume: number }) {
    this.enabled = enabled
    this.volume = volume
    this.applyMaster(0.4)
  }

  setEnergy(e: number) {
    this.energy = e
    const n = this.ready()
    if (!n) return
    const t = n.ctx.currentTime
    n.droneFilter.frequency.setTargetAtTime(260 + e * 900, t, 1.2)
    n.engineGain.gain.setTargetAtTime(e * 0.045, t, 1.0)
    n.windGain.gain.setTargetAtTime(0.03 + e * 0.03, t, 1.5)
  }

  warp(intensity = 1) {
    const n = this.ready()
    if (!n) return
    const { ctx } = n
    const t = ctx.currentTime
    const dur = 1.2 + intensity * 0.9

    const src = this.noiseSource(n)
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.Q.value = 1.4
    bp.frequency.setValueAtTime(180, t)
    bp.frequency.exponentialRampToValueAtTime(2600 + intensity * 1400, t + dur * 0.45)
    bp.frequency.exponentialRampToValueAtTime(220, t + dur)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.32 * intensity, t + dur * 0.35)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    src.connect(bp).connect(g).connect(n.master)
    src.start(t)
    src.stop(t + dur + 0.05)

    const sub = ctx.createOscillator()
    sub.type = 'sine'
    sub.frequency.setValueAtTime(38, t)
    sub.frequency.exponentialRampToValueAtTime(92, t + dur * 0.5)
    sub.frequency.exponentialRampToValueAtTime(34, t + dur)
    const sg = ctx.createGain()
    sg.gain.setValueAtTime(0.0001, t)
    sg.gain.exponentialRampToValueAtTime(0.28 * intensity, t + dur * 0.3)
    sg.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    sub.connect(sg).connect(n.master)
    sub.start(t)
    sub.stop(t + dur + 0.05)
  }

  ignite() {
    const n = this.ready()
    if (!n) return
    const { ctx } = n
    const t = ctx.currentTime
    const osc = ctx.createOscillator()
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(55, t)
    osc.frequency.exponentialRampToValueAtTime(220, t + 0.9)
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.setValueAtTime(200, t)
    lp.frequency.exponentialRampToValueAtTime(2400, t + 0.9)
    lp.frequency.exponentialRampToValueAtTime(300, t + 1.6)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.16, t + 0.7)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.7)
    osc.connect(lp).connect(g).connect(n.master)
    osc.start(t)
    osc.stop(t + 1.8)
    this.thump(n, t + 0.85, 0.7)
  }

  powerDown() {
    const n = this.ready()
    if (!n) return
    const { ctx } = n
    const t = ctx.currentTime
    const osc = ctx.createOscillator()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(240, t)
    osc.frequency.exponentialRampToValueAtTime(40, t + 1.1)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.12, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2)
    osc.connect(g).connect(n.master)
    osc.start(t)
    osc.stop(t + 1.3)
  }

  share() {
    const n = this.ready()
    if (!n) return
    const now = performance.now()
    if (now - this.lastShare < 250) return
    this.lastShare = now
    const { ctx } = n
    const t = ctx.currentTime
    const f = 880 * PENTATONIC[Math.floor(Math.random() * PENTATONIC.length)]
    for (const [mult, amp] of [
      [1, 0.07],
      [2.01, 0.025],
    ] as const) {
      const o = ctx.createOscillator()
      o.type = 'sine'
      o.frequency.value = f * mult
      const g = ctx.createGain()
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(amp, t + 0.01)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9)
      o.connect(g)
      g.connect(n.master)
      g.connect(n.echo)
      o.start(t)
      o.stop(t + 1)
    }
  }

  block() {
    const n = this.ready()
    if (!n) return
    const { ctx } = n
    const t = ctx.currentTime
    this.thump(n, t, 1)
    // major ninth: C E G B D, spread over two octaves
    const chord = [261.63, 329.63, 392, 493.88, 587.33, 523.25 * 2]
    chord.forEach((f, i) => {
      const o = ctx.createOscillator()
      o.type = i % 2 ? 'triangle' : 'sine'
      o.frequency.value = f
      o.detune.value = (Math.random() - 0.5) * 12
      const g = ctx.createGain()
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(0.06, t + 0.35 + i * 0.06)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 5)
      o.connect(g)
      g.connect(n.master)
      g.connect(n.echo)
      o.start(t)
      o.stop(t + 5.1)
    })
    const src = this.noiseSource(n)
    const hp = ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 6000
    const sg = ctx.createGain()
    sg.gain.setValueAtTime(0.0001, t)
    sg.gain.exponentialRampToValueAtTime(0.08, t + 0.5)
    sg.gain.exponentialRampToValueAtTime(0.0001, t + 3.5)
    src.connect(hp).connect(sg).connect(n.master)
    src.start(t)
    src.stop(t + 3.6)
  }

  arrive() {
    const n = this.ready()
    if (!n) return
    const { ctx } = n
    const t = ctx.currentTime
    for (const [f, amp] of [
      [146.83, 0.1],
      [220, 0.05],
      [293.66 * 1.002, 0.03],
    ] as const) {
      const o = ctx.createOscillator()
      o.type = 'sine'
      o.frequency.value = f
      const g = ctx.createGain()
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(amp, t + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 2.2)
      o.connect(g)
      g.connect(n.master)
      g.connect(n.echo)
      o.start(t)
      o.stop(t + 2.3)
    }
  }

  click() {
    const n = this.ready()
    if (!n) return
    const { ctx } = n
    const t = ctx.currentTime
    const o = ctx.createOscillator()
    o.type = 'sine'
    o.frequency.setValueAtTime(1400, t)
    o.frequency.exponentialRampToValueAtTime(700, t + 0.05)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.04, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07)
    o.connect(g).connect(n.master)
    o.start(t)
    o.stop(t + 0.08)
  }

  /* ---------------------------------------------------------------- */

  private ready() {
    if (!this.enabled || !this.n || this.n.ctx.state !== 'running') return null
    return this.n
  }

  private applyMaster(seconds: number) {
    if (!this.n) return
    const target = this.enabled ? this.volume * 0.7 : 0
    this.n.master.gain.setTargetAtTime(target, this.n.ctx.currentTime, seconds / 3)
  }

  private noiseSource(n: Nodes) {
    const src = n.ctx.createBufferSource()
    src.buffer = n.noise
    src.loop = true
    src.loopStart = Math.random()
    return src
  }

  private thump(n: Nodes, t: number, amp: number) {
    const o = n.ctx.createOscillator()
    o.type = 'sine'
    o.frequency.setValueAtTime(120, t)
    o.frequency.exponentialRampToValueAtTime(36, t + 0.35)
    const g = n.ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.45 * amp, t + 0.01)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6)
    o.connect(g).connect(n.master)
    o.start(t)
    o.stop(t + 0.65)
  }

  private build() {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()

    const master = ctx.createGain()
    master.gain.value = 0
    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -16
    comp.ratio.value = 4
    master.connect(comp).connect(ctx.destination)

    // shared echo bus for pings and bells
    const echo = ctx.createGain()
    echo.gain.value = 0.5
    const delay = ctx.createDelay(1)
    delay.delayTime.value = 0.32
    const fb = ctx.createGain()
    fb.gain.value = 0.38
    const echoLp = ctx.createBiquadFilter()
    echoLp.type = 'lowpass'
    echoLp.frequency.value = 2400
    echo.connect(delay)
    delay.connect(echoLp).connect(fb).connect(delay)
    echoLp.connect(master)

    // white noise buffer, reused by every noisy sound
    const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate)
    const data = noise.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1

    // drone
    const droneFilter = ctx.createBiquadFilter()
    droneFilter.type = 'lowpass'
    droneFilter.frequency.value = 260
    droneFilter.Q.value = 2
    const droneGain = ctx.createGain()
    droneGain.gain.value = 0.22
    droneFilter.connect(droneGain).connect(master)
    for (const [f, type, amp] of [
      [55, 'sine', 0.6],
      [82.6, 'sine', 0.35],
      [110.4, 'triangle', 0.12],
    ] as const) {
      const o = ctx.createOscillator()
      o.type = type
      o.frequency.value = f
      const g = ctx.createGain()
      g.gain.value = amp
      o.connect(g).connect(droneFilter)
      o.start()
    }
    const lfo = ctx.createOscillator()
    lfo.frequency.value = 0.06
    const lfoAmt = ctx.createGain()
    lfoAmt.gain.value = 120
    lfo.connect(lfoAmt).connect(droneFilter.frequency)
    lfo.start()

    // engine hum that only exists while hashing
    const engineGain = ctx.createGain()
    engineGain.gain.value = 0
    const engine = ctx.createOscillator()
    engine.type = 'sawtooth'
    engine.frequency.value = 165
    engine.detune.value = 7
    const engineLp = ctx.createBiquadFilter()
    engineLp.type = 'lowpass'
    engineLp.frequency.value = 700
    engine.connect(engineLp).connect(engineGain).connect(droneFilter)
    engine.start()

    // solar wind
    const wind = ctx.createBufferSource()
    wind.buffer = noise
    wind.loop = true
    const windBp = ctx.createBiquadFilter()
    windBp.type = 'bandpass'
    windBp.frequency.value = 520
    windBp.Q.value = 0.6
    const windGain = ctx.createGain()
    windGain.gain.value = 0.03
    const windLfo = ctx.createOscillator()
    windLfo.frequency.value = 0.045
    const windLfoAmt = ctx.createGain()
    windLfoAmt.gain.value = 260
    windLfo.connect(windLfoAmt).connect(windBp.frequency)
    windLfo.start()
    wind.connect(windBp).connect(windGain).connect(master)
    wind.start()

    this.n = { ctx, master, droneGain, droneFilter, engineGain, windGain, echo, noise }
    this.setEnergy(this.energy)
  }
}

export const sound = new SoundEngine()
