import { describeReport, excerpt, formatFull, formatWhen, severityById } from '../format'
import { MediaFrame } from './MediaFrame'
import { SeverityPill } from './Pills'

function ReportCard({ report, onOpen }) {
  const cover = report.attachments[0]
  const severity = severityById(report.severity)
  const summary = describeReport(report)
  const quote = excerpt(report.body)

  return (
    <button
      type="button"
      className={report.status === 'resolved' ? `card is-resolved sev-${report.severity}` : `card sev-${report.severity}`}
      onClick={() => onOpen(report.id)}
      aria-label={`${report.title}, ${severity.label}, ${report.status}, ${summary}`}
    >
      {cover ? (
        <MediaFrame blob={cover.blob} src={cover.url} kind={cover.kind} className="card-cover" />
      ) : (
        <span className="card-excerpt">{quote}</span>
      )}
      <span className="card-body">
        <span className="card-kicker">
          <SeverityPill id={report.severity} />
          {report.status === 'resolved' ? <span className="pill status-resolved">Resolved</span> : null}
          <time className="when" dateTime={new Date(report.createdAt).toISOString()} title={formatFull(report.createdAt)}>
            {formatWhen(report.createdAt)}
          </time>
        </span>
        <span className="card-title">{report.title}</span>
        {report.where ? <span className="card-where">{report.where}</span> : null}
        <span className="card-meta">{summary}</span>
      </span>
    </button>
  )
}

export function Inbox({
  reports,
  total,
  openCount,
  query,
  onQuery,
  filtersActive,
  onOpen,
  onCreate,
  onClear,
}) {
  if (total === 0) {
    return (
      <section className="hero-empty">
        <p className="eyebrow">Desk</p>
        <h1>Nothing filed yet.</h1>
        <p className="lede">
          Describe what broke in words, drop in images or a video, or mix them in one report.
          Reports are saved on Supabase. Photos and videos are stored on Cloudinary.
        </p>
        <ul className="mix-list">
          <li>Text</li>
          <li>Images</li>
          <li>Video</li>
          <li>Any mix</li>
        </ul>
        <button type="button" className="btn btn-primary hero-action" onClick={onCreate}>
          New report
        </button>
      </section>
    )
  }

  return (
    <section>
      <header className="inbox-head">
        <div>
          <p className="eyebrow">Desk</p>
          <h1>Reports</h1>
          <p className="lede">
            {openCount === 0
              ? 'Nothing is open.'
              : `${openCount} open ${openCount === 1 ? 'report' : 'reports'}.`}{' '}
            Write it up, attach a screenshot or recording, or send a mix.
          </p>
        </div>
        <label className="search">
          <span className="sr-only">Search reports</span>
          <input
            type="search"
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            placeholder="Search reports"
          />
        </label>
      </header>

      {reports.length === 0 ? (
        <div className="empty-filter">
          <p>{filtersActive ? 'No reports match these filters.' : 'No open reports.'}</p>
          <button type="button" className="btn btn-ghost" onClick={onClear}>
            Show all reports
          </button>
        </div>
      ) : (
        <div className="cards">
          {reports.map((report) => (
            <ReportCard key={report.id} report={report} onOpen={onOpen} />
          ))}
        </div>
      )}
    </section>
  )
}
