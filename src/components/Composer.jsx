import { useEffect, useId, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { isDirty } from '../draft'
import { MAX_ATTACHMENTS, MAX_BYTES, normalizeFile } from '../files'
import { SEVERITIES, describeDraft, formatBytes } from '../format'
import { removeMedia, uploadMedia } from '../uploads'
import { MediaFrame } from './MediaFrame'

function validate(draft) {
  const title = draft.title.trim()
  if (!title) return 'Give the report a title.'
  if (title.length < 3) return 'Use a title with at least 3 characters.'
  if (draft.files.some((item) => item.upload === 'uploading')) {
    return 'Wait for the photos and videos to finish uploading.'
  }
  const failed = draft.files.find((item) => item.upload === 'error')
  if (failed) return failed.error || 'One file did not upload. Try again, or remove it.'
  if (draft.files.some((item) => !item.cloud?.url)) {
    return 'One file is not ready yet.'
  }
  if (!draft.body.trim() && draft.files.length === 0) {
    return 'Add a description, an image, a video, or any mix of those.'
  }
  return ''
}

function AttachmentCard({ item, onRemove, onRetry }) {
  const kind = item.file.type.startsWith('video/') ? 'video' : 'image'
  const uploading = item.upload === 'uploading'
  const failed = item.upload === 'error'
  return (
    <figure className="preview">
      <MediaFrame blob={item.file} kind={kind} className="preview-media" />
      {uploading ? (
        <span className="upload-state">Uploading {Math.round((item.progress || 0) * 100)}%</span>
      ) : null}
      {failed ? (
        <span className="upload-state is-error">
          Upload failed
          <button type="button" onClick={() => onRetry(item)}>
            Try again
          </button>
        </span>
      ) : null}
      <figcaption>
        <span className="preview-name">{item.file.name}</span>
        <span>{formatBytes(item.file.size)}</span>
      </figcaption>
      {failed ? <p className="preview-error">{item.error}</p> : null}
      <button
        type="button"
        className="icon-btn preview-remove"
        onClick={() => onRemove(item.id)}
        aria-label={`Remove ${item.file.name}`}
      >
        Remove
      </button>
    </figure>
  )
}

export function Composer({ draft, onChange, onSubmit, onClose }) {
  const inputId = useId()
  const discardRef = useRef(null)
  const dragDepth = useRef(0)
  const [over, setOver] = useState(false)
  const [notes, setNotes] = useState([])
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [confirmLeave, setConfirmLeave] = useState(false)
  const maxMb = Math.round(MAX_BYTES / (1024 * 1024))
  const dirty = isDirty(draft)
  const uploading = draft.files.some((item) => item.upload === 'uploading')

  function startUpload(id, file) {
    let last = -1
    uploadMedia(file, (progress) => {
      const step = Math.round(progress * 20) / 20
      if (step === last) return
      last = step
      onChange((current) => ({
        ...current,
        files: current.files.map((item) => (item.id === id ? { ...item, progress: step } : item)),
      }))
    })
      .then((cloud) => {
        let kept = false
        flushSync(() => {
          onChange((current) => {
            kept = current.files.some((item) => item.id === id)
            if (!kept) return current
            return {
              ...current,
              files: current.files.map((item) =>
                item.id === id ? { ...item, upload: 'ready', progress: 1, error: '', cloud } : item,
              ),
            }
          })
        })
        if (!kept && cloud?.publicId) void removeMedia([cloud])
      })
      .catch((err) => {
        onChange((current) => ({
          ...current,
          files: current.files.map((item) =>
            item.id === id
              ? {
                  ...item,
                  upload: 'error',
                  error: err instanceof Error ? err.message : 'Could not upload this file.',
                }
              : item,
          ),
        }))
      })
  }

  useEffect(() => {
    function prevent(event) {
      event.preventDefault()
    }
    window.addEventListener('dragover', prevent)
    window.addEventListener('drop', prevent)
    return () => {
      window.removeEventListener('dragover', prevent)
      window.removeEventListener('drop', prevent)
    }
  }, [])

  useEffect(() => {
    if (confirmLeave) discardRef.current?.focus()
  }, [confirmLeave])

  function update(partial) {
    onChange((current) => ({
      ...current,
      ...(typeof partial === 'function' ? partial(current) : partial),
    }))
    setError((current) => (current ? '' : current))
  }

  function addFiles(list, { fromPaste = false } = {}) {
    const accepted = []
    const problems = []
    for (const file of [...list].filter(Boolean)) {
      const result = normalizeFile(file, { fromPaste })
      if (result.error) problems.push(result.error)
      else accepted.push(result.file)
    }
    const room = MAX_ATTACHMENTS - draft.files.length
    if (room <= 0 && accepted.length) {
      problems.push('A report can hold 8 attachments. Remove one to add another.')
    } else if (accepted.length > room) {
      problems.push('A report can hold 8 attachments. The extras were left off.')
    }
    const next = accepted.slice(0, Math.max(room, 0)).map((file) => ({
      id: crypto.randomUUID(),
      file,
      upload: 'uploading',
      progress: 0,
      error: '',
      cloud: null,
    }))
    if (next.length) update((current) => ({ files: [...current.files, ...next] }))
    setNotes(problems)
    for (const item of next) startUpload(item.id, item.file)
  }

  function removeFile(id) {
    const item = draft.files.find((file) => file.id === id)
    if (item?.cloud) void removeMedia([item.cloud])
    update((current) => ({ files: current.files.filter((file) => file.id !== id) }))
  }

  function retryFile(item) {
    onChange((current) => ({
      ...current,
      files: current.files.map((file) =>
        file.id === item.id
          ? { ...file, upload: 'uploading', progress: 0, error: '', cloud: null }
          : file,
      ),
    }))
    startUpload(item.id, item.file)
  }

  function onPaste(event) {
    const clipboard = event.clipboardData
    if (!clipboard) return
    const files = []
    for (const item of clipboard.items ?? []) {
      if (item.kind !== 'file') continue
      const file = item.getAsFile()
      if (file) files.push(file)
    }
    if (!files.length && clipboard.files?.length) files.push(...clipboard.files)
    if (!files.length) return
    event.preventDefault()
    addFiles(files, { fromPaste: true })
  }

  function requestLeave() {
    if (dirty) setConfirmLeave(true)
    else onClose()
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (submitting) return
    const message = validate(draft)
    if (message) {
      setError(message)
      return
    }
    setError('')
    setSubmitting(true)
    try {
      await onSubmit(draft)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this report.')
      setSubmitting(false)
    }
  }

  return (
    <form className="sheet composer" onSubmit={handleSubmit} onPaste={onPaste}>
      <header className="composer-intro">
        <p className="eyebrow">New report</p>
        <h1>What broke?</h1>
      </header>

      <div className="composer-grid">
        <div className="composer-fields">
          <label className="title-field">
            <span className="sr-only">Title</span>
            <input
              className="title-input"
              value={draft.title}
              onChange={(event) => update({ title: event.target.value })}
              placeholder="Short summary of the bug"
              maxLength={140}
              autoFocus
              autoComplete="off"
            />
          </label>

          <label className="field">
            <span>Where</span>
            <input
              value={draft.where}
              onChange={(event) => update({ where: event.target.value })}
              placeholder="Screen, page, or device"
              maxLength={80}
              autoComplete="off"
            />
          </label>

          <fieldset className="severities">
            <legend>Severity</legend>
            <div className="sev-row">
              {SEVERITIES.map((item) => {
                const selected = draft.severity === item.id
                return (
                  <label
                    key={item.id}
                    className={selected ? `sev-choice is-on sev-${item.id}` : `sev-choice sev-${item.id}`}
                  >
                    <input
                      className="sr-only"
                      type="radio"
                      name="severity"
                      value={item.id}
                      checked={selected}
                      onChange={() => update({ severity: item.id })}
                    />
                    <span>{item.label}</span>
                    <small>{item.hint}</small>
                  </label>
                )
              })}
            </div>
          </fieldset>

          <label className="field field-body">
            <span>What happened</span>
            <textarea
              className="body-input"
              value={draft.body}
              onChange={(event) => update({ body: event.target.value })}
              placeholder="What you saw, what you expected, and how to trigger it. Leave this blank if a recording says it all."
              maxLength={8000}
            />
          </label>
        </div>

        <div className="media-panel">
          <h2>Show it</h2>
          <p className="drop-intro">Images, video, or both can share this report with the writing.</p>
          <label
            className={over ? 'drop is-over' : 'drop'}
            onDragEnter={(event) => {
              event.preventDefault()
              dragDepth.current += 1
              setOver(true)
            }}
            onDragOver={(event) => {
              event.preventDefault()
              event.dataTransfer.dropEffect = 'copy'
            }}
            onDragLeave={(event) => {
              event.preventDefault()
              dragDepth.current -= 1
              if (dragDepth.current <= 0) {
                dragDepth.current = 0
                setOver(false)
              }
            }}
            onDrop={(event) => {
              event.preventDefault()
              dragDepth.current = 0
              setOver(false)
              addFiles(event.dataTransfer.files)
            }}
          >
            <input
              id={inputId}
              className="sr-only"
              type="file"
              accept="image/*,video/*,.mov,.m4v,.mkv,.webm"
              multiple
              onChange={(event) => {
                addFiles(event.target.files)
                event.target.value = ''
              }}
            />
            <span className="drop-title">Drop images or video</span>
            <span className="drop-copy">
              Browse, or paste a screenshot anywhere in this form. PNG, JPG, GIF, WEBP, MP4, WEBM,
              and MOV. Up to {maxMb} MB each.
            </span>
          </label>
          <p className="quota">
            {draft.files.length} of {MAX_ATTACHMENTS} attached
          </p>
          {notes.length > 0 && (
            <ul className="notes" role="alert">
              {notes.map((note, index) => (
                <li key={`${note}-${index}`}>{note}</li>
              ))}
            </ul>
          )}
          {draft.files.length > 0 && (
            <div className="previews">
              {draft.files.map((item) => (
                <AttachmentCard key={item.id} item={item} onRemove={removeFile} onRetry={retryFile} />
              ))}
            </div>
          )}
        </div>
      </div>

      <p className="summary" aria-live="polite">
        {describeDraft(draft)}
      </p>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      {confirmLeave ? (
        <div className="confirm">
          <p>Discard this draft? Uploaded photos and videos in it will be removed.</p>
          <button ref={discardRef} type="button" className="btn btn-danger" onClick={onClose}>
            Discard
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setConfirmLeave(false)}>
            Keep writing
          </button>
        </div>
      ) : (
        <div className="composer-actions">
          <button type="button" className="btn btn-ghost" onClick={requestLeave} disabled={submitting}>
            {dirty ? 'Discard' : 'Cancel'}
          </button>
          <button type="submit" className="btn btn-primary" disabled={submitting || uploading}>
            {submitting ? 'Saving…' : uploading ? 'Uploading…' : 'File report'}
          </button>
        </div>
      )}
    </form>
  )
}
