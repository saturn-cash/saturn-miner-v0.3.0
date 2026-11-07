'use client'

import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { cosmos, cosmosImpulse } from '@/lib/cosmos/store'

const HOLD = 5200 // ms until the screen leaves
const G = '61 255 139' // the website's Saturn-cursor green
// sonar pings rolling out of the planet, tilted like the click rings on saturn.boats (s after start)
const PINGS = [1.7, 2.45, 3.2, 3.95]
const FINAL_PING = 4.7
const ease = [0.16, 1, 0.3, 1] as const

/**
 * Launch screen: the green outline Saturn from the saturn.boats cursor, as a finished title sequence
 * (about 5 s, a click skips it). Its rings trace themselves in, then the planet; it spins up on its
 * axis with lines of longitude sweeping across its face, sparks orbit the rings, green pings tilted
 * like the website's click rings roll out, the name settles, and a last big ping sends it towards you
 * as the app arrives mid-flight.
 */
export function BootSequence({ onDone, cinematic }: { onDone: () => void; cinematic: boolean }) {
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!cinematic) {
      cosmosImpulse.launching = false
      cosmos.travelTo('overview')
      onDone()
      setDone(true)
      return
    }
    // start the camera flight just before the screen dissolves, so the app arrives in motion
    const fly = setTimeout(() => cosmos.travelTo('overview'), HOLD - 350)
    const t = setTimeout(() => {
      setDone(true)
      onDone()
    }, HOLD)
    return () => {
      clearTimeout(fly)
      clearTimeout(t)
    }
  }, [cinematic, onDone])

  const skip = () => {
    if (done) return
    cosmos.travelTo('overview')
    setDone(true)
    onDone()
  }

  // a still field of stars for the title card (seeded, so it doesn't change between renders)
  const stars = useMemo(() => {
    let s = 7
    const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647
    return Array.from({ length: 80 }, () => ({ x: rnd() * 100, y: rnd() * 100, r: rnd() < 0.15 ? 2 : 1, d: rnd() * 1.6, t: 2 + rnd() * 3 }))
  }, [])

  return (
    <AnimatePresence>
      {!done && (
        <motion.div
          key="boot"
          className="fixed inset-0 z-50 grid place-items-center overflow-hidden bg-[var(--void)]"
          exit={{ opacity: 0 }}
          transition={{ duration: 0.75, ease: [0.7, 0, 0.84, 0] }}
          onClick={skip}
          role="status"
          aria-label="Saturn is launching"
        >
          <div aria-hidden="true" className="absolute inset-0">
            {stars.map((st, i) => (
              <motion.span
                key={i}
                className="absolute rounded-full bg-white"
                style={{ left: `${st.x}%`, top: `${st.y}%`, width: st.r, height: st.r }}
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 0.75, 0.3, 0.75] }}
                transition={{ duration: st.t, delay: 0.1 + st.d, repeat: Infinity, repeatType: 'mirror' }}
              />
            ))}
          </div>
          <motion.div
            aria-hidden="true"
            className="absolute size-[720px] rounded-full"
            style={{ background: `radial-gradient(closest-side, rgb(${G} / 0.09), transparent)` }}
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 2.6, delay: 0.3, ease }}
          />

          <motion.div className="relative flex flex-col items-center" exit={{ scale: 1.5, filter: 'blur(10px)' }} transition={{ duration: 0.75, ease: [0.7, 0, 0.84, 0] }}>
            <div className="relative grid size-[300px] place-items-center">
              {PINGS.map((d, i) => (
                <Ping key={i} delay={d} />
              ))}
              <Ping delay={FINAL_PING} big />
              <SpinningSaturn />
            </div>
            <motion.h1
              className="-mt-6 text-[30px] font-semibold"
              initial={{ opacity: 0, letterSpacing: '0.5em', filter: 'blur(6px)' }}
              animate={{ opacity: 1, letterSpacing: '-0.01em', filter: 'blur(0px)' }}
              transition={{ duration: 1.6, delay: 1.5, ease }}
            >
              Saturn
            </motion.h1>
            <motion.p
              className="mt-2 font-mono text-[11px] uppercase tracking-[0.3em]"
              style={{ color: `rgb(${G} / 0.85)` }}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 2.2, ease }}
            >
              mainnet · sha-256d
            </motion.p>
            <motion.div className="mt-6 h-[3px] w-44 overflow-hidden rounded-full bg-white/[0.12]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, delay: 1.6 }}>
              <motion.div
                className="h-full rounded-full"
                style={{ background: `linear-gradient(90deg, rgb(200 255 222), rgb(${G}))`, boxShadow: `0 0 10px rgb(${G} / 0.7)` }}
                initial={{ width: '0%' }}
                animate={{ width: '100%' }}
                transition={{ duration: 3.0, delay: 1.75, ease: [0.45, 0, 0.2, 1] }}
              />
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/** A green ring tilted like Saturn's, rolling out of the planet (the website's click ring, bigger). */
function Ping({ delay, big = false }: { delay: number; big?: boolean }) {
  return (
    <motion.span
      aria-hidden="true"
      className="absolute rounded-[50%]"
      style={{
        width: 236,
        height: 66,
        rotate: -20,
        border: `${big ? 3 : 2}px solid rgb(${G} / 0.95)`,
        boxShadow: `0 0 14px rgb(${G} / 0.6), inset 0 0 12px rgb(${G} / 0.35)`,
      }}
      initial={{ opacity: 0, scale: 0.6 }}
      animate={{ opacity: [0, 1, 0], scale: [0.6, 1.05, big ? 6 : 3] }}
      transition={{ duration: big ? 1.1 : 1.7, delay, times: [0, 0.1, 1], ease: 'easeOut' }}
    />
  )
}

