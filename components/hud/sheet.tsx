'use client'

import { AnimatePresence, motion } from 'motion/react'
import { type ReactNode, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

interface SheetProps {
  open: boolean
  onClose: () => void
  title: string
  /** one line under the title, like a macOS sheet's informative text */
  message?: string
  children: ReactNode
  /** buttons, right-aligned in the footer (Cancel first, default action last) */
  footer?: ReactNode
  width?: number
}

/**
 * macOS sheet: drops down from just under the toolbar over a dimmed window, centred on the content
 * area. Esc or a click on the dimmed area dismisses it; focus moves into it on open and back on close.
 */
export function Sheet({ open, onClose, title, message, children, footer, width = 440 }: SheetProps) {
  const panel = useRef<HTMLDivElement>(null)
  const returnFocus = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    returnFocus.current = document.activeElement as HTMLElement | null
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    const t = window.setTimeout(() => {
      const first = panel.current?.querySelector<HTMLElement>('input, select, textarea, button:not([data-sheet-cancel])')
      first?.focus()
    }, 60)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.clearTimeout(t)
      returnFocus.current?.focus?.()
    }
  }, [open, onClose])

  if (typeof document === 'undefined') return null
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div key="sheet" className="fixed inset-0 z-50 md:left-[220px]" initial={{ opacity: 1 }} exit={{ opacity: 1 }}>
          <motion.div
            className="absolute inset-0 top-[52px] bg-black/35"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            aria-hidden="true"
          />
          <motion.div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className="absolute left-1/2 top-[52px] max-w-[calc(100%-32px)] overflow-hidden rounded-b-[12px] rounded-t-[4px] bg-[rgb(40_40_44/0.92)] shadow-[0_0_0_0.5px_rgb(255_255_255/0.12),0_24px_60px_rgb(0_0_0/0.55)] backdrop-blur-[40px] backdrop-saturate-[180%]"
            style={{ width, x: '-50%', transformOrigin: 'top center' }}
            initial={{ y: '-104%' }}
            animate={{ y: 0 }}
            exit={{ y: '-104%' }}
            transition={{ type: 'spring', stiffness: 420, damping: 38, mass: 0.9 }}
          >
            <div className="px-5 pb-4 pt-5">
              <h2 className="t-headline">{title}</h2>
              {message && <p className="t-callout secondary mt-1">{message}</p>}
              <div className="mt-4">{children}</div>
            </div>
            {footer && <div className="flex justify-end gap-2 px-5 pb-5">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
