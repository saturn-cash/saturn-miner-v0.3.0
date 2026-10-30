'use client'

import { motion } from 'motion/react'
import { cn } from '@/lib/utils'
import { SCREENS, type ScreenId } from './destinations'

/**
 * Floating glass tab bar, the way iOS 26 / macOS Tahoe do navigation: one capsule at the bottom,
 * a brighter glass "lens" slides under the selected item.
 */
export function TabBar({ active, onSelect }: { active: ScreenId; onSelect: (id: ScreenId) => void }) {
  return (
    <nav aria-label="Destinations" className="pointer-events-none fixed inset-x-0 bottom-5 z-30 flex justify-center px-3">
      <div className="glass pointer-events-auto flex max-w-full gap-0.5 overflow-x-auto !rounded-full p-1.5 [scrollbar-width:none]">
        {SCREENS.map(({ id, label, place, icon: Icon }) => {
          const on = id === active
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelect(id)}
              aria-current={on ? 'page' : undefined}
              title={`${label} (${place})`}
              className="group relative flex h-[60px] min-w-[64px] shrink-0 flex-col items-center justify-center gap-1 rounded-full px-3 outline-none focus-visible:ring-2 focus-visible:ring-white/60 md:min-w-[84px]"
            >
              {on && (
                <motion.span
                  layoutId="tab-lens"
                  className="absolute inset-0 rounded-full bg-white/[0.14] shadow-[inset_0_0.5px_0_rgb(255_255_255/0.55),inset_0_-0.5px_0_rgb(255_255_255/0.15)]"
                  transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                />
              )}
              <span className="relative grid size-7 place-items-center">
                {on && <motion.span layoutId="tab-hex" className="hex absolute inset-[-3px] bg-primary shadow-[0_0_18px_var(--primary)]" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />}
                <Icon className={cn('relative size-[17px] transition-colors', on ? 'text-[#1c1206]' : 'text-white/75 group-hover:text-white')} strokeWidth={on ? 2.3 : 1.8} aria-hidden="true" />
              </span>
              <span className={cn('relative hidden text-[10.5px] font-medium leading-none transition-colors md:block', on ? 'text-primary' : 'text-white/70 group-hover:text-white')}>
                {label === 'Mission control' ? 'Home' : label}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
