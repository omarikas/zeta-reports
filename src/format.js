export const SEVERITIES = [
  { id: 'low', label: 'Low', hint: 'Annoyance' },
  { id: 'medium', label: 'Medium', hint: 'Wrong, but usable' },
  { id: 'high', label: 'High', hint: 'A flow is broken' },
  { id: 'critical', label: 'Critical', hint: 'Work is blocked' },
]

export function severityById(id) {
  return SEVERITIES.find((item) => item.id === id) ?? SEVERITIES[1]
}

export function joinList(parts) {
  if (parts.length <= 1) return parts[0] ?? ''
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`
  return `${parts.slice(0, -1).join(', ')}, and ${parts.at(-1)}`
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function mediaParts({ body, images, videos }) {
  const parts = []
  if (body.trim()) parts.push('text')
  if (images === 1) parts.push('1 image')
  if (images > 1) parts.push(`${images} images`)
  if (videos === 1) parts.push('1 video')
  if (videos > 1) parts.push(`${videos} videos`)
  return parts
}

export function describeReport(report) {
  const parts = mediaParts({
    body: report.body,
    images: report.attachments.filter((file) => file.kind === 'image').length,
    videos: report.attachments.filter((file) => file.kind === 'video').length,
  })
  if (parts.length === 0) return 'No details'
  return capitalize(parts.length === 1 ? parts[0] : joinList(parts))
}

export function describeDraft(draft) {
  const parts = mediaParts({
    body: draft.body,
    images: draft.files.filter((item) => item.file.type.startsWith('image/')).length,
    videos: draft.files.filter((item) => item.file.type.startsWith('video/')).length,
  })
  if (parts.length === 0) return 'Add words, images, video, or a mix.'
  if (parts.length === 1) return `This report is ${parts[0]} only.`
  return `This report mixes ${joinList(parts)}.`
}

export function formatBytes(size) {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

export function formatFull(timestamp) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(timestamp)
}

export function formatWhen(timestamp) {
  const delta = Date.now() - timestamp
  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour
  if (delta < minute) return 'Just now'
  if (delta < hour) return `${Math.floor(delta / minute)}m ago`
  if (delta < day) return `${Math.floor(delta / hour)}h ago`
  if (delta < 7 * day) return `${Math.floor(delta / day)}d ago`
  return formatFull(timestamp)
}

export function excerpt(body) {
  const clean = body.replace(/\s+/g, ' ').trim()
  if (clean.length <= 160) return clean
  return `${clean.slice(0, 157)}…`
}
