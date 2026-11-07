'use client'

import { ArrowDownLeft, ArrowUpRight, Check, ChevronDown, Copy, Download, KeyRound, Pencil, Pickaxe, Plus, RefreshCw, ShieldCheck, Trash2, Wallet as WalletIcon } from 'lucide-react'
import { motion } from 'motion/react'
import { QRCodeSVG } from 'qrcode.react'
import { useEffect, useRef, useState } from 'react'
import { formatCoin, shortHash, timeAgo } from '@/lib/format'
import { useMiner } from '@/lib/miner/store'
import { coinToSats, satsToCoin, useWallet, walletActions, type WalletSummary } from '@/lib/wallet/store'
import { cn } from '@/lib/utils'
import { Label, Panel } from '../hud/panel'
import { Sheet } from '../hud/sheet'
import { Ticker } from '../hud/ticker'
import { Input } from '../ui/input'

type SheetId = 'create' | 'restore' | 'import' | 'send' | 'backup' | 'export' | 'remove' | null

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
      <RestoreSheet open={sheet === 'restore' || sheet === 'import'} mode={sheet === 'import' ? 'import' : 'phrase'} onClose={close} />
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
          <div className="mt-7 flex flex-col items-center justify-center gap-2.5">
            <button type="button" className="mac-button h-9 px-5 text-[14px]" data-variant="primary" onClick={() => open('create')}>
              <Plus className="size-4" aria-hidden="true" /> Create a new wallet
            </button>
            <div className="flex flex-col gap-2.5 sm:flex-row">
              <button type="button" className="mac-button h-9 px-5 text-[14px]" onClick={() => open('restore')}>
                <Download className="size-4" aria-hidden="true" /> Restore from a recovery phrase
              </button>
              <button type="button" className="mac-button h-9 px-5 text-[14px]" onClick={() => open('import')}>
                <KeyRound className="size-4" aria-hidden="true" /> Import from Saturn Core
              </button>
            </div>
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
  const [copied, setCopied] = useState(false)
  const kind = w.wallets.find((x) => x.id === w.active)?.kind ?? 'phrase'
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
        <WalletSwitcher open={open} />
        <Label className="mt-4 text-foreground/75">Available to spend</Label>
        <p className="mt-1 flex flex-wrap items-baseline gap-4">
          <Ticker value={spendable} format={(n) => formatCoin(n, 4)} className="display gold-text text-[clamp(44px,4.8vw,68px)] [text-shadow:0_2px_30px_rgb(0_0_0/0.35)]" />
          <span className="text-[clamp(17px,1.6vw,22px)] font-medium text-white/55">SAT</span>
        </p>
        <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
          <span className="font-mono tabular-nums text-white/60" title="Your spendable balance in rings, SAT's smallest unit">{w.spendableSats.toLocaleString('en-US')} rings</span>
          <span className="holo-text font-mono text-[11px] tracking-[0.06em]" title="A ring is the smallest piece of a SAT, like a satoshi is for Bitcoin">1 SAT = 100,000,000 rings</span>
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
        <ReceivePanel />
        <Panel title="Security">
          <div className="flex flex-col gap-2">
            <button type="button" className="mac-button w-full justify-start" onClick={() => open('backup')}>
              <ShieldCheck className="size-3.5" aria-hidden="true" /> {kind === 'phrase' ? 'Show recovery phrase' : 'Show private key'}
            </button>
            <button type="button" className="mac-button w-full justify-start" onClick={() => open('export')}>
              <KeyRound className="size-3.5" aria-hidden="true" /> Use with Saturn Core
            </button>
            <button type="button" className="mac-button w-full justify-start text-[#ff6961]" onClick={() => open('remove')}>
              <Trash2 className="size-3.5" aria-hidden="true" /> Remove from this computer
            </button>
          </div>
          <p className="mt-3 t-subhead secondary leading-relaxed">
            {w.storage === 'keychain' ? 'This wallet’s key is stored in this computer’s keychain.' : 'This wallet’s key is stored in a file only your user account can read.'}
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
  const [name, setName] = useState('')
  const [phrase, setPhrase] = useState<string | null>(null)
  const [ack, setAck] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const done = () => {
    setPhrase(null)
    setAck(false)
    setName('')
    onClose()
  }
  const create = async () => {
    setBusy(true)
    setError(null)
    try {
      const r = await walletActions.create(name.trim() || undefined)
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
        <>
          <label className="flex flex-col gap-1">
            <span className="t-subhead secondary">Name (optional)</span>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Savings" maxLength={40} />
          </label>
          <ul className="t-callout secondary mt-4 flex list-disc flex-col gap-1.5 pl-5">
            <li>You'll get a 12-word recovery phrase. Anyone with it can spend your SAT.</li>
            <li>A wallet can hand out as many addresses as you like, all backed up by the same 12 words.</li>
          </ul>
        </>
      )}
      <ErrorLine error={error} />
    </Sheet>
  )
}

