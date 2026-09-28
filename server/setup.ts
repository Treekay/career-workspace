import type { FastifyInstance } from 'fastify';
import {
  existsSync,
  statSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { readLocal, writeLocal, settingsSchema } from '../config/local.js';
import type { WorkspaceConfig } from '../config/runtime.js';
import type { openDatabase } from './db/client.js';
import { readDiscover } from './discover/service.js';
import type { CareerOpsService } from './career-ops/service.js';
import { runProcess, type Runner } from './career-ops/process.js';
import type {
  SetupState,
  SetupReadiness,
  DoctorResult,
} from '../shared/setup.js';
function file(path: string) {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}
function directory(path: string) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}
function json(path: string) {
  if (!file(path) || statSync(path).size > 100000)
    throw new Error('Missing or invalid file');
  return JSON.parse(readFileSync(path, 'utf8')) as unknown;
}
export function registerSetupRoutes(
  app: FastifyInstance,
  config: WorkspaceConfig,
  storage: ReturnType<typeof openDatabase> | null,
  career: CareerOpsService | null,
  runner: Runner = runProcess,
) {
  const project = (id: string) =>
    config.projects.find((p) => p.id === id)!.path;
  function state(): SetupState {
    let local: ReturnType<typeof readLocal> = { values: {}, completedAt: null };
    let configError = config.localConfigError;
    try {
      local = readLocal(config.localConfigPath);
    } catch {
      configError =
        'Local settings could not be read. Repair the local JSON configuration file and restart before saving setup.';
    }
    const values = { ...config.settingsValues, ...local.values };
    for (const key of config.overriddenSettings) {
      const setting = key as keyof typeof values;
      values[setting] = config.settingsValues[setting];
    }
    const restartRequired = Object.entries(values).some(
      ([key, value]) =>
        !config.overriddenSettings.includes(key) &&
        value !== config.settingsValues[key as keyof typeof values],
    );
    return {
      values,
      effective: config.settingsValues,
      completedAt: local.completedAt,
      restartRequired,
      overridden: config.overriddenSettings,
      settingsFile: config.localConfigPath,
      legacy: config.legacySettings,
      error: configError,
    };
  }
  function databaseCheck() {
    const dir =
      storage && config.databasePath === ':memory:'
        ? config.root
        : dirname(config.databasePath);
    const probe = join(dir, '.workspace-permission-' + randomUUID());
    let probeCreated = false;
    try {
      if (!storage) throw new Error('Unavailable');
      writeFileSync(probe, 'local workspace permission check', {
        flag: 'wx',
        mode: 0o600,
      });
      probeCreated = true;
      if (readFileSync(probe, 'utf8') !== 'local workspace permission check')
        throw new Error('Read failed');
      storage.sqlite.exec('SAVEPOINT setup_permission_check');
      try {
        storage.sqlite
          .prepare('INSERT INTO workspace_metadata (key, value) VALUES (?, ?)')
          .run('setup-probe-' + randomUUID(), 'ok');
      } finally {
        storage.sqlite.exec(
          'ROLLBACK TO setup_permission_check; RELEASE setup_permission_check',
        );
      }
      return {
        ready: true,
        message:
          'SQLite initialized; database and data directory are readable and writable.',
        directory: dir,
      };
    } catch {
      return {
        ready: false,
        message:
          'Cannot read/write the workspace database or data directory. Choose an accessible SQLite path, restart, and rerun checks.',
        directory: dir,
      };
    } finally {
      if (probeCreated && existsSync(probe)) {
        try {
          unlinkSync(probe);
        } catch {
          /* No user file is ever removed. */
        }
      }
    }
  }
  async function checks(): Promise<SetupReadiness> {
    const easy = project('easyseek'),
      alerts = project('job-alert-workflow'),
      cp = project('career-ops');
    let easyReady = false;
    try {
      const m = json(join(easy, 'manifest.json')) as {
        manifest_version?: number;
      };
      easyReady = m.manifest_version === 3;
    } catch {
      /* Report only availability. */
    }
    let configStatus = 'Missing';
    try {
      const c = json(join(alerts, 'job-ops', 'config.json')) as {
        gmail_queries?: { seek?: unknown; linkedin?: unknown };
      };
      configStatus =
        typeof c.gmail_queries?.seek === 'string' &&
        typeof c.gmail_queries?.linkedin === 'string'
          ? 'Found'
          : 'Invalid';
    } catch {
      configStatus = file(join(alerts, 'job-ops', 'config.json'))
        ? 'Invalid'
        : 'Missing';
    }
    let queue = {
      ready: false,
      message:
        'Review queue unavailable. Run the daily workflow in its Gmail-connected Codex session.',
    };
    let latestRun: string | null = null;
    try {
      const d = await readDiscover(config);
      latestRun = d.last_run_date;
      queue = {
        ready: d.status === 'ready',
        message:
          d.status === 'ready'
            ? 'Review queue is available.'
            : 'Review queue is stale; run the daily workflow, then rerun checks.',
      };
    } catch {
      /* No mailbox contents are returned. */
    }
    const info = career ? await career.connection(true) : null;
    const portability = file(join(cp, 'PORTABILITY.md'));
    const profile = Boolean(
      info &&
      ['cv.md', 'config/profile.yml', 'modes/_profile.md'].every((f) =>
        file(join(info.dataPath, f)),
      ),
    );
    return {
      checkedAt: new Date().toISOString(),
      database: databaseCheck(),
      easyseek: {
        ready: easyReady,
        message: easyReady
          ? 'Repository found; load the extension manually in Chrome.'
          : directory(easy)
            ? 'Repository found, but its extension manifest is missing or invalid.'
            : 'Repository missing. Clone EasySeek or edit its path.',
      },
      alerts: {
        ready:
          directory(alerts) &&
          file(join(alerts, 'job-ops', 'scripts', 'job_store.py')),
        message: directory(alerts)
          ? 'Repository found. Gmail must be connected in the sibling Codex session.'
          : 'Repository missing. Clone job-alert-workflow or edit its path.',
        config: configStatus,
        latestRun,
        exportAvailable: file(join(alerts, 'job-ops', 'exports', 'jobs.csv')),
        workflowAvailable: file(
          join(
            alerts,
            '.codex',
            'skills',
            'daily-job-alert-workflow',
            'SKILL.md',
          ),
        ),
      },
      queue,
      career: {
        ready: info?.status === 'Connected',
        message:
          info?.message ||
          'Career Ops check requires the workspace database. Fix local storage first.',
        repoFound: directory(cp),
        portability,
        profile,
      },
    };
  }
  let doctorBusy = false;
  app.register(async (routes) => {
    routes.addHook('onRequest', async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      let hostname = '';
      try {
        hostname = new URL('http://' + request.headers.host).hostname;
      } catch {
        /* Reject invalid Host. */
      }
      const allowed = [config.apiPort, config.webPort].flatMap((port) => [
        `http://localhost:${port}`,
        `http://127.0.0.1:${port}`,
      ]);
      if (
        !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request.ip) ||
        !['localhost', '127.0.0.1', '[::1]'].includes(hostname) ||
        (request.headers.origin && !allowed.includes(request.headers.origin)) ||
        request.headers['sec-fetch-site'] === 'cross-site'
      )
        return reply
          .code(403)
          .send({ error: 'Setup is available only from the local workspace.' });
      if (
        request.method === 'POST' &&
        !/^application\/json(?:\s*;|$)/i.test(
          request.headers['content-type'] || '',
        )
      )
        return reply.code(415).send({ error: 'Use application/json.' });
    });
    routes.setErrorHandler((error, _request, reply) =>
      reply.code(error instanceof z.ZodError ? 400 : 503).send({
        error:
          error instanceof z.ZodError
            ? 'Invalid setup values. Use local paths, exact extension origins and an HTTP localhost endpoint with a port. No credential fields are accepted.'
            : 'Local setup check or configuration storage failed. Check paths and permissions; no credentials or command output are exposed.',
      }),
    );
    routes.get('/api/setup/state', () => state());
    routes.post('/api/setup/settings', { bodyLimit: 16384 }, (request) => {
      const values = settingsSchema.parse(request.body);
      const apiPort = config.overriddenSettings.includes('endpoint')
        ? config.apiPort
        : Number(new URL(values.endpoint).port || '80');
      const webPort = config.overriddenSettings.includes('webPort')
        ? config.webPort
        : Number(values.webPort);
      if (apiPort === webPort) throw new z.ZodError([]);
      const local = readLocal(config.localConfigPath);
      writeLocal(config.localConfigPath, {
        values,
        completedAt:
          JSON.stringify(values) === JSON.stringify(state().values)
            ? local.completedAt
            : null,
      });
      return state();
    });
    routes.post('/api/setup/check', async (request) => {
      z.strictObject({}).parse(request.body);
      return checks();
    });
    routes.post('/api/setup/complete', async (request, reply) => {
      z.strictObject({}).parse(request.body);
      if (state().restartRequired)
        return reply.code(409).send({
          error:
            'Restart the workspace to apply saved settings before completing setup.',
        });
      if (!(await checks()).database.ready)
        return reply.code(409).send({
          error:
            'Local storage must pass its readiness check before completing setup. Optional modules may be missing.',
        });
      const local = readLocal(config.localConfigPath);
      writeLocal(config.localConfigPath, {
        ...local,
        completedAt: new Date().toISOString(),
      });
      return state();
    });
    routes.post('/api/setup/reset', (request) => {
      z.strictObject({}).parse(request.body);
      const local = readLocal(config.localConfigPath);
      writeLocal(config.localConfigPath, { ...local, completedAt: null });
      return state();
    });
    routes.post('/api/setup/job-alerts/daily', (request) => {
      z.strictObject({}).parse(request.body);
      return {
        status: 'external_action_required',
        directory: project('job-alert-workflow'),
        prompt: 'Run daily job alert workflow.',
        message:
          'Open this repository in Codex and connect Gmail using its existing app/plugin UI. Paste the prompt there. The full daily workflow runs in that session, including its normal ingestion, retention, exports and Git steps. This workspace has not started or completed a run.',
      };
    });
    routes.post(
      '/api/setup/career-ops/test',
      async (request, reply): Promise<DoctorResult | unknown> => {
        z.strictObject({}).parse(request.body);
        if (doctorBusy)
          return reply
            .code(409)
            .send({ error: 'Career Ops doctor is already running.' });
        const cp = project('career-ops');
        const base = {
          checkedAt: new Date().toISOString(),
          missing: [] as string[],
          warningCount: 0,
          templateCount: 0,
        };
        if (!file(join(cp, 'PORTABILITY.md')) || !file(join(cp, 'doctor.mjs')))
          return {
            ...base,
            status: 'Unavailable',
            message:
              'Repository, PORTABILITY.md or doctor.mjs is missing. Check the Career Ops path.',
          };
        // PORTABILITY is documentation, never executable instructions or candidate content.
        if (statSync(join(cp, 'PORTABILITY.md')).size > 100000)
          return {
            ...base,
            status: 'Error',
            message:
              'PORTABILITY.md is unexpectedly large. Inspect the sibling checkout.',
          };
        readFileSync(join(cp, 'PORTABILITY.md'), 'utf8');
        doctorBusy = true;
        try {
          const result = await runner({
            bin: process.execPath,
            args: [
              join(cp, 'doctor.mjs'),
              '--json',
              ...(config.careerOpsDataOverride
                ? ['--target', resolve(cp, config.careerOpsDataOverride)]
                : []),
            ],
            cwd: cp,
            timeout: 10000,
          });
          if (result.code) throw new Error('Doctor failed');
          const d = z
            .object({
              onboardingNeeded: z.boolean(),
              missing: z.array(z.string()),
              warnings: z.array(z.unknown()).optional(),
              unpersonalized: z.array(z.unknown()).optional(),
              autoCopied: z.array(z.unknown()).optional(),
            })
            .parse(JSON.parse(result.stdout));
          const known = [
            'cv.md',
            'config/profile.yml',
            'modes/_profile.md',
            'portals.yml',
          ];
          return {
            ...base,
            status: d.onboardingNeeded ? 'Needs setup' : 'Ready',
            missing: d.missing.filter((m) => known.includes(m)),
            warningCount: d.warnings?.length || 0,
            templateCount: d.autoCopied?.length || 0,
            message: d.onboardingNeeded
              ? 'Complete candidate onboarding in career-ops, then test again.'
              : d.unpersonalized?.length
                ? 'Doctor completed. Personalization templates still need review in career-ops.'
                : 'Doctor completed. Review any warnings in the sibling project; private profile contents stay there.',
          };
        } catch {
          return {
            ...base,
            status: 'Error',
            message:
              'Doctor failed, timed out or returned invalid output. Run node doctor.mjs --json inside career-ops for local troubleshooting.',
          };
        } finally {
          doctorBusy = false;
        }
      },
    );
  });
}
