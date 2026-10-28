import useSWR from 'swr'
import { fetcher } from '../lib/api.js'
import { Card, Skeleton } from './common.jsx'

function Stat({ label, value, hint }) {
  return (
    <div className="rag-stat">
      <div className="rag-stat-value">{value ?? 'n/a'}</div>
      <div className="rag-stat-label">{label}</div>
      {hint && <div className="muted small">{hint}</div>}
    </div>
  )
}

export default function RagStatusCard() {
  const { data, error, isLoading } = useSWR('/api/rag/status', fetcher)
  return (
    <Card title="RAG knowledge base" className="rag-card">
      {error ? (
        <p className="note">{error.unreachable ? 'Backend unreachable.' : `Could not load RAG status: ${error.message}`}</p>
      ) : isLoading || !data ? (
        <Skeleton height={56} />
      ) : (
        <>
          <div className="rag-stats">
            <Stat label="Documents" value={data.documents} hint={Object.entries(data.by_type || {}).map(([k, v]) => `${v} ${k.replace('_', ' ')}`).join(' · ')} />
            <Stat label="Chunks indexed" value={data.chunks} hint={data.model ? `embedder ${data.model}` : null} />
            <Stat label="Fixes saved" value={data.resolutions} hint="Resolution memory" />
            <Stat
              label="Failed runs with a fix on record"
              value={data.failed_with_fix != null ? `${data.failed_with_fix} / ${data.failed_runs}` : null}
              hint="Own fix, or a similar one"
            />
          </div>
          <p className="muted small">
            Every incident report searches this index with the recorded error text. Saving a fix adds a document, so the next similar failure finds it.
          </p>
        </>
      )}
    </Card>
  )
}
