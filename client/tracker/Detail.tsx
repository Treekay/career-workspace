import { CareerActions } from '../career-ops/Provider';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams, useLocation } from 'react-router-dom';
import { useResource, request } from './api';
import { ErrorState, StageBadge, StageControl } from './components';
import {
  date,
  dateTime,
  daysInStage,
  fit,
  labels,
  type Application,
  type ApplicationEvent,
  type Artifact,
} from './model';
function Editor({
  application,
  onSaved,
}: {
  application: Application;
  onSaved: (data: Application) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  function localDate(value: string | null) {
    if (!value) return '';
    const d = new Date(value);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
  }
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError('');
    setSaved(false);
    try {
      const result = await request<Application>(
        '/api/applications/' + application.id,
        {
          method: 'PATCH',
          body: JSON.stringify({
            notes: form.get('notes') || null,
            next_action: form.get('next_action') || null,
            next_action_at: form.get('next_action_at')
              ? new Date(String(form.get('next_action_at'))).toISOString()
              : null,
          }),
        },
      );
      setSaved(true);
      onSaved({ ...application, ...result });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form id="notes" className="dashboard-panel" onSubmit={save}>
      <h2>Notes & next action</h2>
      <label>
        Next action
        <input
          name="next_action"
          defaultValue={application.next_action || ''}
          maxLength={5000}
        />
      </label>
      <label>
        Due date and time (local)
        <input
          type="datetime-local"
          name="next_action_at"
          defaultValue={localDate(application.next_action_at)}
        />
      </label>
      <label htmlFor="application-notes">Notes</label>
      <textarea
        id="application-notes"
        name="notes"
        rows={6}
        defaultValue={application.notes || ''}
        maxLength={100000}
      />
      {error && (
        <p role="alert" className="inline-error">
          {error}
        </p>
      )}
      {saved && <p role="status">Notes saved.</p>}
      <button className="primary-button" disabled={busy}>
        {busy ? 'Saving…' : 'Save notes & action'}
      </button>
    </form>
  );
}
export function ApplicationDetail() {
  const { id } = useParams();
  const { hash } = useLocation();
  const application = useResource<Application>('/api/applications/' + id);
  const events = useResource<ApplicationEvent[]>(
    '/api/applications/' + id + '/events',
  );
  const artifacts = useResource<Artifact[]>(
    '/api/applications/' + id + '/artifacts',
  );
  useEffect(() => {
    if (!application.data || !hash) return;
    const target = [
      'overview',
      'job-description',
      'analysis',
      'documents',
      'timeline',
      'notes',
    ].find((id) => '#' + id === hash);
    if (target) document.getElementById(target)?.scrollIntoView();
  }, [application.data?.id, hash]);
  function refresh(updated: Application) {
    application.replace(updated);
    events.reload();
  }
  if (application.error)
    return (
      <>
        <Link to="/applications">← Applications</Link>
        <h1>Application detail</h1>
        <ErrorState error={application.error} retry={application.reload} />
      </>
    );
  if (!application.data) return <p role="status">Loading application…</p>;
  const a = application.data;
  return (
    <>
      <Link className="back-link" to="/applications">
        ← Applications
      </Link>
      <div className="tracker-heading detail-heading">
        <div>
          <p className="eyebrow">{a.company}</p>
          <h1>{a.title}</h1>
          <p>
            {a.location || 'Location not recorded'} ·{' '}
            <span className="source-label">{a.source}</span>
            {a.url && (
              <>
                {' '}
                ·{' '}
                <a href={a.url} target="_blank" rel="noopener noreferrer">
                  View original posting ↗
                </a>
              </>
            )}
          </p>
        </div>
        <div className="detail-stage">
          <StageBadge stage={a.stage} />
          <StageControl application={a} onSaved={refresh} />
        </div>
      </div>
      <div className="section-links" aria-label="Application sections">
        {[
          ['overview', 'Overview'],
          ['job-description', 'Job Description'],
          ['analysis', 'Analysis'],
          ['documents', 'Documents'],
          ['timeline', 'Timeline'],
          ['notes', 'Notes'],
        ].map(([id, label]) => (
          <a key={id} href={'#' + id}>
            {label}
          </a>
        ))}
      </div>
      <div id="overview" className="detail-facts">
        <div>
          <span>Fit</span>
          <strong>{fit(a)}</strong>
        </div>
        <div>
          <span>Applied</span>
          <strong>{a.applied_at ? date(a.applied_at) : 'Not applied'}</strong>
        </div>
        <div>
          <span>In current stage</span>
          <strong>{daysInStage(a)} days</strong>
        </div>
        <div>
          <span>Next action</span>
          <strong>{a.next_action || 'Not set'}</strong>
          <small>
            {a.next_action_at ? date(a.next_action_at) : 'No due date'}
          </small>
        </div>
      </div>
      <section className="dashboard-panel compact-summary">
        <h2>Latest analysis</h2>
        <p>
          {a.analysis_summary ||
            'No analysis yet. Save a JD snapshot, then use Analyze Fit below.'}
        </p>
        <a href="#analysis">Open analysis actions →</a> ·{' '}
        <a href="#notes">Edit next action →</a>
      </section>
      <div className="detail-grid">
        <div>
          <section id="job-description" className="dashboard-panel">
            <div className="panel-title">
              <h2>Job Description snapshot</h2>
              <span>
                {a.jd_saved_at
                  ? 'Saved ' + date(a.jd_saved_at)
                  : 'No save date'}
              </span>
            </div>
            {a.jd_markdown ? (
              <pre className="document-text">{a.jd_markdown}</pre>
            ) : (
              <p className="empty-copy">No job description snapshot saved.</p>
            )}
          </section>
          <section id="analysis" className="dashboard-panel">
            <h2>Career Ops analysis</h2>
            <CareerActions
              key={a.id}
              applicationId={a.id}
              hasJd={Boolean(a.jd_markdown?.trim())}
              onComplete={() => {
                application.reload();
                artifacts.reload();
                events.reload();
              }}
            />
            {a.analysis_summary ? (
              <p className="document-text">{a.analysis_summary}</p>
            ) : (
              <p className="empty-copy">No analysis recorded.</p>
            )}
          </section>
          <section id="documents" className="dashboard-panel">
            <h2>CV / Cover Letter artifacts</h2>
            {artifacts.error ? (
              <ErrorState error={artifacts.error} retry={artifacts.reload} />
            ) : !artifacts.data ? (
              <p role="status">Loading artifacts…</p>
            ) : !artifacts.data.length ? (
              <p className="empty-copy">No artifacts attached.</p>
            ) : (
              <ul className="artifact-list">
                {artifacts.data.map((artifact) => (
                  <li key={artifact.id}>
                    <strong>{artifact.type.replaceAll('_', ' ')}</strong>
                    <code>{artifact.path}</code>
                    <small>
                      {date(artifact.created_at)} · Local path reference
                    </small>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <Editor key={a.id} application={a} onSaved={application.replace} />
        </div>
        <section id="timeline" className="dashboard-panel timeline-panel">
          <h2>Application timeline</h2>
          {events.error ? (
            <ErrorState error={events.error} retry={events.reload} />
          ) : !events.data ? (
            <p role="status">Loading timeline…</p>
          ) : (
            <ol className="timeline">
              {[...events.data].reverse().map((event) => (
                <li key={event.id}>
                  <span className="timeline-dot" />
                  <strong>
                    {event.event_type === 'CREATED'
                      ? 'Tracking started'
                      : event.event_type === 'STAGE_CHANGED'
                        ? 'Moved to ' + labels[event.stage]
                        : event.event_type === 'IMPORTED'
                          ? 'Browser import'
                          : event.event_type === 'ARCHIVED'
                            ? 'Archived'
                            : 'Artifact added'}
                  </strong>
                  {event.event_type === 'CREATED' && (
                    <StageBadge stage={event.stage} />
                  )}
                  <time dateTime={event.event_at}>
                    {dateTime(event.event_at)}
                  </time>
                  {event.note && <p>{event.note}</p>}
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </>
  );
}
