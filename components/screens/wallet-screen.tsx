'use client'

import { ArrowDownLeft, ArrowUpRight, Check, Copy, Download, KeyRound, Pickaxe, Plus, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react'
import { motion } from 'motion/react'
import { QRCodeSVG } from 'qrcode.react'
import { useState } from 'react'
import { formatCoin, shortHash, timeAgo } from '@/lib/format'
import { useMiner } from '@/lib/miner/store'
import { coinToSats, satsToCoin, useWallet, walletActions } from '@/lib/wallet/store'
import { cn } from '@/lib/utils'
import { Label, Panel } from '../hud/panel'
import { Sheet } from '../hud/sheet'
import { Ticker } from '../hud/ticker'
import { Input } from '../ui/input'

type SheetId = 'create' | 'restore' | 'send' | 'backup' | 'export' | 'remove' | null

export function WalletScreen() {
  const available = useWallet((s) => s.available)
  const loaded = useWallet((s) => s.loaded)
  const exists = useWallet((s) => s.exists)
  const [sheet, setSheet] = useState<SheetId>(null)
  const close = () => setSheet(null)

  if (!loaded) return null
  return (
    <>
      {exists ? <WalletHome open={setSheet} /> : <Welcome available={available} open={setSheet} />}
      <CreateSheet open={sheet === 'create'} onClose={close} />
      <RestoreSheet open={sheet === 'restore'} onClose={close} />
      <SendSheet open={sheet === 'send'} onClose={close} />
      <BackupSheet open={sheet === 'backup'} onClose={close} />
      <ExportSheet open={sheet === 'export'} onClose={close} />
      <RemoveSheet open={sheet === 'remove'} onClose={close} />
    </>
  )
}

/* ------------------------------------------------------------------ */
/* no wallet yet                                                       */
/* ------------------------------------------------------------------ */

function Welcome({ available, open }: { available: boolean; open: (s: SheetId) => void }) {
  return (
    <div className="grid min-h-[min(70vh,640px)] place-items-center">
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }} className="glass w-full max-w-[560px] p-8 text-center">
        <div className="relative mx-auto mb-6 grid size-20 place-items-center">
          <span className="spectrum-fill hex absolute inset-0 opacity-60 blur-xl" aria-hidden="true" />
          <span className="spectrum-fill hex absolute inset-0" aria-hidden="true" />
          <span className="hex absolute inset-[3px] grid place-items-center bg-[#1c1c1e]">
            <KeyRound className="size-7 text-white" aria-hidden="true" />
          </span>
        </div>
        <h2 className="display text-[26px]">Your Saturn wallet</h2>
        <p className="t-body secondary mx-auto mt-3 max-w-[420px] leading-relaxed">
          Create a wallet to receive your mining rewards and send SAT. Its keys are made on this computer and never leave it. You back it up with a 12-word recovery phrase.
        </p>
        {available ? (
          <div className="mt-7 flex flex-col items-center justify-center gap-2.5 sm:flex-row">
            <button type="button" className="mac-button h-9 px-5 text-[14px]" data-variant="primary" onClick={() => open('create')}>
              <Plus className="size-4" aria-hidden="true" /> Create a new wallet
            </button>
            <button type="button" className="mac-button h-9 px-5 text-[14px]" onClick={() => open('restore')}>
              <Download className="size-4" aria-hidden="true" /> Restore from a recovery phrase
            </button>
          </div>
        ) : (
          <p className="t-callout mt-6 text-warn">Wallets are created in the desktop app. This browser preview can't hold keys.</p>
        )}
      </motion.div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* wallet                                                              */
/* ------------------------------------------------------------------ */

const TX_META = {
  reward: { icon: Pickaxe, label: 'Mining reward', tone: 'text-[#241304] bg-primary' },
  receive: { icon: ArrowDownLeft, label: 'Received', tone: 'text-accent-foreground bg-accent' },
  send: { icon: ArrowUpRight, label: 'Sent', tone: 'text-foreground bg-[rgb(234_240_255/0.14)]' },
} as const

function WalletHome({ open }: { open: (s: SheetId) => void }) {
  const w = useWallet((s) => s)
  const poolPending = useMiner((s) => s.wallet.poolPending)
  const payout = useMiner((s) => s.config.payoutAddress)
  const [copied, setCopied] = useState(false)
  const spendable = satsToCoin(w.spendableSats)
  const immature = satsToCoin(w.immatureSats)

  const copy = async () => {
    await navigator.clipboard?.writeText(w.address ?? '').catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  const activity = [
    ...w.coins.map((c) => ({ id: `${c.txid}:${c.vout}`, type: c.coinbase ? ('reward' as const) : ('receive' as const), amount: satsToCoin(c.sats), conf: c.confirmations, time: null as number | null, ref: c.txid })),
    ...w.sent.map((t) => ({ id: t.txid, type: 'send' as const, amount: satsToCoin(t.amountSats), conf: -1, time: t.time, ref: t.to })),
  ].sort((a, b) => (b.time ?? Infinity) - (a.time ?? Infinity) || a.conf - b.conf)

  return (
    <div className="grid gap-5 xl:grid-cols-3">
      <section className="flex min-h-[min(40vh,380px)] flex-col justify-end pb-2 xl:col-span-3" aria-label="Balance">
        <Label className="text-foreground/75">Available to spend</Label>
        <p className="mt-1 flex flex-wrap items-baseline gap-4">
          <Ticker value={spendable} format={(n) => formatCoin(n, 4)} className="display gold-text text-[clamp(44px,4.8vw,68px)] [text-shadow:0_2px_30px_rgb(0_0_0/0.35)]" />
          <span className="text-[clamp(17px,1.6vw,22px)] font-medium text-white/55">SAT</span>
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" className="mac-button h-8 px-4" data-variant="primary" onClick={() => open('send')} disabled={w.spendableSats === 0}>
            <ArrowUpRight className="size-4" aria-hidden="true" /> Send
          </button>
          <button type="button" className="mac-button h-8 px-4" onClick={copy}>
            {copied ? <Check className="size-4" aria-hidden="true" /> : <ArrowDownLeft className="size-4" aria-hidden="true" />} {copied ? 'Address copied' : 'Receive'}
          </button>
          <button type="button" className="mac-button h-8 px-3" onClick={() => void walletActions.refresh()} aria-label="Refresh balance" title="Refresh">
            <RefreshCw className={cn('size-4', w.refreshing && 'animate-spin')} aria-hidden="true" />
          </button>
        </div>
        <dl className="glass-quiet mt-6 grid max-w-[720px] grid-cols-3 gap-px overflow-hidden !rounded-xl backdrop-blur-xl">
          <div className="bg-[rgb(28_28_30/0.6)] px-5 py-4" title="Mined coins unlock after 100 confirmations">
            <dt className="t-subhead secondary">Maturing</dt>
            <dd className="display mt-1 text-[18px] tabular-nums">
              <Ticker value={immature} format={(n) => formatCoin(n, 4)} /> SAT
            </dd>
          </div>
          <div className="bg-[rgb(28_28_30/0.6)] px-5 py-4" title="Your share of pool blocks, paid to your payout address">
            <dt className="t-subhead secondary">Pool pending</dt>
            <dd className="display mt-1 text-[18px] tabular-nums">
              <Ticker value={poolPending} format={(n) => formatCoin(n, 4)} /> SAT
            </dd>
          </div>
          <div className="bg-[rgb(28_28_30/0.6)] px-5 py-4">
            <dt className="t-subhead secondary">Total</dt>
            <dd className="display mt-1 text-[18px] tabular-nums">
              <Ticker value={spendable + immature + poolPending} format={(n) => formatCoin(n, 4)} /> SAT
            </dd>
          </div>
        </dl>
        {w.error && <p className="t-subhead mt-3 text-warn">{w.error}</p>}
      </section>

      <Panel title="Activity" meta={w.height ? `Chain height ${w.height.toLocaleString()}` : undefined} className="xl:col-span-2">
        {activity.length === 0 ? (
          <p className="py-8 text-center text-[13px] text-muted-foreground">Nothing yet. Mining rewards and payments to your address will show up here.</p>
        ) : (
          <ul className="divide-y divide-[rgb(234_240_255/0.06)]">
            {activity.slice(0, 20).map((tx, i) => {
              const meta = TX_META[tx.type]
              const Icon = meta.icon
              const mature = tx.type !== 'reward' || tx.conf >= 100
              return (
                <motion.li key={tx.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i * 0.03, 0.3) }} className="flex items-center gap-4 py-3">
                  <span className={cn('hex grid size-10 shrink-0 place-items-center', meta.tone)}>
                    <Icon className="size-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px]">{meta.label}</p>
                    <p className="truncate font-mono t-subhead secondary" title={tx.ref}>{shortHash(tx.ref, 12, 6)}</p>
                  </div>
                  {tx.type !== 'send' && (
                    <div className="hidden w-40 sm:block">
                      <div className="h-1 overflow-hidden rounded-full bg-muted">
                        <motion.div className={cn('h-full', mature ? 'bg-accent' : 'bg-primary')} animate={{ width: `${Math.min(100, tx.type === 'reward' ? tx.conf : 100)}%` }} />
                      </div>
                      <p className="mt-1 t-subhead secondary">{tx.type === 'reward' && tx.conf < 100 ? `${tx.conf}/100 to unlock` : `${tx.conf.toLocaleString()} confirmations`}</p>
                    </div>
                  )}
                  <div className="text-right">
                    <p className={cn('display text-[15px] tabular-nums', tx.type === 'send' ? 'text-muted-foreground' : 'text-primary')}>
                      {tx.type === 'send' ? '−' : '+'}
                      {formatCoin(tx.amount, 4)}
                    </p>
                    <p className="t-subhead secondary">{tx.time ? timeAgo(tx.time) : 'On chain'}</p>
                  </div>
                </motion.li>
              )
            })}
          </ul>
        )}
      </Panel>

      <div className="flex flex-col gap-5">
        <Panel title="Receive">
          <div className="mx-auto w-fit rounded-xl bg-white p-3">
            <QRCodeSVG value={w.address ?? ''} size={148} bgColor="#ffffff" fgColor="#000000" level="M" />
          </div>
          <p className="well mt-3 break-all p-3 font-mono text-xs leading-relaxed text-foreground" data-selectable>
            {w.address}
          </p>
          <button type="button" onClick={copy} className="mac-button mt-3 w-full">
            {copied ? <Check className="size-3.5" aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />}
            {copied ? 'Copied' : 'Copy address'}
          </button>
          {w.address && payout !== w.address ? (
            <button type="button" onClick={() => walletActions.useForMining()} className="mac-button mt-2 w-full">
              <Pickaxe className="size-3.5" aria-hidden="true" /> Send my mining rewards here
            </button>
          ) : (
            <p className="mt-3 t-subhead secondary">Your mining rewards are paid to this address.</p>
          )}
        </Panel>
        <Panel title="Security">
          <div className="flex flex-col gap-2">
            <button type="button" className="mac-button w-full justify-start" onClick={() => open('backup')}>
              <ShieldCheck className="size-3.5" aria-hidden="true" /> Show recovery phrase
            </button>
            <button type="button" className="mac-button w-full justify-start" onClick={() => open('export')}>
              <KeyRound className="size-3.5" aria-hidden="true" /> Use with Saturn Core
            </button>
            <button type="button" className="mac-button w-full justify-start text-[#ff6961]" onClick={() => open('remove')}>
              <Trash2 className="size-3.5" aria-hidden="true" /> Remove from this computer
            </button>
          </div>
          <p className="mt-3 t-subhead secondary leading-relaxed">
            {w.storage === 'keychain' ? 'Your recovery phrase is stored in this computer’s keychain.' : 'Your recovery phrase is stored in a file only your user account can read.'}
          </p>
        </Panel>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* sheets                                                              */
/* ------------------------------------------------------------------ */

function Words({ phrase }: { phrase: string }) {
  return (
    <ol className="grid grid-cols-3 gap-1.5" data-selectable>
      {phrase.split(' ').map((w, i) => (
        <motion.li
          key={i}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.03 }}
          className="well flex items-baseline gap-2 px-2.5 py-1.5 font-mono text-[12.5px]"
        >
          <span className="w-4 text-right text-[10.5px] text-white/35">{i + 1}</span>
          {w}
        </motion.li>
      ))}
    </ol>
  )
}

