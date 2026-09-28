import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  readdirSync,
  rmSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildApp } from '../server/app.js';
import { readConfig } from '../config/runtime.js';
import { readLocal } from '../config/local.js';
import type { Runner } from '../server/career-ops/process.js';
const post = (
  app: ReturnType<typeof buildApp>,
  url: string,
  payload: Record<string, unknown> = {},
) => app.inject({ method: 'POST', url, payload });
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'workspace-setup-'));
  return { root, config: readConfig({}, root) };
}

test('clean setup initializes storage, verifies permissions, completes with optional modules missing, and reset preserves applications', async () => {
  const { root, config } = fixture();
  const app = buildApp(config);
  try {
    assert.ok(existsSync(config.databasePath));
    const initial = (await app.inject('/api/setup/state')).json();
    assert.equal(initial.completedAt, null);
    assert.equal(initial.restartRequired, false);
    const check = await post(app, '/api/setup/check');
    assert.equal(check.statusCode, 200);
    const c = check.json();
    assert.equal(c.database.ready, true);
    assert.equal(c.easyseek.ready, false);
    assert.equal(c.alerts.config, 'Missing');
    assert.equal(c.queue.ready, false);
    assert.equal(c.career.ready, false);
    assert.ok(
      !readdirSync(join(root, 'data')).some((f) =>
        f.startsWith('.workspace-permission-'),
      ),
    );
    const a = (
      await post(app, '/api/applications', {
        source: 'other',
        company: 'Test',
        title: 'Retain me',
      })
    ).json();
    assert.equal((await post(app, '/api/setup/complete')).statusCode, 200);
    assert.ok(readLocal(config.localConfigPath).completedAt);
    const before = readLocal(config.localConfigPath).values;
    await post(app, '/api/setup/reset');
    assert.equal(readLocal(config.localConfigPath).completedAt, null);
    assert.deepEqual(readLocal(config.localConfigPath).values, before);
    assert.equal(
      (await app.inject('/api/applications/' + a.id)).json().title,
      'Retain me',
    );
  } finally {
    await app.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test('settings persist safely, require restart, resolve relative paths, and preserve the original database', async () => {
  const { root, config } = fixture();
  let app = buildApp(config);
  try {
    const values = (await app.inject('/api/setup/state')).json().values;
    const saved = await post(app, '/api/setup/settings', {
      ...values,
      easySeekPath: './extensions/EasySeek',
      databasePath: './new-data/workspace.db',
      endpoint: 'http://localhost:8765',
    });
    assert.equal(saved.statusCode, 200);
    assert.equal(saved.json().restartRequired, true);
    assert.equal((await post(app, '/api/setup/complete')).statusCode, 409);
    assert.ok(existsSync(config.databasePath));
    assert.equal(existsSync(join(root, 'new-data', 'workspace.db')), false);
    await app.close();
    const next = readConfig({}, root);
    assert.equal(next.apiPort, 8765);
    assert.equal(next.projects[0].path, join(root, 'extensions', 'EasySeek'));
    app = buildApp(next);
    assert.equal(
      (await app.inject('/api/setup/state')).json().restartRequired,
      false,
    );
    assert.equal(
      (await post(app, '/api/setup/check')).json().database.ready,
      true,
    );
    assert.ok(existsSync(config.databasePath));
    const overridden = readConfig({ API_PORT: '9999' }, root);
    assert.equal(overridden.apiPort, 9999);
    assert.ok(overridden.overriddenSettings.includes('endpoint'));
  } finally {
    await app.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test('setup refuses remote origins, credential fields, non-local endpoints and invalid bodies without writing', async () => {
  const { root, config } = fixture();
  const app = buildApp(config);
  try {
    const values = (await app.inject('/api/setup/state')).json().values;
    for (const endpoint of [
      'https://example.com',
      'http://localhost:0',
      'http://localhost:65536',
      'http://localhost.evil:8765',
      'http://user:secret@localhost:8765',
      'http://localhost:8765/token?x=secret',
      'file:///tmp/x',
      'http://localhost:5173',
    ])
      assert.equal(
        (await post(app, '/api/setup/settings', { ...values, endpoint }))
          .statusCode,
        400,
      );
    assert.equal(
      (
        await post(app, '/api/setup/settings', {
          ...values,
          gmailToken: 'NEVER_SAVE',
        })
      ).statusCode,
      400,
    );
    assert.equal(
      (await post(app, '/api/setup/check', { command: 'anything' })).statusCode,
      400,
    );
    for (const headers of [
      { origin: 'https://evil.example' },
      { host: 'evil.example' },
      { 'sec-fetch-site': 'cross-site' },
    ])
      assert.equal(
        (
          await app.inject({
            method: 'POST',
            url: '/api/setup/reset',
            headers,
            payload: {},
          })
        ).statusCode,
        403,
      );
    assert.equal(
      (
        await app.inject({
          method: 'POST',
          url: '/api/setup/reset',
          headers: { 'content-type': 'text/plain' },
          payload: '{}',
        })
      ).statusCode,
      415,
    );
    assert.equal(existsSync(config.localConfigPath), false);
  } finally {
    await app.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test('storage failure leaves setup and recovery settings usable without completing readiness', async () => {
  const { root, config } = fixture();
  const blocked = join(root, 'blocked');
  writeFileSync(blocked, 'keep this file');
  config.databasePath = join(blocked, 'workspace.db');
  const app = buildApp(config);
  try {
    assert.equal((await app.inject('/api/health')).statusCode, 503);
    assert.equal((await app.inject('/api/setup/state')).statusCode, 200);
    assert.equal(
      (await post(app, '/api/setup/check')).json().database.ready,
      false,
    );
    assert.equal((await post(app, '/api/setup/complete')).statusCode, 409);
    assert.equal((await app.inject('/api/applications')).statusCode, 503);
    assert.equal(readFileSync(blocked, 'utf8'), 'keep this file');
  } finally {
    await app.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test('doctor uses only its fixed local interface and exposes sanitized prerequisite status; daily action explicitly requires external Gmail UI', async () => {
  const { root, config } = fixture();
  const cp = join(root, 'career-ops');
  mkdirSync(cp);
  writeFileSync(join(cp, 'PORTABILITY.md'), 'Use the existing doctor.');
  writeFileSync(join(cp, 'doctor.mjs'), 'fixture only');
  config.projects.find((p) => p.id === 'career-ops')!.path = cp;
  let calls = 0;
  const runner: Runner = async (r) => {
    calls++;
    assert.equal(r.bin, process.execPath);
    assert.deepEqual(r.args, [join(cp, 'doctor.mjs'), '--json']);
    assert.equal(r.cwd, cp);
    return {
      code: 0,
      stderr: 'PRIVATE STDERR',
      stdout: JSON.stringify({
        onboardingNeeded: true,
        missing: ['cv.md', 'PRIVATE'],
        warnings: ['PRIVATE TOKEN'],
        autoCopied: [],
        profile: 'PRIVATE CV',
      }),
    };
  };
  const app = buildApp(config, false, { setupRunner: runner });
  try {
    const response = await post(app, '/api/setup/career-ops/test');
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().status, 'Needs setup');
    assert.deepEqual(response.json().missing, ['cv.md']);
    assert.equal(response.json().warningCount, 1);
    assert.ok(!response.body.includes('PRIVATE'));
    const daily = (await post(app, '/api/setup/job-alerts/daily')).json();
    assert.equal(daily.status, 'external_action_required');
    assert.equal(daily.prompt, 'Run daily job alert workflow.');
    assert.equal(calls, 1);
  } finally {
    await app.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test('doctor failures return a useful local error without raw process output', async () => {
  const { root, config } = fixture();
  const cp = join(root, 'career-ops');
  mkdirSync(cp);
  writeFileSync(join(cp, 'PORTABILITY.md'), 'Doctor');
  writeFileSync(join(cp, 'doctor.mjs'), 'fixture');
  config.projects.find((p) => p.id === 'career-ops')!.path = cp;
  const app = buildApp(config, false, {
    setupRunner: async () => {
      throw new Error('PRIVATE timeout details');
    },
  });
  try {
    const r = await post(app, '/api/setup/career-ops/test');
    assert.equal(r.json().status, 'Error');
    assert.ok(!r.body.includes('PRIVATE'));
  } finally {
    await app.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test('malformed local settings expose recovery status without opening another database or overwriting configuration', async () => {
  const { root, config } = fixture();
  writeFileSync(config.localConfigPath, '{"values":{"secret":"PRIVATE"}}');
  const invalid = readConfig({}, root);
  const app = buildApp(invalid);
  try {
    assert.equal((await app.inject('/api/health')).statusCode, 503);
    const state = await app.inject('/api/setup/state');
    assert.equal(state.statusCode, 200);
    assert.match(state.json().error, /Repair/);
    assert.ok(!state.body.includes('PRIVATE'));
    assert.equal(existsSync(config.databasePath), false);
    assert.equal(
      (await post(app, '/api/setup/settings', config.settingsValues))
        .statusCode,
      400,
    );
    assert.match(readFileSync(config.localConfigPath, 'utf8'), /PRIVATE/);
  } finally {
    await app.close();
    rmSync(root, { recursive: true, force: true });
  }
});
