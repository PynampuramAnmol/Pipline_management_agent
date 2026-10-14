import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Card, EmptyState, Skeleton } from './common.jsx'
import { formatDay, formatRate, formatStatus, normalizeRate, statusTone } from '../lib/format.js'

const TONE_COLOR = {
  ok: 'url(#grad-ok)',
  bad: 'url(#grad-bad)',
  warn: 'var(--warn)',
  neutral: 'var(--neutral)',
}

const axisProps = {
  stroke: 'var(--border-strong)',
  tick: { fill: 'var(--muted)', fontSize: 11 },
  tickLine: false,
}

const tooltipProps = {
  contentStyle: {
    background: 'var(--tooltip-bg)',
    border: '1px solid var(--border-strong)',
    borderRadius: 10,
    fontSize: 12,
    color: 'var(--text)',
    boxShadow: '0 12px 32px -12px rgba(0,0,0,0.5)',
    backdropFilter: 'blur(8px)',
    padding: '8px 12px',
  },
  labelStyle: { color: 'var(--text)', fontWeight: 600, marginBottom: 4 },
  itemStyle: { padding: 0 },
  cursor: { fill: 'var(--accent-soft)', radius: 6 },
}

function ChartCard({ title, description, loading, empty, children }) {
  return (
    <Card title={title} className="chart-card">
      <p className="chart-desc">{description}</p>
      {loading ? (
        <Skeleton height={200} />
      ) : empty ? (
        <EmptyState>No data for this chart yet.</EmptyState>
      ) : (
        <div className="chart-body">{children}</div>
      )}
    </Card>
  )
}

function DailyChart({ daily }) {
  const data = daily.map((d) => ({ ...d, label: formatDay(d.date) }))
  return (
    <ResponsiveContainer width="100%" height={220} className="chart-anim chart-anim-y">
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 16, left: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--grid)" strokeDasharray="3 4" />
        <XAxis
          dataKey="label"
          {...axisProps}
          label={{ value: 'Date', position: 'insideBottom', offset: -8, fill: 'var(--muted)', fontSize: 11 }}
        />
        <YAxis
          allowDecimals={false}
          width={40}
          {...axisProps}
          label={{ value: 'Runs', angle: -90, position: 'insideLeft', offset: 12, fill: 'var(--muted)', fontSize: 11 }}
        />
        <Tooltip {...tooltipProps} />
        <Legend verticalAlign="top" height={24} iconType="circle" wrapperStyle={{ fontSize: 12 }} />
        <Bar
          dataKey="succeeded"
          name="Succeeded"
          stackId="runs"
          fill="url(#grad-ok)"
          maxBarSize={28}
          isAnimationActive={false}
        />
        <Bar
          dataKey="failed"
          name="Failed"
          stackId="runs"
          fill="url(#hatch-bad)"
          stroke="var(--bad)"
          radius={[6, 6, 0, 0]}
          maxBarSize={28}
          isAnimationActive={false}
        />
      </BarChart>
    </ResponsiveContainer>
  )
}

