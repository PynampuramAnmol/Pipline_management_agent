import { useState } from 'react'
import { copyText } from '../lib/api.js'
import { formatStatus, statusTone } from '../lib/format.js'

export function StatusBadge({ status }) {
  const tone = statusTone(status)
  return (
    <span className={`badge badge-${tone}`}>
      <span className="badge-dot" aria-hidden="true" />
      {formatStatus(status)}
    </span>
  )
}

export function Card({ title, actions, children, className = '', id, labelledBy }) {
  const headingId = labelledBy || (id ? `${id}-title` : undefined)
  return (
    <section className={`card ${className}`} id={id} aria-labelledby={title ? headingId : undefined}>
      {(title || actions) && (
        <div className="card-head">
          {title && (
            <h2 className="card-title" id={headingId}>
              {title}
            </h2>
          )}
          {actions && <div className="card-actions">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  )
}

export function Skeleton({ height = 16, width = '100%', className = '' }) {
  return <div className={`skeleton ${className}`} style={{ height, width }} aria-hidden="true" />
}

export function SkeletonRows({ rows = 5 }) {
  return (
    <div className="skeleton-rows" role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} height={28} />
      ))}
    </div>
  )
}

export function EmptyState({ children }) {
  return <p className="empty">{children}</p>
}

export function CopyButton({ text, label = 'Copy', className = '' }) {
  const [state, setState] = useState('idle')
  async function onClick() {
    const ok = await copyText(text)
    setState(ok ? 'copied' : 'failed')
    setTimeout(() => setState('idle'), 1800)
  }
  return (
    <button type="button" className={`btn btn-sm ${className}`} onClick={onClick} disabled={!text}>
      <span aria-live="polite">
        {state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed' : label}
      </span>
    </button>
  )
}

export function Mono({ children }) {
  return <span className="mono">{children}</span>
}
