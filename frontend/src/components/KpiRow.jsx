import { useEffect, useState } from 'react'
import { Skeleton } from './common.jsx'
import { formatDuration, formatNumber, formatRate, normalizeRate } from '../lib/format.js'

function useCountUp(target, duration = 900) {
  const [value, setValue] = useState(0)
  useEffect(() => {
    if (target == null || Number.isNaN(Number(target))) return
    const end = Number(target)
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setValue(end)
      return
    }
    let frame
    const start = performance.now()
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      setValue(end * eased)
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [target, duration])
  return value
}

function AnimatedValue({ value, format, integer }) {
  const current = useCountUp(value)
  if (value == null) return format(value)
  return format(integer ? Math.round(current) : current)
}

const ICONS = {
  runs: 'M4 6h16M4 12h16M4 18h10',
  rate: 'M20 6 9 17l-5-5',
  failed: 'M12 8v5m0 3.5v.01M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z',
  avg: 'M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
  max: 'M13 2 3 14h9l-1 8 10-12h-9l1-8Z',
  open: 'M12 9v4m0 4h.01M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0Z',
  heal: 'M3 12h4l3 7 4-14 3 7h4',
}

function KpiIcon({ name }) {
  return (
    <span className="kpi-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="16" height="16">
        <path
          d={ICONS[name]}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  )
}

function RateRing({ rate }) {
  const r = 16
  const c = 2 * Math.PI * r
  const pct = rate == null ? 0 : Math.max(0, Math.min(100, rate))
  return (
    <svg className="rate-ring" viewBox="0 0 40 40" width="40" height="40" aria-hidden="true">
      <circle cx="20" cy="20" r={r} className="rate-ring-track" />
      <circle
        cx="20"
        cy="20"
        r={r}
        className="rate-ring-fill"
        strokeDasharray={c}
        style={{ '--ring-offset': c * (1 - pct / 100), '--ring-full': c }}
      />
    </svg>
  )
}

function Kpi({ label, icon, children, hint, tone, extra }) {
  return (
    <div className={`kpi ${tone ? `kpi-${tone}` : ''}`}>
      <div className="kpi-top">
        <dt className="kpi-label">{label}</dt>
        <KpiIcon name={icon} />
      </div>
      <dd className="kpi-value">{children}</dd>
      <div className="kpi-bottom">
        {hint ? <dd className="kpi-hint">{hint}</dd> : <span />}
        {extra}
      </div>
    </div>
  )
}

export default function KpiRow({ overall, incidents, loading }) {
  if (loading) {
    return (
      <div className="kpi-row" aria-busy="true">
        {Array.from({ length: 6 }, (_, i) => (
          <div className="kpi" key={i}>
            <Skeleton height={12} width="60%" />
            <Skeleton height={32} width="45%" />
            <Skeleton height={10} width="35%" />
          </div>
        ))}
      </div>
    )
  }
  if (!overall) return null
  const rate = normalizeRate(overall.success_rate, overall.succeeded, overall.runs)
  const failed = overall.failed ?? 0
  const openCount = incidents?.open ?? 0
  return (
    <dl className="kpi-row" aria-label="Key metrics">
      <Kpi label="Total runs" icon="runs" hint="All runs on record">
        <AnimatedValue value={overall.runs} format={formatNumber} integer />
      </Kpi>
      <Kpi
        label="Success rate"
        icon="rate"
        tone="ok"
        hint={overall.runs ? `${formatNumber(overall.succeeded)} of ${formatNumber(overall.runs)}` : null}
        extra={<RateRing rate={rate} />}
      >
        <AnimatedValue value={rate} format={formatRate} />
      </Kpi>
      <Kpi
        label="Failed runs"
        icon="failed"
        tone={failed > 0 ? 'bad' : null}
        hint={overall.other ? `${formatNumber(overall.other)} other` : 'Needs attention'}
      >
        <AnimatedValue value={failed} format={formatNumber} integer />
      </Kpi>
      <Kpi
        label="Open incidents"
        icon="open"
        tone={openCount > 0 ? 'bad' : 'ok'}
        hint={openCount > 0 ? 'Latest run of the job is failing' : 'All jobs recovered'}
      >
        <AnimatedValue value={openCount} format={formatNumber} integer />
      </Kpi>
      <Kpi
        label="Avg duration"
        icon="avg"
        hint={overall.max_duration_seconds != null ? `Longest ${formatDuration(overall.max_duration_seconds)}` : 'Per run'}
      >
        <AnimatedValue value={overall.avg_duration_seconds} format={formatDuration} integer />
      </Kpi>
      <Kpi
        label="Time to recover"
        icon="heal"
        hint={incidents?.recovered ? `${incidents.recovered} recovered ${incidents.recovered === 1 ? 'incident' : 'incidents'}` : 'No recovery yet'}
      >
        {incidents?.avg_recovery_seconds != null ? (
          <AnimatedValue value={incidents.avg_recovery_seconds} format={formatDuration} integer />
        ) : (
          <span className="muted">n/a</span>
        )}
      </Kpi>
    </dl>
  )
}
