import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  careerActions,
  careerLabels,
  type CareerAction,
  type CareerConnection,
  type CareerRun,
} from '../../shared/career-ops';
import { request, useResource } from '../tracker/api';
import { ErrorState } from '../tracker/components';
import { date, dateTime } from '../tracker/model';
import type { CareerDashboard } from '../../shared/workspace';
export function CareerConnectionPanel() {
  const [data, setData] = useState<CareerConnection>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function check(test = false) {
    setBusy(true);
    setError('');
    try {
      setData(
        await request<CareerConnection>(
          test ? '/api/career-ops/test' : '/api/career-ops/connection',
          test ? { method: 'POST', body: '{}' } : {},
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void check();
  }, []);
  return (
    <section className="dashboard-panel">
      <div className="panel-title">
        <h2>Career Ops provider</h2>
        <span
          className={
            'tag ' + (data?.status === 'Connected' ? 'success' : 'warning')
          }
        >
          {busy
            ? 'Checking…'
            : data?.status === 'Connected'
              ? 'Connected'
              : data?.status === 'Missing'
                ? 'Unavailable'
                : data?.status === 'Invalid'
                  ? 'Error'
                  : 'Unavailable'}
        </span>
      </div>
      <p>
        Career Ops path: <code>{data?.configuredPath || '../career-ops'}</code>
      </p>
      <p>
        Set CAREER_OPS_PATH in .env to change the path, then restart. Relative
        paths start at this workspace.
      </p>
      {data && (
        <>
          <p className="resolved">{data.path}</p>
          <p role="status">{data.message}</p>
        </>
      )}
      {error && (
        <p role="alert" className="inline-error">
          {error}
        </p>
      )}
      <button disabled={busy} onClick={() => check(true)}>
        Test connection
      </button>
      <p className="empty-copy">
        Optional provider. Draft actions use your locally installed Codex CLI
        and its model service. Connection tests do not generate content.
      </p>
    </section>
  );
}
export function CareerOpsPage() {
  const dashboard = useResource<CareerDashboard>('/api/workspace/career-ops');
  const connection = useResource<CareerConnection>(
    '/api/career-ops/connection',
  );
  const [selected, setSelected] = useState('');
  const data = dashboard.data;
  const application = data?.applications.find((a) => a.id === selected);
  const pending =
    data?.applications.filter(
      (a) => !a.analyzed && !['REJECTED', 'WITHDRAWN'].includes(a.stage),
    ) || [];
  useEffect(() => {
    if (!data?.runs.some((r) => r.status === 'running')) return;
    const timer = setTimeout(dashboard.reload, 3000);
    return () => clearTimeout(timer);
  }, [data]);
  function identity(id: string) {
    const a = data?.applications.find((a) => a.id === id);
    return a ? a.company + ' · ' + a.title : 'Application';
  }
  return (
    <>
      <div className="tracker-heading">
        <div>
          <p className="eyebrow">APPLICATION SUPPORT</p>
          <h1>Career Ops</h1>
          <p>Turn saved job descriptions into analysis and useful drafts.</p>
        </div>
        <Link to="/settings">Provider settings →</Link>
      </div>
      {(connection.error || connection.data?.status !== 'Connected') && (
        <div className="notice" role="status">
          {connection.error
            ? 'Provider status unavailable.'
            : connection.data
              ? 'Career Ops is unavailable. Your applications and saved results remain accessible.'
              : 'Checking provider availability…'}{' '}
          <Link to="/settings">Check connection in Settings →</Link>
        </div>
      )}
      {dashboard.error ? (
        <ErrorState error={dashboard.error} retry={dashboard.reload} />
      ) : !data ? (
        <p role="status">Loading Career Ops tasks…</p>
      ) : (
        <>
          {data.warnings.map((w) => (
            <p className="notice" role="alert" key={w}>
              {w}
            </p>
          ))}
          <section className="dashboard-panel">
            <div className="panel-title">
              <h2>Application workflows</h2>
              <Link to="/applications">Open applications →</Link>
            </div>
            {!data.applications.length ? (
              <p className="empty-copy">
                No applications yet. Save a role and its Job Description to
                start an analysis.
              </p>
            ) : (
              <>
                <label>
                  Choose application
                  <select
                    value={selected}
                    onChange={(e) => setSelected(e.target.value)}
                  >
                    <option value="">Select an application</option>
                    {data.applications.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.company} · {a.title}
                      </option>
                    ))}
                  </select>
                </label>
                {application && (
                  <>
                    <p>
                      <Link
                        to={'/applications/' + application.id + '#analysis'}
                      >
                        Open application workspace →
                      </Link>
                    </p>
                    <CareerActions
                      key={application.id}
                      applicationId={application.id}
                      hasJd={application.hasJd}
                      onComplete={dashboard.reload}
                    />
                  </>
                )}
              </>
            )}
          </section>
          <div className="dashboard-grid">
            <section className="dashboard-panel">
              <div className="panel-title">
                <h2>Pending analysis</h2>
                <span>{pending.length} applications</span>
              </div>
              <p className="panel-caption">
                Open applications without a saved analysis summary
              </p>
              {!pending.length ? (
                <p className="empty-copy">
                  No applications awaiting their first analysis.
                </p>
              ) : (
                pending.map((a) => (
                  <div className="action-row" key={a.id}>
                    <Link to={'/applications/' + a.id + '#analysis'}>
                      <strong>{a.company}</strong>
                      <small>{a.title}</small>
                    </Link>
                    <button
                      onClick={() => {
                        setSelected(a.id);
                        document.querySelector('select')?.focus();
                      }}
                    >
                      {a.hasJd ? 'Choose workflow' : 'JD needed'}
                    </button>
                  </div>
                ))
              )}
            </section>
            <section className="dashboard-panel">
              <div className="panel-title">
                <h2>Recent results</h2>
                <button onClick={dashboard.reload}>Refresh results</button>
              </div>
              {!data.runs.length ? (
                <p className="empty-copy">
                  No workflow runs yet. Completed results and failures will
                  appear here.
                </p>
              ) : (
                data.runs.slice(0, 12).map((r) => (
                  <div className="action-row" key={r.id}>
                    <div>
                      <Link
                        to={'/applications/' + r.applicationId + '#analysis'}
                      >
                        <strong>
                          {careerLabels[r.action]} ·{' '}
                          {r.status.replaceAll('_', ' ')}
                        </strong>
                        <small>{identity(r.applicationId)}</small>
                      </Link>
                      <small>{dateTime(r.finishedAt || r.startedAt)}</small>
                      {r.artifactPath && (
                        <a
                          className="result-link"
                          href={
                            '/api/applications/' +
                            r.applicationId +
                            '/career-ops/runs/' +
                            r.id +
                            '/document'
                          }
                        >
                          Download result →
                        </a>
                      )}
                    </div>
                  </div>
                ))
              )}
            </section>
          </div>
          <section className="dashboard-panel">
            <h2>Generated artifacts</h2>
            {!data.artifacts.length ? (
              <p className="empty-copy">
                No artifacts saved yet. Each completed workflow keeps a separate
                version.
              </p>
            ) : (
              <ul className="artifact-list">
                {data.artifacts.map((a) => (
                  <li key={a.id}>
                    <Link
                      to={'/applications/' + a.applicationId + '#documents'}
                    >
                      <strong>
                        {a.type.replaceAll('_', ' ')} ·{' '}
                        {identity(a.applicationId)}
                      </strong>
                    </Link>
                    <small>{date(a.createdAt)}</small>
                    <code>{a.path}</code>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </>
  );
}
export function CareerActions({
  applicationId,
  hasJd,
  onComplete,
}: {
  applicationId: string;
  hasJd: boolean;
  onComplete: () => void;
}) {
  const [runs, setRuns] = useState<CareerRun[]>([]);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      try {
        const data = await request<CareerRun[]>(
          '/api/applications/' + applicationId + '/career-ops/runs',
        );
        if (!active) return;
        setRuns((previous) => {
          if (
            previous.some(
              (p) =>
                p.status === 'running' &&
                data.some((r) => r.id === p.id && r.status !== 'running'),
            )
          )
            queueMicrotask(onComplete);
          return data;
        });
        if (data.some((r) => r.status === 'running'))
          timer = setTimeout(load, 2000);
      } catch (e) {
        if (active) setError((e as Error).message);
      }
    }
    void load();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [applicationId, version]);
  async function start(action: CareerAction) {
    setStarting(true);
    setError('');
    try {
      const run = await request<CareerRun>(
        '/api/applications/' + applicationId + '/career-ops/runs',
        { method: 'POST', body: JSON.stringify({ action }) },
      );
      setRuns((previous) => [run, ...previous]);
      setVersion((v) => v + 1);
      if (run.status !== 'running') onComplete();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setStarting(false);
    }
  }
  const busy = starting || runs.some((r) => r.status === 'running');
  return (
    <div className="career-actions">
      <p>
        Run the existing Career Ops workflow using this application's saved JD.
        Each result is a new Markdown draft.
      </p>
      <div className="career-buttons">
        {careerActions.map((action) => (
          <button
            key={action}
            disabled={busy || !hasJd}
            onClick={() => start(action)}
          >
            {careerLabels[action]}
          </button>
        ))}
      </div>
      {!hasJd && (
        <p className="empty-copy">
          A full JD snapshot is required. Import it from EasySeek or save it
          through the application API.
        </p>
      )}
      {error && (
        <p role="alert" className="inline-error">
          {error} <Link to="/settings">Check setup</Link>{' '}
          <button
            onClick={() => {
              setError('');
              setVersion((v) => v + 1);
            }}
          >
            Refresh run status
          </button>
        </p>
      )}
      <p>
        <Link to="/settings">Provider settings / test connection</Link> · Runs
        use your local CLI's model access.
      </p>
      {runs.length > 0 && (
        <ul className="artifact-list">
          {runs.map((run) => (
            <li key={run.id}>
              <strong>
                {careerLabels[run.action]} · {run.status.replace('_', ' ')}
              </strong>
              <small>{dateTime(run.startedAt)}</small>
              <p>{run.message}</p>
              {run.artifactPath && (
                <>
                  <code>{run.artifactPath}</code>
                  <a
                    href={
                      '/api/applications/' +
                      applicationId +
                      '/career-ops/runs/' +
                      run.id +
                      '/document'
                    }
                  >
                    Download draft
                  </a>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
