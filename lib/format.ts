const HASH_UNITS = ['H/s', 'kH/s', 'MH/s', 'GH/s', 'TH/s', 'PH/s', 'EH/s']

export function hashrateUnit(hs: number) {
  let index = 0
  let value = hs
  while (value >= 1000 && index < HASH_UNITS.length - 1) {
    value /= 1000
    index++
  }
  return { divisor: 1000 ** index, unit: HASH_UNITS[index] }
}

export function formatHashrate(hs: number) {
  const { divisor, unit } = hashrateUnit(hs)
  const value = hs / divisor
  return `${value.toFixed(value >= 100 ? 1 : 2)} ${unit}`
}

export function formatDuration(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return [h, m, sec].map((n) => String(n).padStart(2, '0')).join(':')
}

export function formatCoin(n: number, digits = 4) {
  return n.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

export function formatInt(n: number) {
  return Math.round(n).toLocaleString('en-US')
}

export function timeAgo(timestamp: number, now = Date.now()) {
  const diff = Math.max(0, Math.round((now - timestamp) / 1000))
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

export function shortHash(hash: string, head = 8, tail = 6) {
  if (hash.length <= head + tail) return hash
  return `${hash.slice(0, head)}…${hash.slice(-tail)}`
}

export function formatClock(date: Date) {
  return date.toISOString().slice(11, 19)
}
