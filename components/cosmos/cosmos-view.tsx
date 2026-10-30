'use client'

import dynamic from 'next/dynamic'
import { useEffect, useRef } from 'react'
import { sound } from '@/lib/audio/sound'
import { celebrate, cosmos } from '@/lib/cosmos/store'
import { useMiner } from '@/lib/miner/store'

const CosmosScene = dynamic(() => import('./cosmos-scene'), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-[var(--void)]" />,
})

const PEAK_HS = 14.5e6 * 16

/** The whole app floats in this: one persistent WebGL universe behind every screen. */
export function CosmosView({ reducedMotion }: { reducedMotion: boolean }) {
  const hashrate = useMiner((s) => s.hashrate)
  const accepted = useMiner((s) => s.acceptedShares)
  const blocksFound = useMiner((s) => s.blocksFound)
  const latest = useMiner((s) => s.blocks[0])
  const status = useMiner((s) => s.status)
  const animations = useMiner((s) => s.settings.animations)
  const fpsCap = useMiner((s) => s.settings.fpsCap)
  const energy = Math.min(1, hashrate / (PEAK_HS * 0.5))

  useEffect(() => {
    sound.setEnergy(energy)
  }, [energy])

  const prevAccepted = useRef(accepted)
  useEffect(() => {
    if (accepted > prevAccepted.current) {
      cosmos.comet()
      sound.share()
    }
    prevAccepted.current = accepted
  }, [accepted])

  const prevBlocks = useRef(blocksFound)
  useEffect(() => {
    if (blocksFound > prevBlocks.current && latest?.minedByYou) celebrate(latest.height, latest.reward)
    prevBlocks.current = blocksFound
  }, [blocksFound, latest])

  const prevStatus = useRef(status)
  useEffect(() => {
    if (prevStatus.current !== 'mining' && status === 'mining') cosmos.kick(0.5, 1)
    if (prevStatus.current === 'idle' && status === 'starting') sound.ignite()
    if (prevStatus.current === 'mining' && status !== 'mining') {
      cosmos.kick(0.25, 0.3)
      sound.powerDown()
    }
    prevStatus.current = status
  }, [status])

  return (
    <div className="fixed inset-0 -z-0" aria-hidden="true">
      <CosmosScene energy={energy} pulseKey={accepted + blocksFound * 1000} animate={animations && !reducedMotion} fpsCap={fpsCap} />
    </div>
  )
}
