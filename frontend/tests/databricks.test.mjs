import { test } from 'node:test'
import assert from 'node:assert/strict'
import handler from '../netlify/functions/databricks.mts'

const request = (body, headers = {}) => new Request('https://pipesage.netlify.app/.netlify/functions/databricks', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) })
const details = () => ({ host: 'https://dbc-example.cloud.databricks.com', token: 'fictional-test-value' })

test('rejects non-Databricks hosts, paths, credentials and unsafe schemes before fetching', async () => {
  for (const host of ['http://dbc-example.cloud.databricks.com', 'https://localhost', 'https://databricks.com.attacker.example', 'https://dbc-example.cloud.databricks.com/path', 'https://name:password@dbc-example.cloud.databricks.com', 'https://dbc-example.cloud.databricks.com:8443']) {
    const response = await handler(request({ ...details(), host }))
    assert.equal(response.status, 400)
  }
})

test('rejects cross-origin submissions and missing tokens', async () => {
  assert.equal((await handler(request(details(), { Origin: 'https://unrelated.example' }))).status, 403)
  assert.equal((await handler(request({ ...details(), token: '' }))).status, 400)
})

test('reads paginated jobs and runs without returning credentials or arbitrary upstream fields', async () => {
  const original = globalThis.fetch
  const calls = []
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options })
    if (url.pathname.endsWith('/jobs/list')) {
      return Response.json(url.searchParams.has('page_token') ? { jobs: [{ job_id: 2, settings: { name: 'Daily marts' } }] } : { jobs: [{ job_id: 1, settings: { name: 'Orders ingest' } }], next_page_token: 'second-page' })
    }
    return Response.json({ runs: [{ job_id: 1, run_id: 123, start_time: 1000, end_time: 6000, state: { result_state: 'FAILED', state_message: 'Recorded failure' }, arbitrary_private_field: 'omit-me' }] })
  }
  try {
    const response = await handler(request(details()))
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    const body = await response.json()
    assert.equal(body.jobs.length, 2)
    assert.equal(body.runs[0].job_name, 'Orders ingest')
    assert.equal(body.runs[0].duration_seconds, 5)
    assert.equal(body.runs[0].arbitrary_private_field, undefined)
    assert.equal(JSON.stringify(body).includes(details().token), false)
    assert.equal(calls.length, 3)
    assert.ok(calls.every(call => call.options.redirect === 'error' && !call.options.method))
  } finally { globalThis.fetch = original }
})

test('returns safe authentication errors without forwarding upstream error bodies', async () => {
  const original = globalThis.fetch
  globalThis.fetch = async () => new Response('private upstream diagnostic', { status: 401 })
  try {
    const response = await handler(request(details()))
    assert.equal(response.status, 401)
    assert.equal((await response.text()).includes('private upstream'), false)
  } finally { globalThis.fetch = original }
})

test('bounds pagination and marks incomplete results', async () => {
  const original = globalThis.fetch
  let calls = 0
  globalThis.fetch = async url => { calls++; return Response.json({ [url.pathname.endsWith('/jobs/list') ? 'jobs' : 'runs']: [], next_page_token: String(calls) }) }
  try {
    const response = await handler(request(details()))
    assert.equal((await response.json()).truncated, true)
    assert.equal(calls, 8)
  } finally { globalThis.fetch = original }
})
