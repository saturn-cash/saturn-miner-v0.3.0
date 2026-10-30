'use client'

import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useState } from 'react'
import { sound } from '@/lib/audio/sound'
import { cosmos } from '@/lib/cosmos/store'
import { useMiner } from '@/lib/miner/store'
import { CosmosView } from '../cosmos/cosmos-view'
import { ActivityScreen } from '../screens/activity-screen'
import { DiagnosticsScreen } from '../screens/diagnostics-screen'
import { HardwareScreen } from '../screens/hardware-screen'
import { MiningScreen } from '../screens/mining-screen'
import { NetworkScreen } from '../screens/network-screen'
import { OverviewScreen } from '../screens/overview-screen'
import { SettingsScreen } from '../screens/settings-screen'
import { WalletScreen } from '../screens/wallet-screen'
import { ArrivalCard } from './arrival-card'
import { BootSequence } from './boot-sequence'
import type { ScreenId } from './destinations'
import { TabBar } from './tab-bar'
import { Supernova } from './supernova'
import { Topbar } from './topbar'

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(mq.matches)
    const on = () => setReduced(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return reduced
}

const FAR = new Set<ScreenId>(['wallet', 'network', 'activity', 'hardware'])

function useSoundSettings() {
  const enabled = useMiner((s) => s.settings.sound)
  const volume = useMiner((s) => s.settings.volume)
  useEffect(() => {
    sound.configure({ enabled, volume })
  }, [enabled, volume])
  useEffect(() => {
    // browsers only start audio after a gesture; the first click or key press unlocks it
    const unlock = () => sound.unlock()
    window.addEventListener('pointerdown', unlock)
    window.addEventListener('keydown', unlock)
    return () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
  }, [])
}

export default function AppShell() {
  useSoundSettings()
  const [booted, setBooted] = useState(false)
  const [screen, setScreen] = useState<ScreenId>('overview')
  const [visit, setVisit] = useState(0)
  const animations = useMiner((s) => s.settings.animations)
  const reduced = usePrefersReducedMotion()
  const cinematic = animations && !reduced

  const finishBoot = useCallback(() => setBooted(true), [])

  const go = useCallback(
    (id: ScreenId) => {
      if (id === screen) return
      setScreen(id)
      setVisit((v) => v + 1)
      cosmos.travelTo(id)
      sound.click()
      if (cinematic) {
        sound.warp(FAR.has(id) ? 1.2 : 0.75)
        window.setTimeout(() => sound.arrive(), FAR.has(id) ? 1700 : 1200)
      }
    },
    [screen, cinematic],
  )

  return (
    <div data-motion={cinematic ? 'on' : 'off'} className="relative h-dvh overflow-hidden text-foreground">
      <CosmosView reducedMotion={reduced} />
      {/* scrims keep text legible over the brightest parts of the planet */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_70%_40%,transparent_30%,rgb(5_3_13/0.55)_100%)]" />
      <div aria-hidden="true" className="pointer-events-none fixed inset-y-0 left-0 w-[45vw] bg-gradient-to-r from-[rgb(5_3_13/0.45)] to-transparent" />

      <BootSequence onDone={finishBoot} cinematic={cinematic} />

      <div className="relative z-10 flex h-dvh">
        <div className="relative flex min-w-0 flex-1 flex-col">
          <Topbar screen={screen} />
          <main className="flex-1 overflow-y-auto px-5 pb-32 pt-4 md:px-10">
            {booted && (
              <AnimatePresence mode="wait">
                <motion.div
                  key={screen}
                  initial={cinematic ? { opacity: 0, scale: 0.96, y: 12 } : false}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={cinematic ? { opacity: 0, scale: 1.02, y: -8 } : { opacity: 0 }}
                  transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1], delay: cinematic ? (visit > 0 ? 0.35 : 0.55) : 0 }}
                  // no filter on this wrapper: an ancestor filter stops the glass panels from blurring the planet behind them
                  className="mx-auto max-w-[1480px] origin-top"
                >
                  {screen === 'overview' && <OverviewScreen onNavigate={go} />}
                  {screen === 'mining' && <MiningScreen />}
                  {screen === 'wallet' && <WalletScreen />}
                  {screen === 'hardware' && <HardwareScreen />}
                  {screen === 'network' && <NetworkScreen />}
                  {screen === 'activity' && <ActivityScreen />}
                  {screen === 'diagnostics' && <DiagnosticsScreen />}
                  {screen === 'settings' && <SettingsScreen />}
                </motion.div>
              </AnimatePresence>
            )}
          </main>
        </div>
      </div>

      <TabBar active={screen} onSelect={go} />
      {cinematic && <ArrivalCard screen={screen} visitKey={visit} />}
      <Supernova />
    </div>
  )
}