/**
 * The cursor's Saturn, drawn large: the rings trace in, then the planet, then it spins on its axis
 * (lines of longitude sweep across the face), with sparks riding the rings.
 */
function SpinningSaturn() {
  const meridians = useRef<(SVGEllipseElement | null)[]>([])
  const sparks = useRef<(SVGCircleElement | null)[]>([])
  const SPARKS = useMemo(() => Array.from({ length: 7 }, (_, i) => ({ a: (i / 7) * Math.PI * 2, v: 0.55 + (i % 3) * 0.18, r: i % 2 ? 45 : 38.5 })), [])

  useEffect(() => {
    let raf = 0
    const t0 = performance.now()
    const tick = (now: number) => {
      const t = (now - t0) / 1000
      // spins up as it appears, then one turn every ~3.5 s
      const angle = t < 1.2 ? 0 : (t - 1.2) * 1.8
      meridians.current.forEach((m, i) => {
        if (!m) return
        const lon = angle + (i * Math.PI) / 4
        m.setAttribute('rx', String(Math.max(0.01, Math.abs(Math.sin(lon)) * 19)))
        m.setAttribute('opacity', (t < 1.2 ? 0 : Math.min(1, (t - 1.2) / 0.6) * (0.2 + 0.65 * Math.max(0, Math.cos(lon)))).toFixed(2))
      })
      sparks.current.forEach((s, i) => {
        if (!s) return
        const sp = SPARKS[i]
        const a = sp.a + t * sp.v
        const x = Math.cos(a) * sp.r
        const y = Math.sin(a) * (sp.r === 45 ? 12.5 : 10.7)
        const behind = y < 0 && Math.abs(x) < 19.5
        s.setAttribute('cx', x.toFixed(2))
        s.setAttribute('cy', y.toFixed(2))
        s.setAttribute('opacity', behind || t < 1.0 ? '0' : (0.55 + 0.45 * Math.abs(Math.sin(a * 3 + i))).toFixed(2))
      })
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [SPARKS])

  const draw = (delay: number, duration = 1.1) => ({
    initial: { pathLength: 0, opacity: 0 },
    animate: { pathLength: 1, opacity: 1 },
    transition: { pathLength: { duration, delay, ease: [0.65, 0, 0.35, 1] as const }, opacity: { duration: 0.2, delay } },
  })

  return (
    <motion.svg
      viewBox="-50 -50 100 100"
      className="relative size-[300px] overflow-visible"
      fill="none"
      stroke={`rgb(${G})`}
      strokeWidth={1.5}
      strokeLinecap="round"
      style={{ filter: `drop-shadow(0 0 3px rgb(${G} / 0.9)) drop-shadow(0 0 14px rgb(${G} / 0.45))` }}
      initial={{ scale: 0.85 }}
      animate={{ scale: [0.85, 1, 1.03] }}
      transition={{ duration: 5, times: [0, 0.35, 1], ease: 'easeOut' }}
      aria-hidden="true"
    >
      <defs>
        <clipPath id="boot-disc">
          <circle r="19" />
        </clipPath>
        <mask id="boot-behind" maskUnits="userSpaceOnUse" x="-50" y="-50" width="100" height="100">
          <rect x="-50" y="-50" width="100" height="100" fill="#fff" />
          <path d="M-20.5,0 A20.5,20.5 0 0,1 20.5,0 Z" fill="#000" />
        </mask>
      </defs>
      <g transform="rotate(-20)">
        <motion.line x1="0" y1="-30" x2="0" y2="30" strokeWidth={0.8} strokeDasharray="1.5 2.5" {...draw(0.9, 0.8)} animate={{ pathLength: 1, opacity: 0.5 }} />
        {/* the far half of the rings, behind the planet */}
        <g mask="url(#boot-behind)">
          <motion.ellipse rx="45" ry="12.5" {...draw(0.15)} />
          <motion.ellipse rx="38.5" ry="10.7" strokeWidth={0.7} {...draw(0.3)} animate={{ pathLength: 1, opacity: 0.45 }} />
          <motion.ellipse rx="32" ry="8" strokeWidth={1.1} {...draw(0.45)} animate={{ pathLength: 1, opacity: 0.75 }} />
        </g>
        {/* the planet's dark face fades in under its outline, hiding the rings behind it */}
        <motion.circle r="18.6" fill="rgb(4 8 6)" stroke="none" initial={{ opacity: 0 }} animate={{ opacity: 0.8 }} transition={{ duration: 0.6, delay: 1.1 }} />
        <motion.circle r="19" {...draw(0.55, 1.0)} />
        <g clipPath="url(#boot-disc)" strokeWidth={0.9}>
          {[-11, -4, 3, 10].map((y, i) => (
            <motion.path key={y} d={`M-19,${y} A19,${3 + (i % 2) * 0.6} 0 0,0 19,${y}`} {...draw(0.95 + i * 0.08, 0.6)} animate={{ pathLength: 1, opacity: 0.6 }} />
          ))}
          {[0, 1, 2, 3].map((i) => (
            <ellipse
              key={i}
              ref={(el) => {
                meridians.current[i] = el
              }}
              ry="19"
              rx="1"
              opacity="0"
            />
          ))}
        </g>
        {/* the near half of the rings, passing in front of the planet */}
        <motion.path d="M-45,0 A45,12.5 0 0,0 45,0" {...draw(0.15)} />
        <motion.path d="M-38.5,0 A38.5,10.7 0 0,0 38.5,0" strokeWidth={0.7} {...draw(0.3)} animate={{ pathLength: 1, opacity: 0.45 }} />
        <motion.path d="M-32,0 A32,8 0 0,0 32,0" strokeWidth={1.1} {...draw(0.45)} animate={{ pathLength: 1, opacity: 0.75 }} />
        {SPARKS.map((_, i) => (
          <circle
            key={i}
            ref={(el) => {
              sparks.current[i] = el
            }}
            r="0.9"
            fill="rgb(200 255 222)"
            stroke="none"
            opacity="0"
          />
        ))}
      </g>
    </motion.svg>
  )
}
