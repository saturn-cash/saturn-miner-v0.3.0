'use client'

import { Download, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect } from 'react'
import { updater, useUpdate } from '@/lib/updater'

/** "Saturn 0.8.7 is ready": one click downloads it, installs it and restarts into it. */
export function UpdateBanner() {
  const u = useUpdate()
  useEffect(() => updater.start(), [])
  const show = (u.phase === 'available' && !u.dismissed) || u.phase === 'installing'
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="update"
          role="status"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          transition={{ type: 'spring', stiffness: 380, damping: 30 }}
          className="fixed bottom-5 right-5 z-50 max-w-sm"
        >
          <div className="glass flex items-center gap-3 rounded-2xl px-4 py-3 shadow-2xl">
          <span className="spectrum-fill grid size-9 shrink-0 place-items-center rounded-full">
            <Download className="size-4 text-white" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="t-body font-semibold">{u.phase === 'installing' ? `Installing Saturn ${u.version}…` : `Saturn ${u.version} is ready`}</p>
            <p className="t-subhead secondary">{u.phase === 'installing' ? 'Saturn restarts on its own when it’s done.' : 'Your wallet and settings stay as they are.'}</p>
          </div>
          {u.phase === 'available' && (
            <>
              <button type="button" data-variant="primary" className="mac-button shrink-0" onClick={() => updater.install()}>
                Update
              </button>
              <button type="button" aria-label="Later" className="secondary shrink-0 rounded-full p-1 hover:text-white" onClick={() => updater.dismiss()}>
                <X className="size-4" aria-hidden="true" />
              </button>
            </>
          )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
