async function request(url, options) {
  let response
  try {
    response = await fetch(url, options)
  } catch {
    throw new Error('Could not reach the reports database.')
  }
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(payload.error || 'Could not save this report.')
  }
  return payload
}

export function listReports() {
  return request('/api/reports')
}

export function saveReport(report) {
  return request(`/api/reports/${encodeURIComponent(report.id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(report),
  })
}

export function deleteReport(id) {
  return request(`/api/reports/${encodeURIComponent(id)}`, { method: 'DELETE' })
}
