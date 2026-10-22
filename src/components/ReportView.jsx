import { useCallback, useEffect, useRef, useState } from 'react'
import { describeReport, formatBytes, formatFull, formatWhen } from '../format'
import { useObjectUrl } from '../useObjectUrl'
import { MediaFrame } from './MediaFrame'
import { SeverityPill, StatusPill } from './Pills'

function Lightbox({ attachment, onClose }) {
  const objectUrl = useObjectUrl(attachment.blob)
  const url = attachment.url || objectUrl
  const closeRef = useRef(null)

  useEffect(() => {
    closeRef.current?.focus()
    function onKey(event) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [onClose])

  return (
    <div
      className="lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={attachment.name}
      onClick={onClose}
    >
      <button
        ref={closeRef}
        type="button"
        className="btn btn-light lightbox-close"
        onClick={onClose}
      >
        Close
      </button>
      {url ? (
        <img src={url} alt={attachment.name} onClick={(event) => event.stopPropagation()} />
      ) : null}
    </div>
  )
}

export function ReportView({ report, onBack, onStatus, onDelete }) {
  const [activeId, setActiveId] = useState(null)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState('')
  const closeLightbox = useCallback(() => setActiveId(null), [])

  if (!report) {
    return (
      <section className="sheet detail">
        <button type="button" className="back" onClick={onBack}>
          ← All reports
        </button>
        <h1>This report is not here.</h1>
        <p className="lede">It may have been deleted.</p>
      </section>
    )
  }

  const active = report.attachments.find((file) => file.id === activeId) ?? null

  async function changeStatus() {
    setBusy(true)
    setActionError('')
    try {
      await onStatus(report.id, report.status === 'open' ? 'resolved' : 'open')
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not update this report.')
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    setBusy(true)
    setActionError('')
    try {
      await onDelete(report.id)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not delete this report.')
      setBusy(false)
    }
  }

  return (
    <article className="sheet detail">
      <button type="button" className="back" onClick={onBack}>
        ← All reports
      </button>
      <div className="kicker-row">
        <SeverityPill id={report.severity} />
        <StatusPill status={report.status} />
        <time dateTime={new Date(report.createdAt).toISOString()} className="when" title={formatFull(report.createdAt)}>
          {formatWhen(report.createdAt)}
        </time>
        <span className="card-meta">{describeReport(report)}</span>
      </div>
      <h1>{report.title}</h1>
      {report.where ? <p className="where">{report.where}</p> : null}
      {report.body ? (
        <p className="detail-body">{report.body}</p>
      ) : (
        <p className="detail-body muted">No written notes. The attachments are the report.</p>
      )}

      {report.attachments.length > 0 && (
        <section>
          <h2>Attachments</h2>
          <div className="gallery">
            {report.attachments.map((file) => (
              <figure key={file.id}>
                {file.kind === 'image' ? (
                  <button
                    type="button"
                    className="zoom"
                    onClick={() => setActiveId(file.id)}
                    aria-label={`Expand ${file.name}`}
                  >
                    <MediaFrame blob={file.blob} src={file.url} kind={file.kind} className="gallery-media" />
                  </button>
                ) : (
                  <MediaFrame
                    blob={file.blob}
                    src={file.url}
                    kind={file.kind}
                    label={file.name}
                    className="gallery-media"
                    controls
                  />
                )}
                <figcaption>
                  {file.name} · {formatBytes(file.size)}
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}

      {actionError ? (
        <p className="form-error" role="alert">
          {actionError}
        </p>
      ) : null}

      {confirming ? (
        <div className="confirm">
          <p>Delete this report and its attachments?</p>
          <button type="button" className="btn btn-danger" onClick={remove} disabled={busy}>
            Delete
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setConfirming(false)} disabled={busy}>
            Keep
          </button>
        </div>
      ) : (
        <div className="detail-actions">
          <button type="button" className="btn btn-primary" onClick={changeStatus} disabled={busy}>
            {report.status === 'open' ? 'Mark resolved' : 'Reopen'}
          </button>
          <button type="button" className="btn btn-danger" onClick={() => setConfirming(true)} disabled={busy}>
            Delete
          </button>
        </div>
      )}

      {active ? <Lightbox attachment={active} onClose={closeLightbox} /> : null}
    </article>
  )
}
