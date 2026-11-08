'use client'

import { motion } from 'motion/react'
import { useMemo } from 'react'

const G = '61 255 139' // the website's Saturn-cursor green
// sonar pings rolling out of the planet, tilted like the click rings on saturn.boats (s after start)
const PINGS = [1.0, 1.8, 2.6, 3.4]
const FINAL_PING = 4.7
const ease = [0.16, 1, 0.3, 1] as const
export const OUTLINE_HOLD = 5200 // ms

/**
 * The everyday launch film: the green outline Saturn from the saturn.boats cursor, still and glowing,
 * sending out green pings tilted like the website's click rings. The name settles, the line fills.
 */
export function OutlineFilm() {
  // a still field of stars for the title card (seeded, so it doesn't change between renders)
  const stars = useMemo(() => {
    let s = 7
    const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647
    return Array.from({ length: 80 }, () => ({ x: rnd() * 100, y: rnd() * 100, r: rnd() < 0.15 ? 2 : 1, d: rnd() * 1.6, t: 2 + rnd() * 3 }))
  }, [])

  return (
    <div className="absolute inset-0 grid place-items-center">
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
              <OutlineSaturn />
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
    </div>
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

/** The website cursor's green outline Saturn, large and still, glowing (the same mark as the logo). */
function OutlineSaturn() {
  const lons = [0.55, 0.55 + Math.PI / 4, 0.55 + Math.PI / 2, 0.55 + (3 * Math.PI) / 4]
  return (
    <motion.svg
      viewBox="-50 -50 100 100"
      className="relative size-[300px] overflow-visible"
      fill="none"
      stroke={`rgb(${G})`}
      strokeWidth={1.5}
      strokeLinecap="round"
      aria-hidden="true"
      initial={{ opacity: 0, scale: 0.86, filter: `blur(8px) drop-shadow(0 0 0px rgb(${G} / 0))` }}
      animate={{ opacity: 1, scale: [0.86, 1, 1.03], filter: `blur(0px) drop-shadow(0 0 10px rgb(${G} / 0.55))` }}
      transition={{ opacity: { duration: 0.9, delay: 0.3 }, filter: { duration: 1.2, delay: 0.3, ease }, scale: { duration: 4.9, times: [0, 0.3, 1], delay: 0.3, ease: 'easeOut' } }}
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
        <line x1="0" y1="-30" x2="0" y2="30" strokeWidth={0.8} strokeDasharray="1.5 2.5" opacity={0.5} />
        <g mask="url(#boot-behind)">
          <ellipse rx="45" ry="12.5" />
          <ellipse rx="38.5" ry="10.7" strokeWidth={0.7} opacity={0.45} />
          <ellipse rx="32" ry="8" strokeWidth={1.1} opacity={0.75} />
        </g>
        <circle r="18.6" fill="rgb(4 8 6)" fillOpacity={0.8} stroke="none" />
        <circle r="19" />
        <g clipPath="url(#boot-disc)" strokeWidth={0.9}>
          {[-11, -4, 3, 10].map((y, i) => (
            <path key={y} d={`M-19,${y} A19,${3 + (i % 2) * 0.6} 0 0,0 19,${y}`} opacity={0.6} />
          ))}
          {lons.map((l, i) => (
            <ellipse key={i} ry="19" rx={Math.max(0.01, Math.abs(Math.sin(l)) * 19)} opacity={0.2 + 0.65 * Math.max(0, Math.cos(l))} />
          ))}
        </g>
        <path d="M-45,0 A45,12.5 0 0,0 45,0" />
        <path d="M-38.5,0 A38.5,10.7 0 0,0 38.5,0" strokeWidth={0.7} opacity={0.45} />
        <path d="M-32,0 A32,8 0 0,0 32,0" strokeWidth={1.1} opacity={0.75} />
      </g>
    </motion.svg>
  )
}
