'use client'

import { ArrowDownLeft, ArrowUpRight, Check, Copy, Pickaxe } from 'lucide-react'
import { motion } from 'motion/react'
import { useState } from 'react'
import { formatCoin, shortHash, timeAgo } from '@/lib/format'
import { minerActions, useMiner } from '@/lib/miner/store'
import { cn } from '@/lib/utils'
import { NodeNotice } from '../hud/node-notice'
import { Label, Panel } from '../hud/panel'
import { Ticker } from '../hud/ticker'

const TX_META = {
  reward: { icon: Pickaxe, label: 'Block reward', tone: 'text-[#241304] bg-primary' },
  receive: { icon: ArrowDownLeft, label: 'Received', tone: 'text-accent-foreground bg-accent' },
  send: { icon: ArrowUpRight, label: 'Sent', tone: 'text-foreground bg-[rgb(234_240_255/0.14)]' },
} as const

export function WalletScreen() {
  const wallet = useMiner((s) => s.wallet)
  const source = useMiner((s) => s.source)
  const nodeWallet = useMiner((s) => s.node.connected && s.node.hasWallet)
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    await navigator.clipboard?.writeText(wallet.address).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  return (
    <div className="grid gap-5 xl:grid-cols-3">
      <section className="flex min-h-[min(44vh,420px)] flex-col justify-end pb-2 xl:col-span-3" aria-label="Balance">
        <Label className="text-foreground/75">Available to spend</Label>
        <p className="mt-1 flex flex-wrap items-baseline gap-4">
          <Ticker value={wallet.balance} format={(n) => formatCoin(n, 4)} className="display gold-text text-[clamp(44px,4.8vw,68px)] [text-shadow:0_2px_30px_rgb(0_0_0/0.35)]" />
          <span className="text-[clamp(17px,1.6vw,22px)] font-medium text-white/55">SAT</span>
        </p>
        <dl className="glass-quiet mt-6 grid max-w-[560px] grid-cols-2 gap-px overflow-hidden !rounded-xl backdrop-blur-xl">
          <div className="bg-[rgb(28_28_30/0.6)] px-5 py-4">
            <dt className="t-subhead secondary">Maturing</dt>
            <dd className="display mt-1 text-[18px] tabular-nums">
              <Ticker value={wallet.immature} format={(n) => formatCoin(n, 4)} /> SAT
            </dd>
          </div>
          <div className="bg-[rgb(28_28_30/0.6)] px-5 py-4">
            <dt className="t-subhead secondary">Total</dt>
            <dd className="display mt-1 text-[18px] tabular-nums">
              <Ticker value={wallet.balance + wallet.immature} format={(n) => formatCoin(n, 4)} /> SAT
            </dd>
          </div>
        </dl>
      </section>


      <div className="xl:col-span-3 empty:hidden">
        <NodeNotice what="Your balance and transactions" />
      </div>

      <Panel title="Transactions" className="xl:col-span-2">
        {wallet.transactions.length === 0 ? (
          <p className="py-8 text-center text-[13px] text-muted-foreground">{source === 'tauri' && !nodeWallet ? 'Connect a Saturn Core node with a wallet to see transactions here.' : 'No transactions yet. Start mining to earn your first reward.'}</p>
        ) : (
          <ul className="divide-y divide-[rgb(234_240_255/0.06)]">
            {wallet.transactions.slice(0, 14).map((tx, i) => {
              const meta = TX_META[tx.type]
              const Icon = meta.icon
              const mature = tx.type !== 'reward' || tx.confirmations >= 100
              return (
                <motion.li key={tx.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i * 0.03, 0.3) }} className="flex items-center gap-4 py-3">
                  <span className={cn('hex grid size-10 shrink-0 place-items-center', meta.tone)}>
                    <Icon className="size-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px]">{meta.label}</p>
                    <p className="truncate font-mono t-subhead secondary">{shortHash(tx.address, 12, 6)}</p>
                  </div>
                  <div className="hidden w-40 sm:block">
                    <div className="h-1 overflow-hidden rounded-full bg-muted">
                      <motion.div className={cn('h-full', mature ? 'bg-accent' : 'bg-primary')} animate={{ width: `${Math.min(100, tx.confirmations)}%` }} />
                    </div>
                    <p className="mt-1 t-subhead secondary">{tx.confirmations >= 100 ? '100+' : tx.confirmations} confirmations</p>
                  </div>
                  <div className="text-right">
                    <p className={cn('display text-[15px] tabular-nums', tx.type === 'send' ? 'text-muted-foreground' : 'text-primary')}>
                      {tx.type === 'send' ? '−' : '+'}
                      {formatCoin(Math.abs(tx.amount), 4)}
                    </p>
                    <p className="t-subhead secondary">{timeAgo(tx.time)}</p>
                  </div>
                </motion.li>
              )
            })}
          </ul>
        )}
      </Panel>

      <Panel title="Receive" className="self-start">
        <Label>Mining payout address</Label>
        <p className="mt-2 break-all well p-3 font-mono text-xs leading-relaxed text-foreground">{wallet.address || 'No payout address yet. Set one on the Mining screen.'}</p>
        {nodeWallet && (
          <button
            type="button"
            onClick={() => void minerActions.useNodeAddress()}
            className="mac-button mt-3 w-full"
          >
            Use a fresh address from my node's wallet
          </button>
        )}
        <button
          type="button"
          onClick={copy}
          className="mac-button mt-3 w-full"
        >
          {copied ? <Check className="size-3.5" aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />}
          {copied ? 'Copied' : 'Copy address'}
        </button>
        <p className="mt-4 t-subhead secondary leading-relaxed">Rewards from solo blocks and pool payouts land here. Keep your wallet backed up from Saturn Core.</p>
      </Panel>
    </div>
  )
}
