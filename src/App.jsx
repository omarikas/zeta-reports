import { useCallback, useEffect, useMemo, useState } from 'react'
import { Composer } from './components/Composer'
import { Inbox } from './components/Inbox'
import { ReportView } from './components/ReportView'
import { deleteReport, listReports, saveReport } from './db'
import { emptyDraft, isDirty } from './draft'
import { SEVERITIES } from './format'
import { removeMedia } from './uploads'

function hashFor(view) {
  if (view.name === 'compose') return '#/new'
  if (view.name === 'detail') return `#/report/${encodeURIComponent(view.id)}`
  return '#/'
}

function viewFromLocation() {
  const raw = window.location.hash.replace(/^#/, '')
  if (raw === '/new') return { name: 'compose' }
  const prefix = '/report/'
  if (raw.startsWith(prefix)) {
    try {
      const id = decodeURIComponent(raw.slice(prefix.length))
      if (id) return { name: 'detail', id }
    } catch {
      return { name: 'inbox' }
    }
  }
  return { name: 'inbox' }
}


export default function App() {
  const [reports, setReports] = useState([])
  const [ready, setReady] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [view, setView] = useState(viewFromLocation)
  const [draft, setDraft] = useState(emptyDraft)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('open')
  const [severityFilter, setSeverityFilter] = useState('all')
  const [toast, setToast] = useState('')

  const go = useCallback((next) => {
    setView(next)
    const hash = hashFor(next)
    if (window.location.hash !== hash) window.location.hash = hash
  }, [])

  useEffect(() => {
    let cancelled = false
    listReports()
      .then((rows) => {
        if (!cancelled) setReports(rows)
      })
      .catch(() => {
        if (!cancelled) setLoadError('Could not load reports from Supabase.')
      })
      .finally(() => {
        if (!cancelled) setReady(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const onHash = () => setView(viewFromLocation())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [view.name, view.id])

  useEffect(() => {
    if (!toast) return undefined
    const timer = setTimeout(() => setToast(''), 3200)
    return () => clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    function onKey(event) {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      const tag = document.activeElement?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable) return
      if (document.querySelector('[role="dialog"]')) return
      if (event.key.toLowerCase() !== 'n') return
      event.preventDefault()
      go({ name: 'compose' })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go])

  useEffect(() => {
    if (view.name === 'compose') {
      document.title = 'New report · Zeta Pharma'
      return
    }
    if (view.name === 'detail') {
      const report = reports.find((item) => item.id === view.id)
      document.title = report ? `${report.title} · Zeta Pharma` : 'Zeta Pharma'
      return
    }
    document.title = 'Zeta Pharma · Bug reports'
  }, [view, reports])

  const openCount = reports.filter((report) => report.status === 'open').length
  const resolvedCount = reports.length - openCount

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return reports.filter((report) => {
      if (statusFilter !== 'all' && report.status !== statusFilter) return false
      if (severityFilter !== 'all' && report.severity !== severityFilter) return false
      if (!needle) return true
      return [report.title, report.body, report.where].join('\n').toLowerCase().includes(needle)
    })
  }, [reports, query, statusFilter, severityFilter])

  const severityCounts = useMemo(() => {
    const counts = { all: 0, low: 0, medium: 0, high: 0, critical: 0 }
    for (const report of reports) {
      if (statusFilter !== 'all' && report.status !== statusFilter) continue
      counts.all += 1
      counts[report.severity] += 1
    }
    return counts
  }, [reports, statusFilter])

  async function handleCreate(nextDraft) {
    const report = {
      id: crypto.randomUUID(),
      title: nextDraft.title.trim(),
      where: nextDraft.where.trim(),
      body: nextDraft.body.trim(),
      severity: nextDraft.severity,
      status: 'open',
      createdAt: Date.now(),
      attachments: nextDraft.files.map((item) => ({
        id: item.id,
        name: item.file.name || 'attachment',
        type: item.file.type,
        size: item.cloud?.bytes || item.file.size,
        kind: item.cloud?.kind || (item.file.type.startsWith('video/') ? 'video' : 'image'),
        url: item.cloud.url,
        publicId: item.cloud.publicId,
        resourceType: item.cloud.resourceType,
      })),
    }
    await saveReport(report)
    setReports((current) => [report, ...current])
    setDraft(emptyDraft())
    setQuery('')
    setStatusFilter('open')
    setSeverityFilter('all')
    setToast('Report filed')
    go({ name: 'detail', id: report.id })
  }

  async function handleStatus(id, status) {
    const current = reports.find((report) => report.id === id)
    if (!current || current.status === status) return
    const next = { ...current, status }
    await saveReport(next)
    setReports((list) => list.map((report) => (report.id === id ? next : report)))
    setToast(status === 'resolved' ? 'Marked resolved' : 'Reopened')
  }

  async function handleDelete(id) {
    const current = reports.find((report) => report.id === id)
    if (current?.attachments?.length) {
      try {
        await removeMedia(current.attachments)
      } catch {
        // The local report still goes away if Cloudinary cannot be reached.
      }
    }
    await deleteReport(id)
    setReports((list) => list.filter((report) => report.id !== id))
    setToast('Report deleted')
    go({ name: 'inbox' })
  }

  function discardDraft() {
    void removeMedia(draft.files.map((item) => item.cloud).filter(Boolean))
    setDraft(emptyDraft())
    go({ name: 'inbox' })
  }

  function clearFilters() {
    setQuery('')
    setStatusFilter('all')
    setSeverityFilter('all')
  }

  if (!ready) return <p className="loading">Opening the desk…</p>

  if (loadError) {
    return (
      <main className="fatal">
        <h1>Zeta Pharma could not open its notebook.</h1>
        <p>{loadError}</p>
      </main>
    )
  }

  const dirty = isDirty(draft)
  const filtersActive = statusFilter !== 'open' || severityFilter !== 'all' || query.trim() !== ''
  const selected = view.name === 'detail' ? reports.find((report) => report.id === view.id) ?? null : null

  return (
    <div className="app">
      <header className="topbar">
        <button type="button" className="brand" aria-label="Zeta Pharma" onClick={() => go({ name: 'inbox' })}>
          <img className="brand-logo" src={`${import.meta.env.BASE_URL}zeta-pharma-logo.png`} alt="Zeta Pharma" />
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => go({ name: 'compose' })}
          aria-label={dirty && view.name !== 'compose' ? 'New report, draft in progress' : 'New report'}
        >
          New report
          {dirty && view.name !== 'compose' ? <span className="draft-dot" aria-hidden="true" /> : null}
        </button>
      </header>

      <div className="shell">
        <nav className="side" aria-label="Filters">
          <div className="side-group">
            <p className="group-label">Status</p>
            {[
              ['open', 'Open', openCount],
              ['resolved', 'Resolved', resolvedCount],
              ['all', 'All', reports.length],
            ].map(([id, label, count]) => (
              <button
                key={id}
                type="button"
                className={statusFilter === id ? 'nav-btn is-on' : 'nav-btn'}
                aria-pressed={statusFilter === id}
                onClick={() => setStatusFilter(id)}
              >
                <span>{label}</span>
                <span className="count">{count}</span>
              </button>
            ))}
          </div>
          <div className="side-group">
            <p className="group-label">Severity</p>
            <button
              type="button"
              className={severityFilter === 'all' ? 'nav-btn is-on' : 'nav-btn'}
              aria-pressed={severityFilter === 'all'}
              onClick={() => setSeverityFilter('all')}
            >
              <span>Any</span>
              <span className="count">{severityCounts.all}</span>
            </button>
            {SEVERITIES.map((item) => (
              <button
                key={item.id}
                type="button"
                className={severityFilter === item.id ? 'nav-btn is-on' : 'nav-btn'}
                aria-pressed={severityFilter === item.id}
                onClick={() => setSeverityFilter(item.id)}
              >
                <span>{item.label}</span>
                <span className="count">{severityCounts[item.id]}</span>
              </button>
            ))}
          </div>
          <p className="side-hint">Press N for a new report.</p>
        </nav>

        <main className="main">
          {view.name === 'compose' && (
            <Composer draft={draft} onChange={setDraft} onSubmit={handleCreate} onClose={discardDraft} />
          )}
          {view.name === 'detail' && (
            <ReportView report={selected} onBack={() => go({ name: 'inbox' })} onStatus={handleStatus} onDelete={handleDelete} />
          )}
          {view.name === 'inbox' && (
            <Inbox
              reports={visible}
              total={reports.length}
              openCount={openCount}
              query={query}
              onQuery={setQuery}
              filtersActive={filtersActive}
              onOpen={(id) => go({ name: 'detail', id })}
              onCreate={() => go({ name: 'compose' })}
              onClear={clearFilters}
            />
          )}
        </main>
        <p className="colophon">Reports are saved on Supabase. Photos and videos are stored on Cloudinary.</p>
      </div>

      {toast ? (
        <p className="toast" role="status">
          {toast}
        </p>
      ) : null}
    </div>
  )
}
