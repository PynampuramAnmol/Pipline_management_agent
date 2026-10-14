export const BAD_STATUSES = new Set(['FAILED', 'TIMED_OUT', 'CANCELLED', 'INTERNAL_ERROR'])

export function statusTone(status) {
  const s = String(status || 'UNKNOWN').toUpperCase()
  if (s === 'SUCCESS') return 'ok'
  if (s === 'FAILED' || s === 'INTERNAL_ERROR') return 'bad'
  if (s === 'TIMED_OUT' || s === 'CANCELLED') return 'warn'
  return 'neutral'
}

export function isBad(status) {
  return BAD_STATUSES.has(String(status || '').toUpperCase())
}

export function formatStatus(status) {
  return String(status || 'UNKNOWN').toUpperCase().replace(/_/g, ' ')
}

export function formatDuration(value) {
  if (value === null || value === undefined || value === '') return 'n/a'
  if (typeof value === 'string' && Number.isNaN(Number(value))) return value
  const total = Math.round(Number(value))
  if (!Number.isFinite(total) || total < 0) return 'n/a'
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `${h}h${m}m${s}s`
  if (m > 0) return `${m}m${s}s`
  return `${s}s`
}

function toDate(value) {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'number' || /^\d+$/.test(String(value))) {
    const n = Number(value)
    return new Date(n < 1e11 ? n * 1000 : n)
  }
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

export function formatTime(value) {
  if (value === null || value === undefined || value === '') return 'n/a'
  const d = toDate(value)
  if (!d) return String(value)
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

export function timeValue(value) {
  const d = toDate(value)
  return d ? d.getTime() : 0
}

export function formatDay(value) {
  const d = toDate(value)
  if (!d) return String(value)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

// The API may express rates as 0-1 or 0-100; pick whichever matches the counts.
export function normalizeRate(rate, succeeded, runs) {
  if (rate === null || rate === undefined || Number.isNaN(Number(rate))) return null
  const r = Number(rate)
  if (runs > 0 && succeeded !== undefined && succeeded !== null) {
    const computed = (succeeded / runs) * 100
    return Math.abs(r - computed) <= Math.abs(r * 100 - computed) ? r : r * 100
  }
  return r <= 1 ? r * 100 : r
}

export function formatRate(rate) {
  if (rate === null || rate === undefined) return 'n/a'
  return `${rate.toFixed(rate % 1 === 0 ? 0 : 1)}%`
}

export function formatNumber(n) {
  if (n === null || n === undefined) return 'n/a'
  return Number(n).toLocaleString()
}
