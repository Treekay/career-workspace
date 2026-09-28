import { Link } from 'react-router-dom';
import { useResource } from './tracker/api';
import { ErrorState } from './tracker/components';
import { labels, dateTime } from './tracker/model';
import type { ApplicationStage } from '../shared/tracker';
import type { WorkspaceSummary } from '../shared/workspace';
export function WorkflowSummary() {
  const summary = useResource<WorkspaceSummary>('/api/workspace/summary');
  return (
    <>
      <div className="workflow-links" aria-label="Workspace shortcuts">
        <Link to="/discover?scope=Today">Today’s jobs →</Link>
        <Link to="/applications?filter=Active">Active applications →</Link>
        <Link to="/applications?filter=All&stage=INTERVIEW">
          Upcoming interviews →
        </Link>
        <Link to="/career-ops">Career Ops tasks →</Link>
      </div>
      {summary.error ? (
        <ErrorState error={summary.error} retry={summary.reload} />
      ) : !summary.data ? (
        <p role="status">Loading workspace activity…</p>
      ) : (
        <div className="dashboard-grid workspace-summary">
          <section className="dashboard-panel">
            <div className="panel-title">
              <h2>Discovery snapshot</h2>
              <Link to="/discover">Explore jobs →</Link>
            </div>
            <div className="discovery-counts">
              <Link to="/discover?scope=Today">
                <strong>{summary.data.discovery.today ?? '—'}</strong>
                <span>Today’s discovered jobs</span>
              </Link>
              <Link to="/discover?scope=Last+30+Days&fit=HIGH">
                <strong>{summary.data.discovery.high ?? '—'}</strong>
                <span>HIGH fit · last 30 days</span>
              </Link>
            </div>
            <p className="empty-copy">{summary.data.discovery.message}</p>
            {summary.data.discovery.updatedAt && (
              <small>
                Export updated {dateTime(summary.data.discovery.updatedAt)}
              </small>
            )}
            {!['ready', 'stale'].includes(summary.data.discovery.status) && (
              <Link to="/settings">Check integration settings →</Link>
            )}
          </section>
          <section className="dashboard-panel">
            <div className="panel-title">
              <h2>Recent activity</h2>
              <span>Recorded history</span>
            </div>
            {!summary.data.activity.length ? (
              <p className="empty-copy">
                No activity yet. Save an application to start its history.
              </p>
            ) : (
              summary.data.activity.slice(0, 3).map((e) => {
                const description =
                  e.type === 'STAGE_CHANGED'
                    ? 'Moved to ' + labels[e.stage as ApplicationStage]
                    : e.type === 'CREATED'
                      ? 'Tracking started · ' +
                        labels[e.stage as ApplicationStage]
                      : e.type === 'IMPORTED'
                        ? 'Browser import'
                        : e.type === 'ARCHIVED'
                          ? 'Application archived'
                          : e.note?.startsWith('Career Ops:')
                            ? 'Career Ops result saved'
                            : 'Artifact added';
                const content = (
                  <>
                    <div>
                      <strong>{description}</strong>
                      <small>
                        {e.company} · {e.title}
                        {e.archived ? ' · Archived' : ''}
                      </small>
                    </div>
                    <time dateTime={e.at}>{dateTime(e.at)}</time>
                  </>
                );
                return e.archived ? (
                  <div className="action-row" key={e.id}>
                    {content}
                  </div>
                ) : (
                  <Link
                    className="action-row"
                    key={e.id}
                    to={'/applications/' + e.applicationId + '#timeline'}
                  >
                    {content}
                  </Link>
                );
              })
            )}
          </section>
        </div>
      )}
    </>
  );
}
