import { SetupWizard, SetupConfiguration, SetupPrompt } from './Setup';
import { CareerOpsPage } from './career-ops/Provider';
import { useEffect, useState } from 'react';
import { Link, NavLink, Route, Routes } from 'react-router-dom';
import { Discover } from './discover/Discover';
import { Analytics } from './tracker/Analytics';
import { Overview } from './tracker/Overview';
import { Applications } from './tracker/Applications';
import { ApplicationDetail } from './tracker/Detail';
import type { HealthResponse } from '../shared/api';

const navigation = [
  ['/', 'Overview', '01'],
  ['/discover', 'Discover', '02'],
  ['/applications', 'Applications', '03'],
  ['/analytics', 'Analytics', '04'],
  ['/career-ops', 'Career Ops', '05'],
  ['/settings', 'Settings', '06'],
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
  return (
    <>
      <PageHeading
        eyebrow="LOCAL CONFIGURATION"
        title="Settings"
        description="One configuration source for this workspace. Your independent modules keep their own data and credentials."
      />
      <SetupConfiguration />
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
          <SetupPrompt />
          <Routes>
            <Route path="/setup" element={<SetupWizard />} />
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
