import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { buildApp } from '../server/app.js';
import { readConfig } from '../config/runtime.js';
import { openDatabase } from '../server/db/client.js';
import { workspaceMetadata } from '../server/db/schema.js';

test('relative paths resolve from the project root, and absolute overrides survive', () => {
  const root = resolve('fixtures/workspace');
  const external = resolve('fixtures/external');
  const config = readConfig(
    { EASYSEEK_PATH: external, DATABASE_PATH: './storage/local.db' },
    root,
  );
  assert.equal(config.projects[0].path, external);
  assert.equal(config.projects[1].path, resolve(root, '../job-alert-workflow'));
  assert.equal(config.projects[2].path, resolve(root, '../career-ops'));
  assert.equal(config.databasePath, join(root, 'storage/local.db'));
  assert.equal(config.host, '127.0.0.1');
  assert.equal(config.apiPort, 3001);
});
test('rejects invalid ports, collisions, and empty paths', () => {
  for (const API_PORT of ['0', '65536', '-1', 'abc', '3001.5', '']) {
    assert.throws(() => readConfig({ API_PORT }), /integer/);
  }
  assert.throws(() => readConfig({ API_PORT: '5173' }), /must differ/);
  assert.throws(() => readConfig({ CAREER_OPS_PATH: '' }), /cannot be empty/);
  assert.equal(
    readConfig({ API_PORT: '4001', WEB_PORT: '4173' }).apiPort,
    4001,
  );
});
test('migrations are idempotent and metadata persists across reopen', () => {
  const root = mkdtempSync(join(tmpdir(), 'career-workspace-db-'));
  try {
    const path = join(root, 'nested/workspace.db');
    let connection = openDatabase(path);
    const first = connection.db.select().from(workspaceMetadata).all();
    assert.equal(first.length, 1);
    assert.equal(first[0].key, 'initialized_at');
    connection.sqlite.close();
    connection = openDatabase(path);
    try {
      assert.deepEqual(
        connection.db.select().from(workspaceMetadata).all(),
        first,
      );
      const tables = connection.sqlite
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
        .all();
      assert.ok(JSON.stringify(tables).includes('applications'));
    } finally {
      connection.sqlite.close();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test('health queries SQLite; setup tolerates missing siblings and rejects files as directories', async () => {
  const root = mkdtempSync(join(tmpdir(), 'career-workspace-api-'));
  mkdirSync(join(root, 'existing'));
  writeFileSync(join(root, 'not-a-directory'), '');
  const app = buildApp(
    readConfig(
      {
        DATABASE_PATH: './local.db',
        EASYSEEK_PATH: './existing',
        JOB_ALERT_WORKFLOW_PATH: './missing',
        CAREER_OPS_PATH: './not-a-directory',
      },
      root,
    ),
  );
  try {
    const health = await app.inject({ method: 'GET', url: '/api/health' });
    assert.equal(health.statusCode, 200);
    assert.deepEqual(health.json(), {
      status: 'ok',
      service: 'career-workspace',
      database: 'ok',
    });
    const setup = await app.inject({ method: 'GET', url: '/api/setup' });
    assert.equal(setup.statusCode, 200);
    assert.deepEqual(
      setup.json().projects.map((p: { available: boolean }) => p.available),
      [true, false, false],
    );
    assert.equal(
      (await app.inject({ method: 'GET', url: '/api/not-implemented' }))
        .statusCode,
      404,
    );
    assert.equal(
      (await app.inject({ method: 'POST', url: '/api/setup', payload: {} }))
        .statusCode,
      404,
    );
  } finally {
    await app.close();
    rmSync(root, { recursive: true, force: true });
  }
});
