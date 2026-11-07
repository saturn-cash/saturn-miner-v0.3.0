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

  // a small hexagon reticle around the destination moon
  const hex = (cx: number, cy: number, r: number) =>
    [0, 60, 120, 180, 240, 300].map((a) => `${(cx + r * Math.cos((a * Math.PI) / 180)).toFixed(1)},${(cy + r * Math.sin((a * Math.PI) / 180)).toFixed(1)}`).join(' ')

  return (
    <div className="holo-scan overflow-hidden rounded-md px-1 pb-0.5 pt-1">
      <div className="flex items-baseline justify-between">
        <p className="holo-text font-mono text-[11px] uppercase leading-none tracking-[0.14em]">Flight map</p>
        <p className="holo-text font-mono text-[10px] uppercase leading-none tracking-[0.12em] opacity-75">{traveling ? 'Warping' : `${MOON_COUNT} moons`}</p>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="holo-glow mt-1.5 w-full" role="img" aria-label="Map of the Saturn system showing its moons and your ship">
        {/* crosshair through Saturn */}
        <line x1={CX - R - 6} y1={CY} x2={CX + R + 6} y2={CY} stroke="rgb(61 255 139 / 0.12)" strokeWidth="0.6" />
        <line x1={CX} y1={CY - R * SQUASH - 6} x2={CX} y2={CY + R * SQUASH + 6} stroke="rgb(61 255 139 / 0.12)" strokeWidth="0.6" />
        {MAJOR.map((m) => {
          const r = scale(sceneDistance(m.orbitKm))
          return <ellipse key={`o-${m.name}`} cx={CX} cy={CY} rx={r} ry={r * SQUASH} fill="none" stroke="rgb(61 255 139 / 0.28)" strokeWidth="0.7" strokeDasharray="1.5 3" />
        })}
        {/* Saturn: the outline mark, small */}
        <g transform={`translate(${CX} ${CY}) scale(0.16)`} stroke="rgb(61 255 139)" fill="none" strokeLinecap="round">
          <g transform="rotate(-20)">
            <path d="M-45,0 A45,12.5 0 0,1 45,0" strokeWidth="4" opacity="0.6" />
            <circle r="19" strokeWidth="5" fill="rgb(4 12 8)" />
            <path d="M-45,0 A45,12.5 0 0,0 45,0" strokeWidth="5" />
          </g>
        </g>
        {MAJOR.map((m) => {
          moonPosition(m, t, _p)
          const p = project(_p.x, _p.z)
          const isTarget = m.name === target
          const label = isTarget || ALWAYS_LABEL.has(m.name)
          const right = p.x > CX
          return (
            <g key={m.name}>
              <title>{m.name}</title>
              {isTarget && <polygon points={hex(p.x, p.y, 5.5)} fill="none" stroke="rgb(125 255 180)" strokeWidth="0.8" />}
              <circle cx={p.x} cy={p.y} r={m.name === 'Titan' ? 2.4 : isTarget ? 2 : 1.4} fill={m.name === 'Titan' ? 'rgb(125 255 180)' : 'rgb(61 255 139 / 0.75)'} />
              {label && (
                <text x={right ? p.x + 6 : p.x - 6} y={p.y + 2.8} textAnchor={right ? 'start' : 'end'} fontSize="7.5" letterSpacing="0.6" fill={isTarget ? 'rgb(170 255 205)' : 'rgb(61 255 139 / 0.65)'} fontFamily="var(--font-mono)">
                  {m.name.toUpperCase()}
                </text>
              )}
            </g>
          )
        })}
        {pts.length > 1 && <polyline points={pts.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke="rgb(200 255 222)" strokeOpacity="0.55" strokeWidth="0.9" strokeDasharray="2 1.5" strokeLinecap="round" strokeLinejoin="round" />}
        <circle cx={ship.x} cy={ship.y} r={4.5} fill="none" stroke="rgb(61 255 139)" strokeWidth="0.8" opacity="0.6">
          <animate attributeName="r" values="2.5;8;2.5" dur="1.8s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.8;0;0.8" dur="1.8s" repeatCount="indefinite" />
        </circle>
        <circle cx={ship.x} cy={ship.y} r={2} fill="rgb(220 255 235)" />
      </svg>
    </div>
  )
}
