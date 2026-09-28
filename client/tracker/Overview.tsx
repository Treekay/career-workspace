import { WorkflowSummary } from '../Workspace';
import { Link } from 'react-router-dom';
import { applicationStages } from '../../shared/tracker';
import { useApplications } from './api';
import { ErrorState, StageBadge } from './components';
import {
  closed,
  waiting,
  colors,
  labels,
  date,
  daysInStage,
  type Application,
} from './model';
export function Overview() {
  const { data, error, reload } = useApplications();
  if (error) return <ErrorState error={error} retry={reload} />;
  if (!data) return <p role="status">Loading overview…</p>;
  const active = data.filter((a) => !closed(a));
  const waitingRows = data
    .filter(waiting)
    .sort((a, b) => daysInStage(b) - daysInStage(a));
  const actions = active
    .filter((a) => a.next_action)
    .sort((a, b) =>
      (a.next_action_at || '9999').localeCompare(b.next_action_at || '9999'),
    )
    .slice(0, 3);
  const ranked = active
    .filter((a) => a.fit_score !== null)
    .sort((a, b) => b.fit_score! - a.fit_score!)
    .slice(0, 3);
  const kpis = [
    ['Total applications', data.length, 'All tracked jobs'],
    ['Active', active.length, 'All non-closed stages'],
    ['Waiting', waitingRows.length, 'Applied + Screening'],
    [
      'Interviews',
      data.filter((a) => a.stage === 'INTERVIEW').length,
      'Current interviews',
    ],
    [
      'Rejected',
      data.filter((a) => a.stage === 'REJECTED').length,
      'Closed by employer',
    ],
    [
      'Offers',
      data.filter((a) => a.stage === 'OFFERED').length,
      'Current offers',
    ],
  ] as const;
  let cursor = 0;
  const segments = applicationStages.map((stage) => {
    const count = data.filter((a) => a.stage === stage).length;
    const start = cursor;
    cursor += data.length ? (count / data.length) * 100 : 0;
    return colors[stage] + ' ' + start + '% ' + cursor + '%';
  });
  return (
    <>
      <div className="tracker-heading">
        <div>
          <p className="eyebrow">YOUR SEARCH AT A GLANCE</p>
          <h1>Overview</h1>
          <p>Your applications, discoveries, and next actions in one place.</p>
        </div>
        <Link className="primary-button" to="/applications?add=true">
          + Add application
        </Link>
      </div>
      <div className="kpi-grid">
        {kpis.map(([label, value, hint]) => (
          <article
            className={
              'kpi ' +
              (label === 'Rejected'
                ? 'negative'
                : label === 'Waiting'
                  ? 'neutral'
                  : '')
            }
            key={label}
          >
            <span>{label}</span>
            <strong>{value}</strong>
            <small>{hint}</small>
          </article>
        ))}
      </div>
      <WorkflowSummary />
      {!data.length && (
        <div className="empty-inline">
          <h2>Your application workspace starts here.</h2>
          <p>
            Add a job when you decide it is worth following. Your dashboard will
            grow with your search.
          </p>
        </div>
      )}
      <div className="dashboard-grid">
        <section className="dashboard-panel">
          <div className="panel-title">
            <h2>Application status</h2>
            <span>{data.length} tracked</span>
          </div>
          <div className="status-chart">
            <div
              className="donut"
              role="img"
              aria-label={
                'Application status: ' +
                applicationStages
                  .map(
                    (s) =>
                      labels[s] +
                      ' ' +
                      data.filter((a) => a.stage === s).length,
                  )
                  .join(', ')
              }
              style={{
                background: data.length
                  ? 'conic-gradient(' + segments.join(',') + ')'
                  : '#e9edea',
              }}
            >
              <div>
                <strong>{data.length}</strong>
                <span>applications</span>
              </div>
            </div>
            <ul className="chart-legend">
              {applicationStages.map((stage) => (
                <li key={stage}>
                  <span
                    className="legend-dot"
                    style={{ background: colors[stage] }}
                  />
                  {labels[stage]}
                  <strong>
                    {data.filter((a) => a.stage === stage).length}
                  </strong>
                </li>
              ))}
            </ul>
          </div>
        </section>
        <section className="dashboard-panel">
          <div className="panel-title">
            <h2>Upcoming actions</h2>
            <span>Next steps</span>
          </div>
          {actions.length ? (
            actions.map((a) => (
              <Link
                className="action-row"
                key={a.id}
                to={'/applications/' + a.id}
              >
                <div>
                  <strong>{a.next_action}</strong>
                  <small>
                    {a.company} · {a.title}
                  </small>
                </div>
                <span
                  className={
                    a.next_action_at &&
                    new Date(a.next_action_at).getTime() < Date.now()
                      ? 'overdue'
                      : ''
                  }
                >
                  {a.next_action_at ? date(a.next_action_at) : 'Unscheduled'}
                </span>
              </Link>
            ))
          ) : (
            <p className="empty-copy">
              No upcoming actions. Add a next step from an application’s detail
              page.
            </p>
          )}
        </section>
        <section className="dashboard-panel">
          <div className="panel-title">
            <h2>Waiting for response</h2>
            <Link to="/applications?filter=Waiting">View all →</Link>
          </div>
          <p className="panel-caption">
            Applied and screening · longest wait first
          </p>
          {waitingRows.length ? (
            waitingRows.slice(0, 3).map((a) => (
              <Link
                className="action-row"
                key={a.id}
                to={'/applications/' + a.id}
              >
                <div>
                  <strong>{a.company}</strong>
                  <small>{a.title}</small>
                </div>
                <div className="row-end">
                  <StageBadge stage={a.stage} />
                  <small>{daysInStage(a)} days in stage</small>
                </div>
              </Link>
            ))
          ) : (
            <p className="empty-copy">
              No applications waiting for a response.
            </p>
          )}
        </section>
        <section className="dashboard-panel">
          <div className="panel-title">
            <h2>Fit ranking</h2>
            <Link to="/analytics">Active · top 3 →</Link>
          </div>
          <p className="panel-caption">Recorded fit scores, out of 100</p>
          {ranked.length ? (
            ranked.map((a: Application) => (
              <Link
                className="ranking-row"
                key={a.id}
                to={'/applications/' + a.id}
              >
                <div>
                  <strong>{a.company}</strong>
                  <span>{a.fit_score}</span>
                </div>
                <small>{a.title}</small>
                <meter
                  min="0"
                  max="100"
                  value={a.fit_score!}
                  aria-label={'Fit for ' + a.company}
                />
              </Link>
            ))
          ) : (
            <p className="empty-copy">
              No fit scores recorded yet. Scores will appear here when an
              analysis is available.
            </p>
          )}
        </section>
      </div>
    </>
  );
}
