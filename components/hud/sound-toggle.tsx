'use client'

import { Volume2, VolumeX } from 'lucide-react'
import { sound } from '@/lib/audio/sound'
import { minerActions, useMiner } from '@/lib/miner/store'
import { cn } from '@/lib/utils'

/**
 * Mute / unmute everything (share pings, the block bell, the drone, warps). Animations are not
 * affected. Same switch as Settings → Sound.
 */
export function SoundToggle({ className, withLabel = false }: { className?: string; withLabel?: boolean }) {
  const on = useMiner((s) => s.settings.sound)
  const toggle = () => {
    minerActions.updateSettings({ sound: !on })
    if (!on) {
      sound.unlock()
      // a ping so you hear it came back on
      window.setTimeout(() => sound.share(), 120)
    }
  }
  const Icon = on ? Volume2 : VolumeX
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={!on}
      aria-label={on ? 'Mute sounds' : 'Unmute sounds'}
      title={on ? 'Mute sounds (share pings, block bell, engine)' : 'Sounds are off. Click to turn them on'}
      className={cn(
        'inline-flex h-[26px] shrink-0 items-center gap-1.5 rounded-md px-2 text-[12px] font-medium shadow-[inset_0_0_0_0.5px_rgb(255_255_255/0.1)] transition-colors',
        on ? 'bg-white/[0.06] text-white/80 hover:bg-white/[0.12]' : 'bg-[rgb(255_69_58/0.16)] text-[#ff8a80] hover:bg-[rgb(255_69_58/0.24)]',
        className,
      )}
    >
      <Icon className="size-[15px]" aria-hidden="true" />
      {withLabel && <span>{on ? 'Sound on' : 'Muted'}</span>}
    </button>
  )
}
