import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseUpload, summarizeWorkspace } from '../src/lib/workspace-data.js'

const run = { run_id: 'r1', job_id: 'orders', status: 'SUCCESS', start_time: '2026-10-29T08:00:00Z', duration_seconds: 60 }

test('imports valid RunRecord examples from the repository and derives job health', () => {
  // Later fixture entries intentionally contain malformed and duplicate records.
  const fixture = JSON.parse(readFileSync(new URL('../../data/mock_runs.json', import.meta.url), 'utf8'))
  const data = parseUpload(JSON.stringify(fixture.slice(0, 10)), 'runs.json')
  const summary = summarizeWorkspace(data)
  assert.ok(data.runs.length > 0)
  assert.ok(summary.jobs.length > 0)
  assert.equal(summary.jobs.reduce((sum, job) => sum + job.runs, 0), data.runs.length)
  assert.ok(summary.average > 0)
})

test('accepts Databricks response format and computes milliseconds-based duration', () => {
  const data = parseUpload(JSON.stringify({ runs: [{ job_id: 1, run_id: 2, start_time: 1000, end_time: 7000, state: { result_state: 'TIMEDOUT', state_message: 'Deadline exceeded' } }] }), 'export.json')
  assert.equal(data.runs[0].duration_seconds, 6)
  assert.equal(data.runs[0].status, 'TIMED_OUT')
  assert.equal(summarizeWorkspace(data).failed, 1)
})

test('rejects invalid files, missing fields, duplicate runs, invalid timestamps and durations', () => {
  for (const value of [[], {}, [null], [{ ...run, job_id: null }], [run, run], [{ ...run, start_time: 'invalid' }], [{ ...run, duration_seconds: -2 }], [{ ...run, end_time: '2026-10-28T00:00:00Z' }]]) {
    assert.throws(() => parseUpload(JSON.stringify(value), 'invalid.json'))
  }
  assert.throws(() => parseUpload('invalid json', 'invalid.json'))
})

test('uses the latest run by timestamp and leaves missing durations unknown', () => {
  const data = parseUpload(JSON.stringify([{ ...run, status: 'FAILED' }, { ...run, run_id: 'r2', start_time: '2026-10-30T08:00:00Z', duration_seconds: null }]), 'runs.json')
  const summary = summarizeWorkspace(data)
  assert.equal(summary.jobs[0].last_run.run_id, 'r2')
  assert.equal(summary.jobs[0].success_rate, 50)
  assert.equal(summary.average, 60)
  assert.equal(data.runs[1].duration_seconds, null)
})