function StateDonut({ byState }) {
  const data = Object.entries(byState)
    .filter(([, n]) => n > 0)
    .map(([state, n]) => ({ state, label: formatStatus(state), value: n, tone: statusTone(state) }))
    .sort((a, b) => b.value - a.value)
  const total = data.reduce((sum, d) => sum + d.value, 0)
  return (
    <div className="donut-wrap">
      <div className="donut-chart">
        <ResponsiveContainer width="100%" height={180} className="chart-anim chart-anim-pie">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="label"
              innerRadius="58%"
              outerRadius="90%"
              paddingAngle={3}
              cornerRadius={6}
              stroke="none"
              isAnimationActive={false}
            >
              {data.map((d) => (
                <Cell key={d.state} fill={TONE_COLOR[d.tone]} />
              ))}
            </Pie>
            <Tooltip {...tooltipProps} />
          </PieChart>
        </ResponsiveContainer>
        <div className="donut-center" aria-hidden="true">
          <span className="donut-total">{total.toLocaleString()}</span>
          <span className="donut-unit">runs</span>
        </div>
      </div>
      <ul className="donut-legend" aria-label="Runs by state">
        {data.map((d) => (
          <li key={d.state}>
            <span className={`legend-swatch swatch-${d.tone}`} aria-hidden="true" />
            <span className="legend-label">{d.label}</span>
            <span className="legend-value mono">
              {d.value.toLocaleString()}
              <span className="legend-pct"> ({((d.value / total) * 100).toFixed(0)}%)</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function JobRateChart({ jobs }) {
  const data = jobs
    .map((j) => ({
      name: j.job_name || String(j.job_id),
      rate: normalizeRate(j.success_rate, j.succeeded, j.runs),
    }))
    .filter((d) => d.rate !== null)
    .sort((a, b) => a.rate - b.rate)
  if (!data.length) return <EmptyState>No job has a success rate yet.</EmptyState>
  const height = Math.max(160, data.length * 30 + 40)
  return (
    <ResponsiveContainer width="100%" height={height} className="chart-anim chart-anim-x">
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 40, bottom: 16, left: 0 }}>
        <CartesianGrid horizontal={false} stroke="var(--grid)" strokeDasharray="3 4" />
        <XAxis
          type="number"
          domain={[0, 100]}
          unit="%"
          {...axisProps}
          label={{ value: 'Success rate (%)', position: 'insideBottom', offset: -8, fill: 'var(--muted)', fontSize: 11 }}
        />
        <YAxis
          type="category"
          dataKey="name"
          width={150}
          {...axisProps}
          interval={0}
          tickFormatter={(v) => (v.length > 20 ? `${v.slice(0, 19)}…` : v)}
        />
        <Tooltip {...tooltipProps} formatter={(v) => [formatRate(v), 'Success rate']} />
        <Bar
          dataKey="rate"
          name="Success rate"
          fill="url(#grad-accent)"
          radius={[0, 8, 8, 0]}
          background={{ fill: 'var(--track)', radius: 8 }}
          barSize={14}
          isAnimationActive={false}
        >
          <LabelList
            dataKey="rate"
            position="right"
            formatter={(v) => formatRate(v)}
            style={{ fill: 'var(--muted)', fontSize: 11 }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

export default function Charts({ stats, loading }) {
  const daily = stats?.daily || []
  const byState = stats?.by_state || {}
  const jobs = stats?.jobs || []
  return (
    <div className="charts-row">
      <svg width="0" height="0" className="sr-defs" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id="grad-ok" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--ok)" stopOpacity="1" />
            <stop offset="100%" stopColor="var(--ok)" stopOpacity="0.55" />
          </linearGradient>
          <linearGradient id="grad-bad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--bad)" stopOpacity="1" />
            <stop offset="100%" stopColor="var(--bad)" stopOpacity="0.6" />
          </linearGradient>
          <linearGradient id="grad-accent" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--accent-2)" />
            <stop offset="100%" stopColor="var(--accent)" />
          </linearGradient>
          <pattern id="hatch-bad" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" fill="var(--bad)" />
            <line x1="0" y1="0" x2="0" y2="6" stroke="var(--bad-hatch)" strokeWidth="2" />
          </pattern>
        </defs>
      </svg>
      <ChartCard
        title="Runs per day"
        description="Succeeded (solid) and failed (hatched) runs, stacked."
        loading={loading}
        empty={!daily.length}
      >
        <DailyChart daily={daily} />
      </ChartCard>
      <ChartCard
        title="Runs by state"
        description="Share of all runs on record by final state."
        loading={loading}
        empty={!Object.values(byState).some((n) => n > 0)}
      >
        <StateDonut byState={byState} />
      </ChartCard>
      <ChartCard
        title="Success rate by job"
        description="Percentage of runs that succeeded, lowest first."
        loading={loading}
        empty={!jobs.length}
      >
        <JobRateChart jobs={jobs} />
      </ChartCard>
    </div>
  )
}
