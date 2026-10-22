const SEVERITIES = new Set(['low', 'medium', 'high', 'critical'])
const STATUSES = new Set(['open', 'resolved'])
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

let settings = null

function httpError(status, message) {
  return Object.assign(new Error(message), { status })
}

export function configureReports(env) {
  settings = {
    url: env.SUPABASE_URL?.trim().replace(/\/$/, '') ?? '',
    key: env.SUPABASE_SECRET_KEY?.trim() ?? '',
  }
}

function config() {
  if (!settings?.url || !settings?.key) {
    throw httpError(500, 'Supabase URL or secret key is missing from .env.')
  }
  return settings
}

function text(value, label, max) {
  if (typeof value !== 'string') throw httpError(400, `${label} needs to be text.`)
  const trimmed = value.trim()
  if (trimmed.length > max) throw httpError(400, `${label} is too long.`)
  return trimmed
}

function attachment(value) {
  if (!value || typeof value !== 'object') throw httpError(400, 'An attachment is missing.')
  const id = text(value.id, 'Attachment id', 80)
  if (!UUID.test(id)) throw httpError(400, 'An attachment id is not valid.')
  const url = text(value.url, 'Attachment address', 2000)
  if (!url.startsWith('https://')) throw httpError(400, 'An attachment address is not valid.')
  const resourceType = value.resourceType === 'video' ? 'video' : 'image'
  const kind = value.kind === 'video' ? 'video' : resourceType
  const size = Number(value.size)
  if (!Number.isInteger(size) || size < 0 || size > 40 * 1024 * 1024) {
    throw httpError(400, 'An attachment size is not valid.')
  }
  const publicId = text(value.publicId, 'Cloudinary id', 400)
  if (!publicId) throw httpError(400, 'An attachment is missing its Cloudinary id.')
  return {
    id,
    name: text(value.name || 'attachment', 'Attachment name', 180) || 'attachment',
    type: text(value.type || 'application/octet-stream', 'Attachment type', 120),
    size,
    kind,
    url,
    publicId,
    resourceType,
  }
}

export function normalizeReport(input, id) {
  if (!UUID.test(id)) throw httpError(400, 'This report id is not valid.')
  const title = text(input?.title, 'Title', 140)
  if (title.length < 3) throw httpError(400, 'Use a title with at least 3 characters.')
  const severity = input?.severity
  const status = input?.status
  if (!SEVERITIES.has(severity)) throw httpError(400, 'Choose a severity.')
  if (!STATUSES.has(status)) throw httpError(400, 'Choose a status.')
  const createdAt = Number(input?.createdAt)
  if (!Number.isFinite(createdAt) || createdAt < 0) throw httpError(400, 'This report has no date.')
  const files = Array.isArray(input?.attachments) ? input.attachments : []
  if (files.length > 8) throw httpError(400, 'A report can hold 8 attachments.')
  return {
    id,
    title,
    where: text(input?.where ?? '', 'Where', 80),
    body: text(input?.body ?? '', 'Description', 20000),
    severity,
    status,
    createdAt,
    attachments: files.map(attachment),
  }
}

async function supabase(path, { method = 'GET', body, prefer } = {}) {
  const { url, key } = config()
  let response
  try {
    response = await fetch(`${url}/rest/v1/${path}`, {
      method,
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'User-Agent': 'zeta-reports',
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(prefer ? { Prefer: prefer } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw httpError(502, 'Could not reach Supabase.')
  }
  if (response.status === 204) return null
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message = payload.message || payload.error || 'Could not save this report.'
    throw httpError(response.status >= 500 ? 502 : response.status, message)
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

export async function listReports() {
  const rows = await supabase(
    'reports?select=id,title,where_text,body,severity,status,created_at,attachments(id,name,type,size,kind,url,public_id,resource_type)&order=created_at.desc',
  )
  return (rows ?? []).map(mapReport)
}

export async function saveReport(report) {
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
  if (!UUID.test(id)) throw httpError(400, 'This report id is not valid.')
  const rows = await supabase(`reports?id=eq.${id}`, {
    method: 'DELETE',
    prefer: 'return=representation',
  })
  if (!rows?.length) throw httpError(404, 'This report is not here.')
}
