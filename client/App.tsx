import { useEffect, useState } from 'react';
import { Link, NavLink, Route, Routes, useParams } from 'react-router-dom';
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
function Placeholder({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <>
      <PageHeading
        eyebrow="Your next chapter"
        title={title}
        description={description}
      />
      <section className="empty-state">
        <span className="tag">Planned</span>
        <h2>A space for what comes next.</h2>
        <p>
          This page is ready for a future phase. No job or application data is
          connected yet.
        </p>
        <Link to="/settings">
          Review workspace setup <span aria-hidden="true">→</span>
        </Link>
      </section>
    </>
  );
}
function Overview() {
  return (
    <>
      <PageHeading
        eyebrow="A little clarity. A new direction."
        title="Your career, in one place."
        description="A local home for your search. Bring your tools together and keep your next step in sight."
      />
      <section className="hero">
        <div>
          <span className="tag light">Workspace foundation</span>
          <h2>
            Make room for
            <br />
            your next opportunity.
          </h2>
          <p>
            Your workspace is set up. Start by checking the paths to your
            existing tools.
          </p>
          <Link className="button" to="/settings">
            Review setup <span aria-hidden="true">↗</span>
          </Link>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div />
          <div />
          <div />
          <span>
            ONE STEP
            <br />
            FORWARD.
          </span>
        </div>
      </section>
      <div className="section-title">
        <h2>A place for every step</h2>
        <span>Built around your workflow</span>
      </div>
      <div className="cards">
        {[
          [
            '/discover',
            'Discover',
            'Find a clearer view of the opportunities ahead.',
          ],
          [
            '/applications',
            'Applications',
            'A future home for your applications and next steps.',
          ],
          [
            '/career-ops',
            'Career Ops',
            'Connect your existing toolkit on your terms.',
          ],
        ].map(([to, title, description]) => (
          <Link className="card" to={to} key={to}>
            <span className="tag">Planned</span>
            <h3>
              {title} <span aria-hidden="true">↗</span>
            </h3>
            <p>{description}</p>
          </Link>
        ))}
      </div>
    </>
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
          <section className="panel">
            <h2>Local storage</h2>
            <p>SQLite database</p>
            <code className="resolved">{data.database.path}</code>
            <p>
              Only workspace metadata is stored in this phase. Finding a project
              directory does not import data or run its code.
            </p>
          </section>
        </>
      )}
    </>
  );
}
function ApplicationDetail() {
  const { id } = useParams();
  return (
    <Placeholder
      title="Application detail"
      description={`Details for application ${id} will be available when the tracker is implemented.`}
    />
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
            <Route
              path="/discover"
              element={
                <Placeholder
                  title="Discover"
                  description="Explore opportunities from your independent discovery tools."
                />
              }
            />
            <Route
              path="/applications"
              element={
                <Placeholder
                  title="Applications"
                  description="Your application tracker will live here in a future phase."
                />
              }
            />
            <Route path="/applications/:id" element={<ApplicationDetail />} />
            <Route
              path="/analytics"
              element={
                <Placeholder
                  title="Analytics"
                  description="Understand your search once application data is connected."
                />
              }
            />
            <Route
              path="/career-ops"
              element={
                <Placeholder
                  title="Career Ops"
                  description="A future connection to your independent Career Ops project."
                />
              }
            />
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
