import { CareerConnectionPanel } from './career-ops/Provider';
import { useEffect, useState, type FormEvent } from 'react';
import {
  Link,
  useLocation,
  useNavigate,
  useSearchParams,
} from 'react-router-dom';
import { request, useResource } from './tracker/api';
import { ErrorState } from './tracker/components';
import { formatDate } from './format';
import type {
  SetupState,
  SetupReadiness,
  DoctorResult,
  LocalSettings,
} from '../shared/setup';
const pages = [
  'Local workspace',
  'EasySeek',
  'Job Alerts / Gmail',
  'Career Ops',
  'Final verification',
];
const fields: Record<keyof LocalSettings, string> = {
  webPort: 'Workspace web port',
  discoverStaleHours: 'Discover freshness window (hours)',
  careerOpsTimeoutSeconds: 'Career Ops timeout (seconds)',
  careerOpsDataPath: 'Career Ops data root (blank = auto-detect)',
  databasePath: 'SQLite database path',
  easySeekPath: 'EasySeek repository path',
  jobAlertsPath: 'Job Alerts repository path',
  careerOpsPath: 'Career Ops repository path',
  careerOpsCli: 'Career Ops CLI executable',
  endpoint: 'Workspace localhost endpoint',
  extensionOrigins: 'Allowed extension origins',
};
export function SetupPrompt() {
  const location = useLocation();
  const status = useResource<SetupState>('/api/setup/state');
  useEffect(() => {
    status.reload();
  }, [location.pathname]);
  if (
    location.pathname === '/setup' ||
    status.data?.completedAt ||
    !status.data
  )
    return null;
  return (
    <div className="setup-prompt" role="status">
      <span>
        Set up your local workspace. Optional modules can be connected later.
      </span>
      <Link to="/setup">Start setup →</Link>
    </div>
  );
}
export function SetupConfiguration({ wizard = false }: { wizard?: boolean }) {
  const state = useResource<SetupState>('/api/setup/state');
  const [values, setValues] = useState<LocalSettings>();
  const [params, setParams] = useSearchParams();
  const step =
    Math.max(0, Math.min(4, Number(params.get('step') || 1) - 1)) || 0;
  const [checks, setChecks] = useState<SetupReadiness>();
  const [doctor, setDoctor] = useState<DoctorResult>();
  const [handoff, setHandoff] = useState<{
    directory: string;
    prompt: string;
    message: string;
  }>();
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const navigate = useNavigate();
  useEffect(() => {
    if (state.data) setValues(state.data.values);
  }, [state.data]);
  async function check() {
    setBusy('checks');
    setError('');
    try {
      setChecks(
        await request<SetupReadiness>('/api/setup/check', {
          method: 'POST',
          body: '{}',
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  }
  async function action(
    kind: 'save' | 'complete' | 'reset' | 'doctor' | 'daily' | 'connection',
  ) {
    setBusy(kind);
    setError('');
    setNotice('');
    try {
      if (kind === 'connection') {
        await request('/api/health');
        setNotice(
          'Workspace API and SQLite responded. In EasySeek settings, enable Career Workspace, enter the same endpoint and click Test connection. Browser installation cannot be detected from this page.',
        );
      } else if (kind === 'doctor') {
        setDoctor(
          await request<DoctorResult>('/api/setup/career-ops/test', {
            method: 'POST',
            body: '{}',
          }),
        );
      } else if (kind === 'daily') {
        setHandoff(
          await request('/api/setup/job-alerts/daily', {
            method: 'POST',
            body: '{}',
          }),
        );
      } else {
        const next = await request<SetupState>(
          '/api/setup/' + (kind === 'save' ? 'settings' : kind),
          {
            method: 'POST',
            body: JSON.stringify(kind === 'save' ? values : {}),
          },
        );
        state.replace(next);
        setNotice(
          kind === 'save'
            ? next.restartRequired
              ? 'Saved. Restart npm run dev to apply changes, then rerun checks.'
              : 'Configuration saved.'
            : kind === 'reset'
              ? 'Setup state reset. Paths, database, applications and artifacts are unchanged.'
              : 'Setup complete. Optional modules remain configurable in Settings.',
        );
        if (kind === 'save') {
          setChecks(undefined);
          setDoctor(undefined);
        }
        if (kind === 'complete') navigate('/');
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  }
  if (state.error)
    return (
      <ErrorState
        error={
          'Cannot load local settings. Check the workspace API. ' + state.error
        }
        retry={state.reload}
      />
    );
  if (!state.data || !values) return <p role="status">Loading local setup…</p>;
  const dirty = JSON.stringify(values) !== JSON.stringify(state.data.values);
  function field(key: keyof LocalSettings) {
    return (
      <label key={key}>
        {fields[key]}
        <input
          type={
            [
              'webPort',
              'discoverStaleHours',
              'careerOpsTimeoutSeconds',
            ].includes(key)
              ? 'number'
              : 'text'
          }
          step={key === 'discoverStaleHours' ? 'any' : undefined}
          value={values![key]}
          disabled={Boolean(busy) || state.data!.overridden.includes(key)}
          onChange={(e) => setValues((v) => ({ ...v!, [key]: e.target.value }))}
        />
        {state.data!.overridden.includes(key) && (
          <small>
            Controlled by a process environment override. Remove that override
            and restart to edit this value here.
          </small>
        )}
      </label>
    );
  }
  const visible = (index: number) => !wizard || step === index;
  function row(label: string, ready: boolean | undefined, message?: string) {
    return (
      <div className="readiness-row">
        <strong>{label}</strong>
        <span className={'tag ' + (ready ? 'success' : 'warning')}>
          {ready === undefined
            ? 'Not checked'
            : ready
              ? 'Ready'
              : 'Needs attention'}
        </span>
        {message && <p>{message}</p>}
      </div>
    );
  }
  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setNotice('Copied.');
    } catch {
      setNotice('Clipboard unavailable. Select and copy the displayed text.');
    }
  }
  return (
    <>
      {!wizard && (
        <div className="panel-title">
          <h2>Setup & local configuration</h2>
          <Link to="/setup">Open Setup Wizard →</Link>
        </div>
      )}
      {wizard && (
        <div className="setup-steps" aria-label="Setup steps">
          {pages.map((title, index) => (
            <button
              key={title}
              aria-current={step === index ? 'step' : undefined}
              onClick={() => setParams({ step: String(index + 1) })}
            >
              {index + 1}. {title}
            </button>
          ))}
        </div>
      )}
      <p>
        All modules stay independent. Only local paths, connection settings and
        setup state are saved here. Credentials stay in each module’s existing
        storage.
      </p>
      <details className="dashboard-panel">
        <summary>Configuration source & compatibility</summary>
        <p>
          All workspace settings are saved in{' '}
          <code>{state.data.settingsFile}</code>. Use Save configuration to
          capture the current values, including legacy defaults, without
          changing account authorizations.
        </p>
        <p>
          Manual .env configuration is deprecated. Explicit process overrides
          remain for development/testing and are shown on their fields.
          WORKSPACE_CONFIG_PATH only selects the settings file for isolated
          launches.
        </p>
        {Boolean(state.data.legacy?.length) && (
          <ul>
            {state.data.legacy.map((item) => (
              <li key={item.key}>
                <code>{item.variable}</code>:{' '}
                {item.source === 'process'
                  ? 'process override (remove in the launching shell to edit here)'
                  : 'legacy .env default (superseded after saving)'}
              </li>
            ))}
          </ul>
        )}
      </details>
      {state.data.completedAt && (
        <p role="status">
          Setup completed {formatDate(state.data.completedAt, true)}. You can
          edit values or rerun checks at any time.
        </p>
      )}
      {state.data.error && (
        <p className="notice" role="alert">
          {state.data.error}
        </p>
      )}
      {state.data.restartRequired && (
        <p className="notice" role="status">
          Saved settings are waiting for a restart. Checks currently use the
          running configuration. Restart both frontend and backend with npm run
          dev, then return to this page.
        </p>
      )}
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      {dirty && (
        <p className="notice" role="status">
          Unsaved configuration. Checks and actions use the running settings
          until you save and restart.
        </p>
      )}
      <form
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          void action('save');
        }}
      >
        {visible(0) && (
          <section className="dashboard-panel setup-section">
            <h2>Local workspace</h2>
            {field('databasePath')}
            {field('webPort')}
            <p>
              Relative paths start at the career-workspace root. SQLite
              initializes and applies migrations on startup. Changing the path
              selects a database after restart; it does not move or delete your
              existing one.
            </p>
            {row(
              'Workspace database',
              checks?.database.ready,
              checks?.database.message,
            )}
            <p>
              Data directory:{' '}
              <code>
                {checks?.database.directory ||
                  'Run checks to confirm the active directory.'}
              </code>
            </p>
            <button
              type="button"
              disabled={Boolean(busy)}
              onClick={() => void check()}
            >
              Verify read/write permissions
            </button>
          </section>
        )}
        {visible(1) && (
          <section className="dashboard-panel setup-section">
            <h2>EasySeek</h2>
            {field('easySeekPath')}
            {row(
              'EasySeek repo',
              checks?.easyseek.ready,
              checks?.easyseek.message,
            )}
            <ol>
              <li>
                Open Chrome and enter <code>chrome://extensions</code>.
              </li>
              <li>Turn on Developer mode.</li>
              <li>Choose Load unpacked and select the EasySeek repository.</li>
              <li>
                Open EasySeek settings, enable Career Workspace and use the
                endpoint below.
              </li>
              <li>
                Copy the extension’s exact origin from EasySeek or Chrome into
                the allowlist below. Save and restart the workspace, then test
                the connection in EasySeek.
              </li>
            </ol>
            <button
              type="button"
              onClick={() => void copy('chrome://extensions')}
            >
              Copy Chrome extensions address
            </button>
            <p>
              Chrome restricts websites from opening its internal extension
              page. Installation is manual.
            </p>
            {field('endpoint')}
            <button
              type="button"
              onClick={() => void copy(state.data!.effective.endpoint)}
            >
              Copy active endpoint for EasySeek
            </button>
            <p>
              EasySeek’s bundled default is 8765; copy this workspace’s active
              endpoint instead. Enabling the extension and granting localhost
              permission remain explicit browser actions. A successful health
              test does not prove imports are authorized.
            </p>
            {field('extensionOrigins')}
            <p>
              Example origin: chrome-extension:// followed by the extension’s
              32-letter ID. No browser cookies or extension storage are read
              here.
            </p>
            <button
              type="button"
              disabled={Boolean(busy)}
              onClick={() => void action('connection')}
            >
              Test workspace connection
            </button>
          </section>
        )}
        {visible(2) && (
          <section className="dashboard-panel setup-section">
            <h2>Job Alerts / Gmail</h2>
            {field('jobAlertsPath')}
            {field('discoverStaleHours')}
            {row(
              'Job Alert repo',
              checks?.alerts.ready,
              checks?.alerts.message,
            )}
            <dl className="setup-facts">
              <dt>Config status</dt>
              <dd>{checks?.alerts.config || 'Not checked'}</dd>
              <dt>Latest recorded run date</dt>
              <dd>
                {checks?.alerts.latestRun ||
                  'Unknown — no run timestamp is invented'}
              </dd>
              <dt>CSV export</dt>
              <dd>
                {checks
                  ? checks.alerts.exportAvailable
                    ? 'Available'
                    : 'Missing'
                  : 'Not checked'}
              </dd>
              <dt>Daily workflow</dt>
              <dd>
                {checks
                  ? checks.alerts.workflowAvailable
                    ? 'Available in sibling Codex session'
                    : 'Missing'
                  : 'Not checked'}
              </dd>
            </dl>
            {row('Review Queue', checks?.queue.ready, checks?.queue.message)}
            <p>
              Connect Gmail through the existing Codex app/plugin UI in
              job-alert-workflow. This workspace neither authenticates Gmail nor
              stores its tokens. Search queries, timezone, retention and
              analysis limits remain in the sibling’s job-ops/config.json; they
              are workflow policy, not workspace connection settings.
            </p>
            <div className="form-actions">
              <button
                type="button"
                disabled={Boolean(busy)}
                onClick={() => void check()}
              >
                Run health check
              </button>
              <button
                type="button"
                disabled={Boolean(busy)}
                onClick={() => void action('daily')}
              >
                Run daily workflow now
              </button>
            </div>
            {handoff && (
              <div className="notice" role="status">
                <h3>Continue in the Gmail-connected session</h3>
                <p>{handoff.message}</p>
                <code>{handoff.directory}</code>
                <p>
                  <code>{handoff.prompt}</code>
                </p>
                <button type="button" onClick={() => void copy(handoff.prompt)}>
                  Copy daily workflow prompt
                </button>
                <p>
                  After the workflow finishes, return here and run the health
                  check. No run has been launched by this page.
                </p>
              </div>
            )}
          </section>
        )}
        {visible(3) && (
          <section className="dashboard-panel setup-section">
            <h2>Career Ops</h2>
            {field('careerOpsPath')}
            {field('careerOpsCli')}
            {field('careerOpsDataPath')}
            {field('careerOpsTimeoutSeconds')}
            <p>
              Leave the data root blank to use career-ops’ .career-ops-data
              marker or repository root. A relative override starts at the
              career-ops repository. Keep the executable as codex to detect it
              from PATH.
            </p>
            <CareerConnectionPanel />
            {row(
              'Career Ops workflow',
              checks?.career.ready,
              checks?.career.message,
            )}
            <dl className="setup-facts">
              <dt>Repository</dt>
              <dd>
                {checks
                  ? checks.career.repoFound
                    ? 'Found'
                    : 'Missing'
                  : 'Not checked'}
              </dd>
              <dt>PORTABILITY.md</dt>
              <dd>
                {checks
                  ? checks.career.portability
                    ? 'Found'
                    : 'Missing'
                  : 'Not checked'}
              </dd>
              <dt>Candidate profile</dt>
              <dd>
                {checks
                  ? checks.career.profile
                    ? 'Found'
                    : 'Incomplete or missing'
                  : 'Not checked'}
              </dd>
            </dl>
            <p>
              Test runs the existing node doctor.mjs --json command in the
              configured repository. Its normal onboarding may create missing
              personalization templates; it does not replace existing candidate
              files. Profile content is not displayed here.
            </p>
            <button
              type="button"
              disabled={Boolean(busy)}
              onClick={() => void action('doctor')}
            >
              {busy === 'doctor' ? 'Running doctor…' : 'Test Career Ops'}
            </button>
            {!doctor && (
              <p>
                Doctor not run yet. Select Test Career Ops to check candidate
                prerequisites.
              </p>
            )}
            {doctor && (
              <div className="notice" role="status">
                <strong>Doctor: {doctor.status}</strong>
                <p>{doctor.message}</p>
                <p>
                  {doctor.warningCount} warnings · {doctor.templateCount}{' '}
                  missing templates initialized
                  {doctor.missing.length
                    ? ' · Missing: ' + doctor.missing.join(', ')
                    : ''}
                </p>
                <small>{formatDate(doctor.checkedAt, true)}</small>
              </div>
            )}
          </section>
        )}
        {visible(4) && (
          <section className="dashboard-panel setup-section">
            <h2>Final verification</h2>
            <p>
              Local storage is required. Missing optional modules do not prevent
              you from tracking applications.
            </p>
            {row(
              'Workspace database',
              checks?.database.ready,
              checks?.database.message,
            )}
            <h3>Optional modules</h3>
            {row(
              'EasySeek repo',
              checks?.easyseek.ready,
              checks?.easyseek.message,
            )}
            {row(
              'Job Alert repo',
              checks?.alerts.ready,
              checks?.alerts.message,
            )}
            {row('Review Queue', checks?.queue.ready, checks?.queue.message)}
            {row('Career Ops', checks?.career.ready, checks?.career.message)}
            <div className="form-actions">
              <button
                type="button"
                disabled={Boolean(busy)}
                onClick={() => void check()}
              >
                {busy === 'checks' ? 'Checking…' : 'Rerun checks'}
              </button>
              <button
                type="button"
                className="primary-button"
                disabled={
                  Boolean(busy) ||
                  dirty ||
                  state.data.restartRequired ||
                  Boolean(state.data.error) ||
                  !checks?.database.ready
                }
                onClick={() => void action('complete')}
              >
                Mark setup complete
              </button>
            </div>
            {dirty && <p>Save edited values before completing setup.</p>}
          </section>
        )}
        <div className="setup-save">
          <button
            type="submit"
            disabled={Boolean(busy) || Boolean(state.data.error)}
          >
            {busy === 'save' ? 'Saving…' : 'Save configuration'}
          </button>
          <span>
            Saved locally. Changes take effect after restarting the workspace.
          </span>
        </div>
      </form>
      {wizard && (
        <div className="wizard-controls">
          <button
            disabled={step === 0}
            onClick={() => setParams({ step: String(step) })}
          >
            Back
          </button>
          {step < 4 && (
            <button
              className="primary-button"
              disabled={
                Boolean(busy) || (step === 0 && !checks?.database.ready)
              }
              onClick={() => setParams({ step: String(step + 2) })}
            >
              {step === 0 ? 'Confirm directory & continue' : 'Continue'}
            </button>
          )}
          <Link to="/settings">Finish later in Settings</Link>
        </div>
      )}
      {!wizard && (
        <button disabled={Boolean(busy)} onClick={() => void action('reset')}>
          Reset setup state only
        </button>
      )}
    </>
  );
}
export function SetupWizard() {
  return (
    <>
      <div className="tracker-heading">
        <div>
          <p className="eyebrow">FIRST-RUN SETUP</p>
          <h1>Set up your workspace</h1>
          <p>
            Connect the local tools you want to use. Optional modules can wait.
          </p>
        </div>
      </div>
      <SetupConfiguration wizard />
    </>
  );
}
