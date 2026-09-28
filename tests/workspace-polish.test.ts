import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { readConfig } from '../config/runtime.js';
import { buildApp } from '../server/app.js';

test('workspace summary uses real history, preserves archives and missing discovery as unknown', async () => {
  const root = mkdtempSync(join(tmpdir(), 'workspace-summary-'));
  const config = readConfig({}, root);
  config.databasePath = ':memory:';
  const app = buildApp(config);
  try {
    const create = await app.inject({
      method: 'POST',
      url: '/api/applications',
      payload: { source: 'other', title: 'Engineer', company: 'Fixture' },
    });
    const a = create.json();
    assert.equal(create.statusCode, 201);
    await app.inject({
      method: 'POST',
      url: `/api/applications/${a.id}/stage`,
      payload: { stage: 'INTERVIEW' },
    });
    const first = (await app.inject('/api/workspace/summary')).json();
    assert.equal(first.discovery.today, null);
    assert.equal(first.discovery.high, null);
    assert.equal(first.discovery.status, 'missing');
    assert.equal(first.activity.length, 2);
    assert.equal(first.activity[0].stage, 'INTERVIEW');
    await app.inject({ method: 'DELETE', url: `/api/applications/${a.id}` });
    const archived = (await app.inject('/api/workspace/summary')).json();
    assert.equal(archived.activity.length, 3);
    assert.ok(
      archived.activity.every((e: { archived: boolean }) => e.archived),
    );
    const health = (await app.inject('/api/workspace/integrations')).json();
    assert.equal(health.database.status, 'Connected');
    assert.equal(health.easyseek.status, 'Not configured');
    assert.equal(health.alerts.status, 'Unavailable');
    assert.match(health.easyseek.message, /cannot be detected/);
  } finally {
    await app.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test('discovery summary counts exported jobs, caches briefly and explicit health checks refresh stale state', async () => {
  const root = mkdtempSync(join(tmpdir(), 'workspace-export-'));
  const config = readConfig({ JOB_ALERT_WORKFLOW_PATH: './alerts' }, root);
  config.databasePath = ':memory:';
  const dir = join(root, 'alerts', 'job-ops', 'exports');
  mkdirSync(dir, { recursive: true });
  const now = new Date().toISOString();
  const exportData = {
    timezone: 'UTC',
    generated_at: now,
    run_date: now.slice(0, 10),
    current_scope_available: true,
    job_retention_days: 30,
    jobs: [
      {
        canonical_key: 'seek:1',
        source: 'SEEK',
        title: 'Engineer',
        company: 'Fixture',
        location: null,
        fit: 'HIGH',
        reason: 'Exported reason',
        first_seen_at: now,
        last_seen_at: now,
        url: 'https://www.seek.co.nz/job/1',
      },
    ],
  };
  const file = join(dir, 'review-queue.json');
  writeFileSync(file, JSON.stringify(exportData));
  const app = buildApp(config);
  try {
    const summary = (await app.inject('/api/workspace/summary')).json();
    assert.equal(summary.discovery.today, 1);
    assert.equal(summary.discovery.high, 1);
    assert.equal(summary.discovery.status, 'ready');
    exportData.run_date = '2000-01-01';
    writeFileSync(file, JSON.stringify(exportData));
    assert.equal(
      (await app.inject('/api/workspace/summary')).json().discovery.status,
      'ready',
    );
    assert.equal(
      (await app.inject('/api/workspace/integrations?refresh=true')).json()
        .alerts.status,
      'Error',
    );
    assert.equal(
      (await app.inject('/api/workspace/summary')).json().discovery.status,
      'stale',
    );
  } finally {
    await app.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test('Career Ops dashboard joins persisted manifests and artifacts, excludes archived applications', async () => {
  const root = mkdtempSync(join(tmpdir(), 'workspace-dashboard-'));
  const config = readConfig({}, root);
  config.databasePath = ':memory:';
  const app = buildApp(config);
  try {
    const a = (
      await app.inject({
        method: 'POST',
        url: '/api/applications',
        payload: {
          source: 'other',
          company: 'Fixture',
          title: 'Engineer',
          jd_markdown: '# Saved JD',
        },
      })
    ).json();
    const runId = randomUUID();
    const dir = join(root, 'data', 'applications', a.id, 'career-ops', runId);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'run.json'),
      JSON.stringify({
        id: runId,
        applicationId: a.id,
        action: 'analyze-fit',
        status: 'completed',
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        message: 'Saved',
        artifactPath: 'data/result.md',
      }),
    );
    await app.inject({
      method: 'POST',
      url: `/api/applications/${a.id}/artifacts`,
      payload: { type: 'ANALYSIS', path: 'data/result.md' },
    });
    const dashboard = (await app.inject('/api/workspace/career-ops')).json();
    assert.equal(dashboard.applications.length, 1);
    assert.equal(dashboard.applications[0].hasJd, true);
    assert.equal(dashboard.applications[0].analyzed, false);
    assert.equal(dashboard.runs[0].id, runId);
    assert.equal(dashboard.artifacts.length, 1);
    await app.inject({ method: 'DELETE', url: `/api/applications/${a.id}` });
    assert.deepEqual((await app.inject('/api/workspace/career-ops')).json(), {
      applications: [],
      runs: [],
      artifacts: [],
      warnings: [],
    });
  } finally {
    await app.close();
    rmSync(root, { recursive: true, force: true });
  }
});