function RestoreSheet({ open, onClose, mode }: { open: boolean; onClose: () => void; mode: 'phrase' | 'import' }) {
  const [text, setText] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const words = text.trim().split(/\s+/).filter(Boolean).length
  const ready = mode === 'phrase' ? words === 12 || words === 24 : text.trim().length > 40
  const close = () => {
    setText('')
    setName('')
    setError(null)
    onClose()
  }
  const restore = async () => {
    setBusy(true)
    setError(null)
    try {
      await walletActions.restore(text, name.trim() || undefined)
      close()
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(false)
    }
  }
  const cmd = `saturn-cli -datadir=/root/.saturn -rpcwallet=t-miner listdescriptors true | grep -o 'wpkh(xprv[^"]*/0/\\*)#[a-z0-9]*'`
  return (
    <Sheet
      open={open}
      onClose={close}
      title={mode === 'phrase' ? 'Restore a wallet' : 'Import from Saturn Core'}
      message={
        mode === 'phrase'
          ? 'Type your 12 or 24-word recovery phrase, separated by spaces.'
          : 'Bring in a wallet from a Saturn Core node, such as the one your Bitaxe already mines to. Paste its wpkh(…) descriptor, an xprv, or a single private key.'
      }
      width={520}
      footer={
        <>
          <button type="button" className="mac-button" data-sheet-cancel onClick={close}>
            Cancel
          </button>
          <button type="button" className="mac-button" data-variant="primary" disabled={busy || !ready} onClick={restore}>
            {busy ? 'Adding…' : mode === 'phrase' ? 'Restore' : 'Import'}
          </button>
        </>
      }
    >
      {mode === 'import' && (
        <div className="mb-3">
          <p className="t-subhead secondary mb-1.5">On the server, this prints the descriptor of the wallet your Bitaxe mines to:</p>
          <p className="well break-all p-2.5 font-mono text-[11px] leading-relaxed text-white/75" data-selectable>
            {cmd}
          </p>
        </div>
      )}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={mode === 'phrase' ? 4 : 5}
        spellCheck={false}
        autoComplete="off"
        className="w-full resize-none rounded-md bg-black/25 p-2.5 font-mono text-[12.5px] text-foreground outline-none shadow-[inset_0_0_0_0.5px_rgb(255_255_255/0.12)] focus-visible:shadow-[inset_0_0_0_0.5px_rgb(245_185_113/0.8),0_0_0_3px_rgb(245_185_113/0.4)]"
        placeholder={mode === 'phrase' ? 'word word word …' : 'wpkh(xprv…/84h/0h/0h/0/*)#…'}
        aria-label={mode === 'phrase' ? 'Recovery phrase' : 'Descriptor or private key'}
      />
      {mode === 'phrase' && <p className="t-subhead secondary mt-1.5">{words} words</p>}
      <label className="mt-3 flex flex-col gap-1">
        <span className="t-subhead secondary">Name (optional)</span>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={mode === 'phrase' ? 'e.g. Savings' : 'e.g. Bitaxe'} maxLength={40} />
      </label>
      <p className="t-subhead secondary mt-3">It's stored on this computer only. Anyone who has it can spend the coins, so treat it like cash.</p>
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
  const name = useWallet((s) => s.wallets.find((w) => w.id === s.active)?.name ?? 'this wallet')
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
      title={`Remove “${name}”?`}
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
        I have this wallet's recovery phrase or key saved somewhere else
      </label>
      <ErrorLine error={error} />
    </Sheet>
  )
}

const KIND_LABEL: Record<WalletSummary['kind'], string> = { phrase: 'Recovery phrase', xprv: 'Saturn Core', key: 'Single key' }

