import { CareerConnectionPanel, CareerOpsPage } from './career-ops/Provider';
import { useEffect, useState } from 'react';
import { Link, NavLink, Route, Routes } from 'react-router-dom';
import { Discover } from './discover/Discover';
import { Analytics } from './tracker/Analytics';
import { Overview } from './tracker/Overview';
import { Applications } from './tracker/Applications';
import { ApplicationDetail } from './tracker/Detail';
import type { HealthResponse, SetupResponse } from '../shared/api';

const navigation = [
  ['/', 'Overview', '01'],
  ['/discover', 'Discover', '02'],
  ['/applications', 'Applications', '03'],
  ['/analytics', 'Analytics', '04'],
  ['/career-ops', 'Career Ops', '05'],
  ['/settings', 'Settings / Setup', '06'],
];
function useApi<T>(url: string) {
  const [state, setState] = useState<{ data?: T; error?: string }>({});
  const [attempt, retry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setState({});
    const timer = window.setTimeout(() => controller.abort(), 8000);
    fetch(url, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok)
          throw new Error('Request failed (' + response.status + ')');
        return response.json() as Promise<T>;
      })
      .then((data) => {
        if (active) setState({ data });
      })
      .catch(() => {
        if (!active) return;
        if (!controller.signal.aborted)
          setState({
            error:
              'Cannot reach the workspace API. Check that the backend is running.',
          });
        else setState({ error: 'The workspace API did not respond in time.' });
      })
      .finally(() => window.clearTimeout(timer));
    return () => {
      active = false;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [url, attempt]);
  return { ...state, retry: () => retry((value) => value + 1) };
}
function PageHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <header className="page-heading">
      <p className="eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      <p className="intro">{description}</p>
    </header>
  );
}
function Settings() {
  const { data, error, retry } = useApi<SetupResponse>('/api/setup');
  return (
    <>
      <PageHeading
        eyebrow="Make yourself at home"
        title="Settings / Setup"
        description="Your tools stay independent. This workspace keeps a reference to where they live."
      />
      {error ? (
        <div className="notice" role="alert">
          {error} <button onClick={retry}>Try again</button>
        </div>
      ) : !data ? (
        <p role="status">Checking local paths…</p>
      ) : (
        <>
          <section className="panel">
            <h2>Sibling projects</h2>
            <p>
              Configure these paths in the workspace’s .env file, then restart
              development. Relative paths start at the workspace root.
            </p>
            <div className="project-list">
              {data.projects.map((project) => (
                <article className="project" key={project.id}>
                  <div>
                    <h3>{project.name}</h3>
                    <code>{project.configuredPath}</code>
                    <p className="resolved">{project.path}</p>
                  </div>
                  <span
                    className={
                      'tag ' + (project.available ? 'success' : 'warning')
                    }
                  >
                    {project.available ? 'Directory found' : 'Not found'}
                  </span>
                </article>
              ))}
            </div>
          </section>
          <CareerConnectionPanel />
          <section className="panel">
            <h2>Local storage</h2>
            <p>SQLite database</p>
            <code className="resolved">{data.database.path}</code>
            <p>
              Workspace metadata and explicitly tracked applications are stored
              locally. Finding a project directory does not import data or run
              its code.
            </p>
          </section>
        </>
      )}
    </>
  );
}
export function App() {
  const health = useApi<HealthResponse>('/api/health');
  const connected = health.data?.status === 'ok';
  return (
    <div className="layout">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <aside className="sidebar">
        <Link className="brand" to="/">
          <span className="brand-mark" aria-hidden="true">
            cw
          </span>
          <span>
            career
            <br />
            <strong>workspace</strong>
          </span>
        </Link>
        <p className="nav-label">YOUR WORKSPACE</p>
        <nav aria-label="Main navigation">
          {navigation.map(([to, title, number]) => (
            <NavLink key={to} to={to} end={to === '/'}>
              <span className="nav-number">{number}</span>
              {title}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <span className="status-dot" /> Local workspace
          <p>Your search. Your machine.</p>
        </div>
      </aside>
      <div className="main-column">
        <div className="topbar">
          <span>Personal workspace</span>
          <div role="status" className="api-status">
            <span className={'status-dot ' + (!connected ? 'pending' : '')} />
            {connected
              ? 'API & database connected'
              : health.error
                ? 'API unavailable'
                : 'Connecting…'}
            {health.error && <button onClick={health.retry}>Retry</button>}
          </div>
        </div>
        <main id="main" tabIndex={-1}>
          <Routes>
            <Route path="/" element={<Overview />} />
            <Route path="/discover" element={<Discover />} />
            <Route path="/applications" element={<Applications />} />
            <Route path="/applications/:id" element={<ApplicationDetail />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/career-ops" element={<CareerOpsPage />} />
            <Route path="/settings" element={<Settings />} />
            <Route
              path="*"
              element={
                <>
                  <PageHeading
                    eyebrow="Page not found"
                    title="Let’s get you back."
                    description="That page is not part of this workspace."
                  />
                  <Link to="/">Back to overview</Link>
                </>
              }
            />
          </Routes>
        </main>
        <footer className="main-footer">
          CAREER WORKSPACE <span>Local first. Space to grow.</span>
        </footer>
      </div>
    </div>
  );
}
