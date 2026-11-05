'use client'

import { useEffect, useState } from 'react'
import { isTauri } from './miner/bridge'

/**
 * Where the UI is running, which decides the window chrome:
 *  - 'mac-app'   Tauri on macOS: the title bar is transparent and the system traffic lights sit over
 *                the sidebar, so the sidebar reserves room for them.
 *  - 'desktop'   Tauri on Windows/Linux: the OS draws its own title bar above the window.
 *  - 'web'       browser preview: no system controls at all.
 */
export type Platform = 'mac-app' | 'desktop' | 'web'

function detect(): Platform {
  if (typeof window === 'undefined') return 'web'
  const mac = /Mac/i.test(navigator.userAgent) && !/iPhone|iPad/i.test(navigator.userAgent)
  if (isTauri()) return mac ? 'mac-app' : 'desktop'
  return 'web'
}

export function usePlatform(): Platform {
  const [p, setP] = useState<Platform>('web')
  useEffect(() => {
    const d = detect()
    setP(d)
    document.documentElement.dataset.platform = d
  }, [])
  return p
}
