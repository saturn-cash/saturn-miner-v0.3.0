'use client'

import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { MOON_COUNT, MOONS, moonClock, moonPosition, sceneDistance } from '@/lib/cosmos/moons'
import { useCosmosUi } from '@/lib/cosmos/store'
import type { ScreenId } from './destinations'

/** Top-down map of the Saturn system: every major moon on its orbit, plus the ship's live position. */

const W = 208
const H = 96
const CX = W / 2
const CY = H / 2 + 2
const R = 62
const SQUASH = 0.56
const MAX = 50

function scale(r: number) {
  return R * Math.pow(Math.min(r, MAX) / MAX, 0.6)
}

function project(x: number, z: number) {
  const r = Math.hypot(x, z)
  if (r < 1e-6) return { x: CX, y: CY }
  const rr = scale(r)
  return { x: CX + (x / r) * rr, y: CY + (z / r) * rr * SQUASH }
}

const MAJOR = MOONS.filter((m) => m.kind === 'major' || m.kind === 'outer')
const DEST_MOON: Partial<Record<ScreenId, string>> = { wallet: 'Titan', hardware: 'Mimas', network: 'Iapetus', activity: 'Enceladus' }
const ALWAYS_LABEL = new Set(['Titan', 'Iapetus'])
const _p = new THREE.Vector3()

export function FlightMap({ active }: { active: ScreenId }) {
  const x = useCosmosUi((s) => s.x)
  const z = useCosmosUi((s) => s.z)
  const traveling = useCosmosUi((s) => s.traveling)
  const trail = useRef<Array<{ x: number; y: number }>>([])
  const [, tick] = useState(0)

  // moons keep orbiting; redraw once a second
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [])

  const ship = project(x, z)
  useEffect(() => {
    const last = trail.current[trail.current.length - 1]
    if (!last || Math.hypot(last.x - ship.x, last.y - ship.y) > 0.6) trail.current = [...trail.current.slice(-34), ship]
  }, [ship.x, ship.y]) // eslint-disable-line react-hooks/exhaustive-deps

  const t = moonClock()
  const target = DEST_MOON[active]
  const pts = trail.current

  return (
    <div className="overflow-hidden px-1 pb-0.5 pt-1">
      <div className="flex items-baseline justify-between">
        <p className="text-[13px] font-semibold leading-none">Flight map</p>
        <p className={traveling ? 'text-[11px] leading-none text-accent' : 'text-[11px] leading-none text-muted-foreground'}>{traveling ? 'Warping' : `${MOON_COUNT} moons`}</p>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-1 w-full" role="img" aria-label="Map of the Saturn system showing its moons and your ship">
        <defs>
          <radialGradient id="fm-saturn" cx="0.35" cy="0.35">
            <stop offset="0%" stopColor="#fff1d6" />
            <stop offset="100%" stopColor="#c27a3a" />
          </radialGradient>
        </defs>
        {MAJOR.map((m) => {
          const r = scale(sceneDistance(m.orbitKm))
          return <ellipse key={`o-${m.name}`} cx={CX} cy={CY} rx={r} ry={r * SQUASH} fill="none" stroke="rgb(234 240 255 / 0.08)" strokeDasharray="1.5 3" />
        })}
        <ellipse cx={CX} cy={CY} rx={scale(2.35)} ry={scale(2.35) * SQUASH * 0.5} fill="none" stroke="#f2b66d" strokeOpacity="0.6" strokeWidth="1.1" />
        <circle cx={CX} cy={CY} r={4.5} fill="url(#fm-saturn)" />
        {MAJOR.map((m) => {
          moonPosition(m, t, _p)
          const p = project(_p.x, _p.z)
          const isTarget = m.name === target
          const label = isTarget || ALWAYS_LABEL.has(m.name)
          const right = p.x > CX
          return (
            <g key={m.name}>
              <title>{m.name}</title>
              {isTarget && <circle cx={p.x} cy={p.y} r={5} fill="none" stroke="#f2b66d" strokeOpacity="0.8" />}
              <circle cx={p.x} cy={p.y} r={m.name === 'Titan' ? 2.8 : isTarget ? 2.4 : 1.6} fill={m.name === 'Titan' ? '#f0a14a' : m.name === 'Iapetus' ? '#9c8f80' : '#dfe6f2'} />
              {label && (
                <text x={right ? p.x + 5 : p.x - 5} y={p.y + 3} textAnchor={right ? 'start' : 'end'} fontSize="8" fill={isTarget ? '#f2b66d' : 'rgb(234 240 255 / 0.55)'} fontFamily="var(--font-sans)">
                  {m.name}
                </text>
              )}
            </g>
          )
        })}
        {pts.length > 1 && <polyline points={pts.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke="#5fe3d0" strokeOpacity="0.5" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />}
        <circle cx={ship.x} cy={ship.y} r={4.5} fill="#5fe3d0" opacity="0.25">
          <animate attributeName="r" values="3;8;3" dur="1.6s" repeatCount="indefinite" />
        </circle>
        <circle cx={ship.x} cy={ship.y} r={2.2} fill="#eaffff" />
      </svg>
    </div>
  )
}
