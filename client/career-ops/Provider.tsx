import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  careerActions,
  careerLabels,
  type CareerAction,
  type CareerConnection,
  type CareerRun,
} from '../../shared/career-ops';
import { request } from '../tracker/api';
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
          {busy ? 'Checking…' : data?.status || 'Unavailable'}
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
  return (
    <>
      <div className="tracker-heading">
        <div>
          <p className="eyebrow">OPTIONAL LOCAL PROVIDER</p>
          <h1>Career Ops</h1>
          <p>
            Use your independent Career Ops workflows on a saved application.
          </p>
        </div>
      </div>
      <CareerConnectionPanel />
      <section className="dashboard-panel">
        <h2>Application workflows</h2>
        <p>
          Analyze fit, tailor a Markdown CV, draft a cover letter, plan
          networking, or prepare for an interview from application detail. Save
          a full JD first.
        </p>
        <p>
          Each run keeps a separate draft and input snapshot. Review drafts
          before using them.
        </p>
        <Link to="/applications">Open applications →</Link>
      </section>
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
              <small>{new Date(run.startedAt).toLocaleString()}</small>
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
