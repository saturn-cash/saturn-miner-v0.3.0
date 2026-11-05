'use client'

import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'

/**
 * Cobwebs and dust on the reactor while it sits idle: proof of work, the old way, gathering dust.
 * Starting the miner tears them away in a puff of dust; leave it idle for a while and they slowly
 * spin themselves back, little spider included.
 */

// a tiny seeded random, so the webs look hand-made but the same every time
function rng(seed: number) {
  let s = seed
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

/** A corner web: spokes fanning out from (cx, cy) between two angles, sagging threads between them. */
function webPaths(cx: number, cy: number, from: number, to: number, radius: number, spokes: number, rings: number, seed: number) {
  const r = rng(seed)
  const angles = Array.from({ length: spokes }, (_, i) => from + ((to - from) * i) / (spokes - 1) + (r() - 0.5) * 0.08)
  const reach = angles.map(() => radius * (0.82 + r() * 0.3))
  const paths: string[] = []
  angles.forEach((a, i) => paths.push(`M${cx},${cy} L${(cx + Math.cos(a) * reach[i]).toFixed(1)},${(cy + Math.sin(a) * reach[i]).toFixed(1)}`))
  for (let k = 1; k <= rings; k++) {
    const f = (k / (rings + 0.6)) ** 1.15
    let d = ''
    for (let i = 0; i < spokes - 1; i++) {
      const r1 = reach[i] * f * (0.95 + r() * 0.1)
      const r2 = reach[i + 1] * f * (0.95 + r() * 0.1)
      const p1 = [cx + Math.cos(angles[i]) * r1, cy + Math.sin(angles[i]) * r1]
      const p2 = [cx + Math.cos(angles[i + 1]) * r2, cy + Math.sin(angles[i + 1]) * r2]
      // threads sag toward the centre of the web
      const mid = (angles[i] + angles[i + 1]) / 2
      const sag = ((r1 + r2) / 2) * (0.78 + r() * 0.08)
      const c = [cx + Math.cos(mid) * sag, cy + Math.sin(mid) * sag]
      d += `${i === 0 ? `M${p1[0].toFixed(1)},${p1[1].toFixed(1)}` : ''} Q${c[0].toFixed(1)},${c[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`
    }
    // one or two threads are broken, like a real old web
    if (r() > 0.25) paths.push(d)
  }
  return paths
}

export function Cobwebs({ idle }: { idle: boolean }) {
  // shown from the start (it's been sitting there), torn down on start, regrown after 12 s idle
  const [shown, setShown] = useState(idle)
  const [puff, setPuff] = useState(0)
  useEffect(() => {
    if (!idle) {
      if (shown) setPuff((p) => p + 1)
      setShown(false)
      return
    }
    const t = window.setTimeout(() => setShown(true), 12_000)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idle])

  const webs = useMemo(
    () => [
      { key: 'tl', paths: webPaths(4, 8, 0.05, Math.PI / 2 - 0.05, 40, 7, 6, 7) },
      { key: 'br', paths: webPaths(97, 93, Math.PI + 0.1, Math.PI * 1.5 - 0.05, 30, 6, 5, 21) },
      { key: 'tr', paths: webPaths(97, 4, Math.PI / 2 + 0.15, Math.PI - 0.1, 17, 5, 3, 33) },
    ],
    [],
  )
  const dust = useMemo(() => {
    const r = rng(99)
    return Array.from({ length: 18 }, () => ({ a: r() * Math.PI * 2, d: 30 + r() * 45, s: 0.6 + r() * 1.4, delay: r() * 0.15 }))
  }, [])

  return (
    <>
      <AnimatePresence>
        {shown && (
          <motion.svg
            key="webs"
            viewBox="0 0 100 100"
            className="pointer-events-none absolute inset-[-6%] z-20 overflow-visible"
            aria-hidden="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            // torn away: the threads fling outward and vanish
            exit={{ opacity: 0, scale: 1.35, rotate: -6, transition: { duration: 0.45, ease: [0.2, 0.8, 0.2, 1] } }}
            transition={{ duration: 0.6 }}
          >
            {webs.map((w) => (
              <g key={w.key} fill="none" stroke="rgb(235 230 220)" strokeWidth="0.35" strokeOpacity="0.42" strokeLinecap="round">
                {w.paths.map((d, i) => (
                  // threads spin themselves in, one after another
                  <motion.path key={i} d={d} initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.4, delay: 0.25 + i * 0.12, ease: 'easeOut' }} />
                ))}
              </g>
            ))}
            {/* dust caught in the webs */}
            {[
              [14, 18], [22, 9], [9, 27], [27, 25], [86, 82], [80, 89], [90, 76], [88, 12],
            ].map(([x, y], i) => (
              <circle key={i} cx={x} cy={y} r={0.55} fill="rgb(220 214 200)" opacity={0.5} />
            ))}
            {/* a small spider, dangling from the top and bobbing on its thread */}
            <motion.g animate={{ y: [0, 3.5, 0] }} transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}>
              <line x1="66" y1="-12" x2="66" y2="9" stroke="rgb(235 230 220)" strokeWidth="0.3" strokeOpacity="0.5" />
              <g transform="translate(66 10.5)" fill="rgb(30 28 26)" stroke="rgb(200 194 182)" strokeWidth="0.3">
                {[-1, 1].map((s) =>
                  [0, 1, 2, 3].map((k) => (
                    <path key={`${s}${k}`} d={`M0,0 Q${s * 2.2},${-1.6 + k * 1.1} ${s * 3.3},${-0.6 + k * 1.3}`} fill="none" strokeOpacity="0.8" />
                  )),
                )}
                <ellipse rx="1.15" ry="1.5" cy="0.6" />
                <circle r="0.8" cy="-1.2" />
              </g>
            </motion.g>
          </motion.svg>
        )}
      </AnimatePresence>

      {/* dust on the glass while it's been sitting */}
      <AnimatePresence>
        {shown && (
          <motion.span
            key="grime"
            aria-hidden="true"
            className="hex pointer-events-none absolute z-[15]"
            style={{
              inset: '17%',
              backgroundImage:
                "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='1.3' numOctaves='2' seed='4'/%3E%3CfeColorMatrix values='0 0 0 0 0.86 0 0 0 0 0.83 0 0 0 0 0.78 0 0 0 9 -6.2'/%3E%3C/filter%3E%3Crect width='120' height='120' filter='url(%23n)'/%3E%3C/svg%3E\")",
              mixBlendMode: 'screen',
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.55 }}
            exit={{ opacity: 0, transition: { duration: 0.3 } }}
            transition={{ duration: 3 }}
          />
        )}
      </AnimatePresence>

      {/* the puff of dust when the webs tear */}
      <AnimatePresence>
        {puff > 0 && (
          <motion.span key={puff} className="pointer-events-none absolute inset-0 z-30" aria-hidden="true" initial={{ opacity: 1 }} animate={{ opacity: 0 }} transition={{ duration: 1.4, delay: 0.6 }}>
            {dust.map((p, i) => (
              <motion.span
                key={i}
                className="absolute left-1/2 top-1/2 rounded-full bg-[rgb(225_218_204)]"
                style={{ width: p.s * 3, height: p.s * 3, marginLeft: -p.s * 1.5, marginTop: -p.s * 1.5, filter: 'blur(0.5px)' }}
                initial={{ x: Math.cos(p.a) * p.d * 0.55, y: Math.sin(p.a) * p.d * 0.55, opacity: 0.8 }}
                animate={{ x: Math.cos(p.a) * p.d * 1.4, y: Math.sin(p.a) * p.d * 1.4 + 14, opacity: 0 }}
                transition={{ duration: 1.3, delay: p.delay, ease: 'easeOut' }}
              />
            ))}
          </motion.span>
        )}
      </AnimatePresence>
    </>
  )
}