function ErrorLine({ error }: { error: string | null }) {
  return error ? <p className="t-subhead mt-3 text-[#ff6961]">{error.replace(/^Error: /, '')}</p> : null
}

function CreateSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [phrase, setPhrase] = useState<string | null>(null)
  const [ack, setAck] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const done = () => {
    setPhrase(null)
    setAck(false)
    onClose()
  }
  const create = async () => {
    setBusy(true)
    setError(null)
    try {
      const r = await walletActions.create(12)
      setPhrase(r.phrase)
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Sheet
      open={open}
      onClose={phrase ? () => {} : onClose}
      title={phrase ? 'Write down your recovery phrase' : 'Create a new wallet'}
      message={phrase ? 'These 12 words are the only way to get your SAT back if this computer is lost. Write them on paper, in order, and keep them private.' : 'Saturn makes a fresh set of keys on this computer.'}
      width={480}
      footer={
        phrase ? (
          <button type="button" className="mac-button" data-variant="primary" disabled={!ack} onClick={done}>
            Done
          </button>
        ) : (
          <>
            <button type="button" className="mac-button" data-sheet-cancel onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="mac-button" data-variant="primary" disabled={busy} onClick={create}>
              {busy ? 'Creating…' : 'Create wallet'}
            </button>
          </>
        )
      }
    >
      {phrase ? (
        <>
          <Words phrase={phrase} />
          <label className="mt-4 flex cursor-pointer items-center gap-2 text-[13px]">
            <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="size-4 accent-[#f5b971]" />
            I've written down all 12 words
          </label>
        </>
      ) : (
        <ul className="t-callout secondary flex list-disc flex-col gap-1.5 pl-5">
          <li>You'll get a 12-word recovery phrase. Anyone with it can spend your SAT.</li>
          <li>Your mining rewards will be paid to the new wallet's address.</li>
        </ul>
      )}
      <ErrorLine error={error} />
    </Sheet>
  )
}

function RestoreSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const words = text.trim().split(/\s+/).filter(Boolean).length
  const restore = async () => {
    setBusy(true)
    setError(null)
    try {
      await walletActions.restore(text)
      setText('')
      onClose()
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Restore a wallet"
      message="Type your 12 or 24-word recovery phrase, separated by spaces."
      width={480}
      footer={
        <>
          <button type="button" className="mac-button" data-sheet-cancel onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="mac-button" data-variant="primary" disabled={busy || (words !== 12 && words !== 24)} onClick={restore}>
            {busy ? 'Restoring…' : 'Restore'}
          </button>
        </>
      }
    >
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        spellCheck={false}
        autoComplete="off"
        className="w-full resize-none rounded-md bg-black/25 p-2.5 font-mono text-[13px] text-foreground outline-none shadow-[inset_0_0_0_0.5px_rgb(255_255_255/0.12)] focus-visible:shadow-[inset_0_0_0_0.5px_rgb(245_185_113/0.8),0_0_0_3px_rgb(245_185_113/0.4)]"
        placeholder="word word word …"
        aria-label="Recovery phrase"
      />
      <p className="t-subhead secondary mt-1.5">{words} words</p>
      <ErrorLine error={error} />
    </Sheet>
  )
}

function SendSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const spendable = useWallet((s) => s.spendableSats)
  const [to, setTo] = useState('')
  const [amount, setAmount] = useState('')
  const [max, setMax] = useState(false)
  const [fast, setFast] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ txid: string; amountSats: number; feeSats: number } | null>(null)
  const sats = max ? spendable : coinToSats(amount)
  const valid = to.trim().length > 10 && sats != null && sats > 0 && sats <= spendable
  const reset = () => {
    setTo('')
    setAmount('')
    setMax(false)
    setError(null)
    setResult(null)
    onClose()
  }
  const send = async () => {
    setBusy(true)
    setError(null)
    try {
      await walletActions.checkAddress(to.trim())
      const r = await walletActions.send(to.trim(), max ? null : sats, fast ? 5 : 2)
      setResult(r)
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Sheet
      open={open}
      onClose={reset}
      title={result ? 'Sent' : 'Send SAT'}
      message={result ? undefined : `${formatCoin(satsToCoin(spendable), 8)} SAT available`}
      width={480}
      footer={
        result ? (
          <button type="button" className="mac-button" data-variant="primary" onClick={reset}>
            Done
          </button>
        ) : (
          <>
            <button type="button" className="mac-button" data-sheet-cancel onClick={reset}>
              Cancel
            </button>
            <button type="button" className="mac-button" data-variant="primary" disabled={!valid || busy} onClick={send}>
              {busy ? 'Sending…' : 'Send'}
            </button>
          </>
        )
      }
    >
      {result ? (
        <div className="text-center">
          <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 380, damping: 18 }} className="hex mx-auto grid size-14 place-items-center bg-ok">
            <Check className="size-7 text-black" aria-hidden="true" />
          </motion.div>
          <p className="display mt-4 text-[22px]">{formatCoin(satsToCoin(result.amountSats), 8)} SAT</p>
          <p className="t-subhead secondary mt-1">Network fee {formatCoin(satsToCoin(result.feeSats), 8)} SAT. It confirms in the next block.</p>
          <p className="well mt-4 break-all p-2.5 font-mono text-[11px] text-white/60" data-selectable>
            {result.txid}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="t-subhead secondary">To</span>
            <Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="sat1…" spellCheck={false} className="font-mono" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="t-subhead secondary">Amount (SAT)</span>
            <div className="flex gap-2">
              <Input value={max ? formatCoin(satsToCoin(spendable), 8) : amount} disabled={max} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" inputMode="decimal" className="tabular-nums" />
              <button type="button" className="mac-button" data-variant={max ? 'primary' : undefined} onClick={() => setMax(!max)}>
                Max
              </button>
            </div>
            {max && <span className="t-subhead secondary">The network fee comes out of the amount.</span>}
          </label>
          <div className="flex items-center justify-between">
            <span className="t-subhead secondary">Fee</span>
            <div className="mac-segmented" role="radiogroup" aria-label="Fee">
              <button type="button" role="radio" aria-checked={!fast} onClick={() => setFast(false)}>
                Normal
              </button>
              <button type="button" role="radio" aria-checked={fast} onClick={() => setFast(true)}>
                Faster
              </button>
            </div>
          </div>
          <ErrorLine error={error} />
        </div>
      )}
    </Sheet>
  )
}

function BackupSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [phrase, setPhrase] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const close = () => {
    setPhrase(null)
    onClose()
  }
  return (
    <Sheet
      open={open}
      onClose={close}
      title="Recovery phrase"
      message="Anyone who sees these words can take your SAT. Make sure no one is watching your screen."
      width={480}
      footer={
        phrase ? (
          <button type="button" className="mac-button" data-variant="primary" onClick={close}>
            Done
          </button>
        ) : (
          <>
            <button type="button" className="mac-button" data-sheet-cancel onClick={close}>
              Cancel
            </button>
            <button type="button" className="mac-button" data-variant="primary" onClick={() => walletActions.reveal().then(setPhrase, (e) => setError(String(e)))}>
              Show
            </button>
          </>
        )
      }
    >
      {phrase ? <Words phrase={phrase} /> : <p className="t-callout secondary">Write the words on paper and keep them somewhere safe. Never type them into a website.</p>}
      <ErrorLine error={error} />
    </Sheet>
  )
}

function ExportSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [d, setD] = useState<{ receive: string; change: string; import: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const cmd = d ? `saturn-cli -rpcwallet=<name> importdescriptors '${d.import}'` : ''
  const close = () => {
    setD(null)
    onClose()
  }
  return (
    <Sheet
      open={open}
      onClose={close}
      title="Use this wallet in Saturn Core"
      message="Import your wallet's keys into a Saturn Core node to see and spend the same coins there. This includes your private keys, so treat it like your recovery phrase."
      width={520}
      footer={
        d ? (
          <>
            <button
              type="button"
              className="mac-button"
              onClick={async () => {
                await navigator.clipboard?.writeText(cmd).catch(() => {})
                setCopied(true)
                setTimeout(() => setCopied(false), 1600)
              }}
            >
              {copied ? <Check className="size-3.5" aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />} {copied ? 'Copied' : 'Copy command'}
            </button>
            <button type="button" className="mac-button" data-variant="primary" onClick={close}>
              Done
            </button>
          </>
        ) : (
          <>
            <button type="button" className="mac-button" data-sheet-cancel onClick={close}>
              Cancel
            </button>
            <button type="button" className="mac-button" data-variant="primary" onClick={() => walletActions.descriptors().then(setD, (e) => setError(String(e)))}>
              Show
            </button>
          </>
        )
      }
    >
      {d ? (
        <>
          <p className="t-subhead secondary mb-1.5">In a terminal, with Saturn Core running and a wallet created (saturn-cli createwallet &lt;name&gt;):</p>
          <p className="well max-h-40 overflow-auto break-all p-2.5 font-mono text-[11px] leading-relaxed text-white/75" data-selectable>
            {cmd}
          </p>
        </>
      ) : (
        <p className="t-callout secondary">Only do this on a computer you trust.</p>
      )}
      <ErrorLine error={error} />
    </Sheet>
  )
}

function RemoveSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [ack, setAck] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const close = () => {
    setAck(false)
    onClose()
  }
  return (
    <Sheet
      open={open}
      onClose={close}
      title="Remove this wallet?"
      message="Your SAT stays on the Saturn network, but this computer forgets the keys. Without your recovery phrase you can never get it back."
      width={460}
      footer={
        <>
          <button type="button" className="mac-button" data-sheet-cancel onClick={close}>
            Cancel
          </button>
          <button
            type="button"
            className="mac-button bg-[#ff453a] text-white hover:bg-[#ff5b51]"
            disabled={!ack}
            onClick={() => walletActions.remove().then(close, (e) => setError(String(e)))}
          >
            Remove wallet
          </button>
        </>
      }
    >
      <label className="flex cursor-pointer items-center gap-2 text-[13px]">
        <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="size-4 accent-[#ff453a]" />
        I have my recovery phrase written down
      </label>
      <ErrorLine error={error} />
    </Sheet>
  )
}
