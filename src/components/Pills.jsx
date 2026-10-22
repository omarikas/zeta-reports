import { severityById } from '../format'

export function SeverityPill({ id }) {
  const item = severityById(id)
  return <span className={`pill sev-${item.id}`}>{item.label}</span>
}

export function StatusPill({ status }) {
  const resolved = status === 'resolved'
  return (
    <span className={resolved ? 'pill status-resolved' : 'pill status-open'}>
      {resolved ? 'Resolved' : 'Open'}
    </span>
  )
}
