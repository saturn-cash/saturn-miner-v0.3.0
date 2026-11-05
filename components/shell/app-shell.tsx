'use client'

import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useState } from 'react'
import { sound } from '@/lib/audio/sound'
import { cosmos } from '@/lib/cosmos/store'
import { useMiner } from '@/lib/miner/store'
import { usePlatform } from '@/lib/platform'
import { CosmosView } from '../cosmos/cosmos-view'
import { ActivityScreen } from '../screens/activity-screen'
import { DiagnosticsScreen } from '../screens/diagnostics-screen'
import { HardwareScreen } from '../screens/hardware-screen'
import { MiningScreen } from '../screens/mining-screen'
import { NetworkScreen } from '../screens/network-screen'
import { OverviewScreen } from '../screens/overview-screen'
import { SettingsScreen } from '../screens/settings-screen'
import { WalletScreen } from '../screens/wallet-screen'
import { BootSequence } from './boot-sequence'
import type { ScreenId } from './destinations'
import { Sidebar } from './sidebar'
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
  const platform = usePlatform()

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
      {/* a soft vignette keeps content legible over the bright side of the planet */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_72%_42%,transparent_28%,rgb(0_0_0/0.5)_100%)]" />

      <BootSequence onDone={finishBoot} cinematic={cinematic} />

      <div className="relative z-10 flex h-dvh">
        <Sidebar active={screen} onSelect={go} platform={platform} />
        <div className="relative flex min-w-0 flex-1 flex-col">
          <Topbar screen={screen} />
          <main className="flex-1 overflow-y-auto px-5 pb-24 pt-5 md:px-7 md:pb-8">
            {booted && (
              <AnimatePresence mode="wait">
                <motion.div
                  key={screen}
                  initial={cinematic ? { opacity: 0, y: 6 } : false}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.22, ease: [0.25, 0.1, 0.25, 1] }}
                  // no filter on this wrapper: an ancestor filter stops the panels from blurring the scene behind them
                  className="mx-auto max-w-[1280px]"
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

      {/* narrow windows (browser preview on a phone) fall back to the bottom tab bar */}
      <div className="md:hidden">
        <TabBar active={screen} onSelect={go} />
      </div>
      <Supernova />
    </div>
  )
}
