import { useEffect, useRef, useState } from 'react'
import useSWR, { SWRConfig } from 'swr'
import './style.css'
import { fetcher, refreshFromDatabricks } from './lib/api.js'
import Header from './components/Header.jsx'
import KpiRow from './components/KpiRow.jsx'
import Charts from './components/Charts.jsx'
import PipelinesTable from './components/PipelinesTable.jsx'
import RunsList from './components/RunsList.jsx'
import IncidentReport from './components/IncidentReport.jsx'

function scrollBehavior() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
}

function Dashboard() {
  const [lastRefreshed, setLastRefreshed] = useState(null)
  const markRefreshed = () => setLastRefreshed(new Date())
  const stats = useSWR('/api/stats', fetcher, { onSuccess: markRefreshed })
  const runs = useSWR('/api/runs', fetcher)

  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState(null)
  const [statusFilter, setStatusFilter] = useState('all')
  const [jobFilter, setJobFilter] = useState(null)
  const [selectedRunId, setSelectedRunId] = useState(null)

  const [theme, setTheme] = useState('dark')

  const runsRef = useRef(null)
  const reportRef = useRef(null)

  useEffect(() => {
    const stored = window.localStorage.getItem('pm-theme')
    const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches
    setTheme(stored === 'light' || stored === 'dark' ? stored : prefersLight ? 'light' : 'dark')
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  function onToggleTheme() {
    setTheme((current) => {
      const next = current === 'dark' ? 'light' : 'dark'
      window.localStorage.setItem('pm-theme', next)
      return next
    })
  }

  useEffect(() => {
    if (selectedRunId && reportRef.current) {
      reportRef.current.scrollIntoView({ behavior: scrollBehavior(), block: 'start' })
      reportRef.current.focus({ preventScroll: true })
    }
  }, [selectedRunId])

  async function onRefresh() {
    setRefreshing(true)
    setRefreshError(null)
    try {
      await refreshFromDatabricks()
      await Promise.all([stats.mutate(), runs.mutate()])
    } catch (err) {
      setRefreshError(
        err.unreachable ? 'Backend unreachable, is `python server.py` running?' : err.message,
      )
    } finally {
      setRefreshing(false)
    }
  }

  function onSelectJob(jobId) {
    setJobFilter((current) => (String(current) === String(jobId) ? null : String(jobId)))
    runsRef.current?.scrollIntoView({ behavior: scrollBehavior(), block: 'start' })
  }

  function onCloseReport() {
    const id = selectedRunId
    setSelectedRunId(null)
    requestAnimationFrame(() => {
      const row = document.querySelector(`[data-run-id="${CSS.escape(String(id))}"]`)
      ;(row || runsRef.current)?.focus?.()
    })
  }

  const error = stats.error || runs.error
  const source = runs.data?.runs?.[0]?.source

  return (
    <div className="app">
      <Header
        source={source}
        lastRefreshed={lastRefreshed}
        refreshing={refreshing}
        refreshError={refreshError}
        onRefresh={onRefresh}
        theme={theme}
        onToggleTheme={onToggleTheme}
      />

      <main className="main">
        {error && (
          <div className="banner banner-error" role="alert">
            {error.unreachable
              ? 'Backend unreachable, is `python server.py` running?'
              : `Could not load data: ${error.message}`}
          </div>
        )}

        <KpiRow overall={stats.data?.overall} loading={stats.isLoading} />
        <Charts stats={stats.data} loading={stats.isLoading} />
        <PipelinesTable
          jobs={stats.data?.jobs}
          loading={stats.isLoading}
          selectedJobId={jobFilter}
          onSelectJob={onSelectJob}
        />
        <div ref={runsRef} tabIndex={-1} className="anchor">
          <RunsList
            runs={runs.data?.runs}
            jobs={stats.data?.jobs}
            loading={runs.isLoading}
            statusFilter={statusFilter}
            onStatusFilter={setStatusFilter}
            jobFilter={jobFilter}
            onJobFilter={setJobFilter}
            selectedRunId={selectedRunId}
            onSelectRun={setSelectedRunId}
          />
        </div>

        {selectedRunId && (
          <IncidentReport
            key={selectedRunId}
            ref={reportRef}
            runId={selectedRunId}
            onClose={onCloseReport}
          />
        )}
      </main>

      <footer className="footer">
        {stats.data?.note ? <p>{stats.data.note}</p> : null}
      </footer>
    </div>
  )
}

export default function App() {
  return (
    <SWRConfig value={{ revalidateOnFocus: false, shouldRetryOnError: false }}>
      <Dashboard />
    </SWRConfig>
  )
}
