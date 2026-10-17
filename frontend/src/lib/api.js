export class ApiError extends Error {
  constructor(message, { status, unreachable } = {}) {
    super(message)
    this.status = status
    this.unreachable = Boolean(unreachable)
  }
}

async function request(url, options) {
  let res
  try {
    res = await fetch(url, options)
  } catch {
    throw new ApiError('Backend unreachable', { unreachable: true })
  }
  if (!res.ok) {
    let detail = ''
    try {
      const body = await res.json()
      detail = body?.detail || body?.error || ''
    } catch {
      /* non-JSON error body */
    }
    // The Vite proxy answers 500/502/504 when the Python server is down.
    const unreachable = [500, 502, 503, 504].includes(res.status) && !detail
    throw new ApiError(detail || `Request failed (${res.status})`, {
      status: res.status,
      unreachable,
    })
  }
  return res.json()
}

export const fetcher = (url) => request(url)

export function refreshFromDatabricks() {
  return request('/api/runs/refresh', { method: 'POST' })
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const el = document.createElement('textarea')
    el.value = text
    el.setAttribute('readonly', '')
    el.style.position = 'fixed'
    el.style.opacity = '0'
    document.body.appendChild(el)
    el.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(el)
    return ok
  }
}

export function downloadText(filename, text) {
  const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export function resolveRun(runId, body) {
  return request(`/api/report/${encodeURIComponent(runId)}/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export function unresolveRun(runId) {
  return request(`/api/report/${encodeURIComponent(runId)}/resolution`, { method: 'DELETE' })
}
