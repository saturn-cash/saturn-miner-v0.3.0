'use client'

import { useEffect, useState } from 'react'
import { invokeCommand } from '@/lib/miner/bridge'

const win = (cmd: string) => invokeCommand(`plugin:window|${cmd}`, { label: 'main' })

/**
 * Minimise / maximise / close for Windows and Linux, where the app draws its own title bar.
 * Sized and placed like Windows 11's caption buttons: 46×52 at the trailing edge, red close on hover.
 */
export function WindowControls() {
  const [max, setMax] = useState(false)
  useEffect(() => {
    const check = () => void win('is_maximized').then((m) => setMax(!!m), () => {})
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])
  const btn = 'grid h-[52px] w-[46px] place-items-center text-white/80 transition-colors hover:bg-white/[0.08] hover:text-white'
  return (
    <div className="-mr-5 ml-1 flex self-stretch" aria-label="Window">
      <button type="button" className={btn} aria-label="Minimise" onClick={() => void win('minimize')}>
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M0 5h10" stroke="currentColor" strokeWidth="1" /></svg>
      </button>
      <button type="button" className={btn} aria-label={max ? 'Restore' : 'Maximise'} onClick={() => void win('toggle_maximize')}>
        {max ? (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true"><path d="M2.5 2.5V.5h7v7h-2" stroke="currentColor" /><rect x=".5" y="2.5" width="7" height="7" stroke="currentColor" /></svg>
        ) : (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true"><rect x=".5" y=".5" width="9" height="9" stroke="currentColor" /></svg>
        )}
      </button>
      <button type="button" className={`${btn} hover:!bg-[#c42b1c]`} aria-label="Close" onClick={() => void win('close')}>
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M.5.5l9 9M9.5.5l-9 9" stroke="currentColor" strokeWidth="1" /></svg>
      </button>
    </div>
  )
}