/** The wallet menu: switch, rename, or add another wallet. */
function WalletSwitcher({ open }: { open: (s: SheetId) => void }) {
  const wallets = useWallet((s) => s.wallets)
  const active = useWallet((s) => s.active)
  const [menu, setMenu] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const current = wallets.find((w) => w.id === active)
  useEffect(() => {
    if (!menu) return
    const off = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setMenu(false)
    }
    window.addEventListener('mousedown', off)
    return () => window.removeEventListener('mousedown', off)
  }, [menu])
  if (!current) return null
  const save = () => {
    setEditing(false)
    if (draft.trim() && draft.trim() !== current.name) void walletActions.rename(current.id, draft)
  }
  return (
    <div ref={ref} className="relative flex items-center gap-2">
      {editing ? (
        <Input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={save} onKeyDown={(e) => e.key === 'Enter' && save()} className="h-8 w-56 text-[15px]" maxLength={40} />
      ) : (
        <button type="button" className="mac-button h-8 gap-2 px-3 text-[14px]" onClick={() => setMenu(!menu)} aria-haspopup="menu" aria-expanded={menu}>
          <WalletIcon className="size-4 text-primary" aria-hidden="true" />
          <span className="max-w-[240px] truncate font-semibold">{current.name}</span>
          <span className="t-subhead secondary hidden sm:inline">{KIND_LABEL[current.kind]}</span>
          <ChevronDown className="size-3.5 text-white/60" aria-hidden="true" />
        </button>
      )}
      {!editing && (
        <button type="button" className="grid size-8 place-items-center rounded-md text-white/55 hover:bg-white/[0.06] hover:text-white" aria-label="Rename wallet" title="Rename" onClick={() => { setDraft(current.name); setEditing(true) }}>
          <Pencil className="size-3.5" aria-hidden="true" />
        </button>
      )}
      {menu && (
        <motion.div
          role="menu"
          initial={{ opacity: 0, y: -4, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.15 }}
          className="absolute left-0 top-10 z-30 w-[340px] overflow-hidden rounded-xl bg-[rgb(40_40_44/0.96)] p-1.5 shadow-[0_0_0_0.5px_rgb(255_255_255/0.14),0_18px_44px_rgb(0_0_0/0.55)] backdrop-blur-xl"
        >
          <p className="t-subhead secondary px-2.5 pb-1 pt-1.5">Wallets</p>
          {wallets.map((w) => (
            <button
              key={w.id}
              type="button"
              role="menuitemradio"
              aria-checked={w.id === active}
              onClick={() => { setMenu(false); void walletActions.select(w.id) }}
              className={cn('flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left hover:bg-white/[0.08]', w.id === active && 'bg-white/[0.06]')}
            >
              <span className="grid size-4 place-items-center">{w.id === active && <Check className="size-3.5 text-primary" aria-hidden="true" />}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium">{w.name}</span>
                <span className="block truncate font-mono text-[11px] text-white/45">{shortHash(w.address, 12, 6)}</span>
              </span>
              <span className="text-[11px] text-white/45">{KIND_LABEL[w.kind]}</span>
            </button>
          ))}
          <div className="my-1 h-px bg-white/[0.08]" />
          {([['create', Plus, 'Create a new wallet'], ['restore', Download, 'Restore from a recovery phrase'], ['import', KeyRound, 'Import from Saturn Core']] as const).map(([id, Icon, label]) => (
            <button key={id} type="button" role="menuitem" onClick={() => { setMenu(false); open(id) }} className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13px] hover:bg-white/[0.08]">
              <Icon className="size-4 text-white/70" aria-hidden="true" /> {label}
            </button>
          ))}
        </motion.div>
      )}
    </div>
  )
}

/** Addresses of the active wallet: pick one to show as a QR code, copy it, mine to it, or add another. */
function ReceivePanel() {
  const addresses = useWallet((s) => s.addresses)
  const kind = useWallet((s) => s.wallets.find((w) => w.id === s.active)?.kind)
  const payout = useMiner((s) => s.config.payoutAddress)
  const [selected, setSelected] = useState(0)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const address = addresses[Math.min(selected, addresses.length - 1)] ?? ''
  useEffect(() => setSelected(0), [kind, addresses[0]])
  const copy = async () => {
    await navigator.clipboard?.writeText(address).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }
  const add = async () => {
    setError(null)
    try {
      await walletActions.newAddress()
      setSelected(addresses.length)
    } catch (e) {
      setError(String(e))
    }
  }
  return (
    <Panel
      title="Receive"
      meta={addresses.length > 1 ? `${addresses.length} addresses` : undefined}
      action={
        kind !== 'key' && (
          <button type="button" className="mac-button h-6 px-2 text-[12px]" onClick={add}>
            <Plus className="size-3" aria-hidden="true" /> New address
          </button>
        )
      }
    >
      <div className="mx-auto w-fit rounded-xl bg-white p-3">
        <QRCodeSVG value={address} size={148} bgColor="#ffffff" fgColor="#000000" level="M" />
      </div>
      <p className="well mt-3 break-all p-3 font-mono text-xs leading-relaxed text-foreground" data-selectable>
        {address}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" onClick={copy} className="mac-button w-full">
          {copied ? <Check className="size-3.5" aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
        <button type="button" onClick={() => walletActions.mineTo(address)} className="mac-button w-full" disabled={payout === address} title="Use this address as the mining payout address">
          <Pickaxe className="size-3.5" aria-hidden="true" /> {payout === address ? 'Mining here' : 'Mine to this'}
        </button>
      </div>
      {addresses.length > 1 && (
        <ul className="mt-3 max-h-40 overflow-y-auto rounded-lg bg-white/[0.03] p-1">
          {addresses.map((a, i) => (
            <li key={a}>
              <button
                type="button"
                onClick={() => setSelected(i)}
                className={cn('flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left font-mono text-[11.5px] hover:bg-white/[0.06]', i === selected ? 'text-white' : 'text-white/55')}
              >
                <span className="w-5 text-right text-[10.5px] text-white/35">{i + 1}</span>
                <span className="truncate">{shortHash(a, 14, 8)}</span>
                {a === payout && <Pickaxe className="ml-auto size-3 shrink-0 text-primary" aria-label="Mining payout address" />}
              </button>
            </li>
          ))}
        </ul>
      )}
      <ErrorLine error={error} />
      <p className="mt-3 t-subhead secondary leading-relaxed">Any address can be a mining payout address. Using a new address for each payer keeps your history private; they all add up to one balance.</p>
    </Panel>
  )
}
