const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, '')
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

async function request(url, options) {
  let response
  try {
    response = await fetch(url, options)
  } catch {
    throw new Error('Could not reach the reports database.')
  }
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(payload.error || payload.message || 'Could not save this report.')
  }
  return payload
}

function mapAttachment(row) {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    size: row.size,
    kind: row.kind,
    url: row.url,
    publicId: row.public_id,
    resourceType: row.resource_type,
  }
}

function mapReport(row) {
  return {
    id: row.id,
    title: row.title,
    where: row.where_text,
    body: row.body,
    severity: row.severity,
    status: row.status,
    createdAt: Number(row.created_at),
    attachments: (row.attachments ?? []).map(mapAttachment),
  }
}

function supabase(path, { method = 'GET', body, prefer } = {}) {
  return request(`${supabaseUrl}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
}

export function listReports() {
  if (!supabaseUrl || !supabaseKey) return request('/api/reports')
  return supabase(
    'reports?select=id,title,where_text,body,severity,status,created_at,attachments(id,name,type,size,kind,url,public_id,resource_type)&order=created_at.desc',
  ).then((rows) => (rows ?? []).map(mapReport))
}

export async function saveReport(report) {
  if (!supabaseUrl || !supabaseKey) {
    return request(`/api/reports/${encodeURIComponent(report.id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(report),
    })
  }
  await supabase('reports?on_conflict=id', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=minimal',
    body: {
      id: report.id,
      title: report.title,
      where_text: report.where,
      body: report.body,
      severity: report.severity,
      status: report.status,
      created_at: report.createdAt,
    },
  })
  await supabase(`attachments?report_id=eq.${report.id}`, {
    method: 'DELETE',
    prefer: 'return=minimal',
  })
  if (report.attachments.length) {
    await supabase('attachments', {
      method: 'POST',
      prefer: 'return=minimal',
      body: report.attachments.map((file) => ({
        id: file.id,
        report_id: report.id,
        name: file.name,
        type: file.type,
        size: file.size,
        kind: file.kind,
        url: file.url,
        public_id: file.publicId,
        resource_type: file.resourceType,
      })),
    })
  }
  return report
}

export async function deleteReport(id) {
  if (!supabaseUrl || !supabaseKey) {
    return request(`/api/reports/${encodeURIComponent(id)}`, { method: 'DELETE' })
  }
  const rows = await supabase(`reports?id=eq.${id}`, {
    method: 'DELETE',
    prefer: 'return=representation',
  })
  if (!rows?.length) throw new Error('This report is not here.')
}
