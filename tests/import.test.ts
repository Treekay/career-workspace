import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { buildApp } from '../server/app.js';
import { readConfig, projectRoot } from '../config/runtime.js';
import { openDatabase } from '../server/db/client.js';
import { ApplicationRepository } from '../server/applications/repository.js';
import {
  ApplicationService,
  ImportConflict,
} from '../server/applications/service.js';
const payload = {
  source: 'seek',
  sourceJobId: '12345',
  canonicalKey: 'example|auckland|engineer',
  title: 'Engineer',
  company: 'Example',
  location: 'Auckland',
  url: 'https://www.seek.co.nz/job/12345',
  jdMarkdown: '# Original JD',
  mark: 'SAVED',
  requestedStage: 'SAVED',
};
function fixture() {
  const connection = openDatabase(':memory:');
  let tick = 0;
  return {
    ...connection,
    service: new ApplicationService(
      new ApplicationRepository(connection.db),
      () => new Date(Date.UTC(2026, 8, 29, 0, 0, tick++)).toISOString(),
    ),
  };
}
test('imports create SAVED/APPLIED, preserve JD and manual data, and exact repeats are no-ops', () => {
  const { service, sqlite } = fixture();
  try {
    const first = service.import(payload);
    assert.equal(first.outcome, 'created');
    assert.equal(first.application.stage, 'SAVED');
    assert.equal(first.application.jd_saved_at, first.application.created_at);
    assert.deepEqual(service.import(payload), {
      ...first,
      outcome: 'unchanged',
    });
    service.update(first.application.id, {
      notes: 'Manual notes',
      fit_score: 95,
      analysis_summary: 'Manual analysis',
      next_action: 'Call recruiter',
    });
    const artifact = service.addArtifact(first.application.id, {
      type: 'CV',
      path: 'manual-cv.pdf',
    });
    const advanced = service.import({
      ...payload,
      requestedStage: 'APPLIED',
      jdMarkdown: '# Revised JD',
    });
    assert.equal(advanced.application.stage, 'APPLIED');
    assert.equal(advanced.application.notes, 'Manual notes');
    assert.equal(advanced.application.fit_score, 95);
    assert.equal(advanced.application.analysis_summary, 'Manual analysis');
    assert.equal(advanced.application.next_action, 'Call recruiter');
    assert.deepEqual(service.artifacts(first.application.id), [artifact]);
    const history = service.events(first.application.id);
    assert.equal(
      history.filter(
        (e) => e.event_type === 'STAGE_CHANGED' && e.stage === 'APPLIED',
      ).length,
      1,
    );
    assert.equal(
      service.import({
        ...payload,
        requestedStage: 'APPLIED',
        jdMarkdown: '# Revised JD',
      }).outcome,
      'unchanged',
    );
    assert.deepEqual(service.events(first.application.id), history);
    const noClear = service.import({
      ...payload,
      location: null,
      url: null,
      jdMarkdown: '',
    });
    assert.equal(noClear.outcome, 'unchanged');
    assert.equal(noClear.application.jd_markdown, '# Revised JD');
    assert.equal(
      noClear.application.applied_at,
      advanced.application.applied_at,
    );
    const applied = service.import({
      ...payload,
      sourceJobId: '67890',
      requestedStage: 'APPLIED',
    });
    assert.equal(applied.application.stage, 'APPLIED');
    assert.equal(service.events(applied.application.id)[0].stage, 'APPLIED');
    assert.equal(service.list().length, 2); // Same weak key, distinct strong identities.
  } finally {
    sqlite.close();
  }
});
test('imports match source-scoped IDs or strong keys, never fuzzy identity; conflicts and archives are preserved', () => {
  const { service, sqlite } = fixture();
  try {
    const legacy = service.create({
      source: 'seek',
      title: 'Legacy',
      company: 'Example',
      canonical_key: 'seek:12345',
    });
    const matched = service.import({
      ...payload,
      sourceJobId: undefined,
      canonicalKey: 'seek:12345',
    });
    assert.equal(matched.application.id, legacy.id);
    assert.equal(matched.application.source_job_id, '12345');
    const linked = service.import({ ...payload, source: 'linkedin' });
    assert.notEqual(linked.application.id, legacy.id);
    service.create({
      source: 'seek',
      title: 'Duplicate',
      company: 'Example',
      source_job_id: '12345',
    });
    assert.throws(() => service.import(payload), ImportConflict);
    const snapshot = service.list();
    assert.throws(() =>
      service.import({ ...payload, canonicalKey: 'seek:777' }),
    );
    assert.deepEqual(service.list(), snapshot);
    service.archive(linked.application.id);
    assert.throws(
      () => service.import({ ...payload, source: 'linkedin' }),
      /archived/,
    );
    const inconsistent = service.create({
      source: 'seek',
      source_job_id: '555',
      canonical_key: 'seek:666',
      title: 'Conflict',
      company: 'Example',
    });
    assert.throws(
      () => service.import({ ...payload, sourceJobId: '555' }),
      /conflicts/,
    );
    assert.throws(
      () => service.import({ ...payload, sourceJobId: '666' }),
      /conflicts/,
    );
    assert.equal(service.get(inconsistent.id).source_job_id, '555');
  } finally {
    sqlite.close();
  }
});
test('late or repeated handoffs never regress manual stages or reset stage age', () => {
  const { service, sqlite } = fixture();
  try {
    const imported = service.import({
      ...payload,
      requestedStage: 'APPLIED',
    }).application;
    service.transition(imported.id, { stage: 'INTERVIEW' });
    const before = service.get(imported.id);
    assert.equal(service.import(payload).outcome, 'unchanged');
    assert.equal(
      service.import({ ...payload, requestedStage: 'APPLIED' }).outcome,
      'unchanged',
    );
    service.transition(imported.id, { stage: 'SAVED' });
    assert.equal(
      service.import({ ...payload, requestedStage: 'APPLIED' }).application
        .stage,
      'SAVED',
    );
    const direct = service.create({
      source: 'seek',
      source_job_id: '99',
      title: 'Engineer',
      company: 'Example',
      stage: 'INTERVIEW',
    });
    const late = service.import({
      ...payload,
      sourceJobId: '99',
      requestedStage: 'APPLIED',
    });
    assert.equal(late.application.stage, 'INTERVIEW');
    assert.equal(late.application.stage_entered_at, direct.stage_entered_at);
    assert.equal(
      service.events(direct.id).filter((e) => e.stage === 'APPLIED').length,
      1,
    );
    assert.equal(
      service.import({
        ...payload,
        sourceJobId: '99',
        requestedStage: 'APPLIED',
      }).outcome,
      'unchanged',
    );
    assert.equal(before.stage, 'INTERVIEW');
  } finally {
    sqlite.close();
  }
});
test('history failures roll back both new imports and metadata/JD/stage changes', () => {
  const { service, sqlite } = fixture();
  try {
    const first = service.import(payload).application;
    const before = service.events(first.id);
    sqlite.exec(
      "CREATE TRIGGER fail_import BEFORE INSERT ON application_events BEGIN SELECT RAISE(ABORT, 'blocked event'); END;",
    );
    assert.throws(
      () => service.import({ ...payload, sourceJobId: '999' }),
      /blocked event/,
    );
    assert.throws(
      () =>
        service.import({
          ...payload,
          requestedStage: 'APPLIED',
          jdMarkdown: '# Changed',
        }),
      /blocked event/,
    );
    assert.deepEqual(service.get(first.id), first);
    assert.deepEqual(service.events(first.id), before);
    assert.equal(service.list().length, 1);
  } finally {
    sqlite.close();
  }
});
test('HTTP imports validate payloads and serialize concurrent retries into one record', async () => {
  const app = buildApp({ ...readConfig({}), databasePath: ':memory:' });
  try {
    const send = (body: unknown) =>
      app.inject({
        method: 'POST',
        url: '/api/applications/import',
        payload: body as object,
      });
    for (const bad of [
      { title: '' },
      { source: 'SEEK' },
      { requestedStage: 'INTERVIEW' },
      { sourceJobId: null },
      { mark: 'SKIP' },
      { requestedStage: 'SAVED', mark: 'APPLIED' },
      { notes: 'Overwrite' },
      { artifacts: [] },
      { jdMarkdown: 'x'.repeat(500001) },
      { url: 'javascript:alert(1)' },
      { canonicalKey: 'linkedin:12345' },
    ]) {
      const response = await send({ ...payload, ...bad });
      assert.equal(response.statusCode, 400, response.body);
    }
    const responses = await Promise.all(
      Array.from({ length: 8 }, () => send(payload)),
    );
    assert.equal(responses.filter((r) => r.statusCode === 201).length, 1);
    assert.equal(responses.filter((r) => r.statusCode === 200).length, 7);
    const ids = new Set(responses.map((r) => r.json().application.id));
    assert.equal(ids.size, 1);
    const id = responses[0].json().application.id;
    assert.equal(
      (await app.inject('/api/applications/' + id + '/events')).json().length,
      1,
    );
    const applied = await send({ ...payload, requestedStage: 'APPLIED' });
    assert.equal(applied.json().application.stage, 'APPLIED');
    const archived = await app.inject({
      method: 'DELETE',
      url: '/api/applications/' + id,
    });
    assert.equal(archived.statusCode, 204);
    assert.equal((await send(payload)).statusCode, 409);
    assert.equal(
      (
        await app.inject({
          method: 'POST',
          url: '/api/applications/import',
          headers: { 'content-type': 'text/plain' },
          payload: JSON.stringify(payload),
        })
      ).statusCode,
      415,
    );
    assert.equal(
      (
        await app.inject({
          method: 'POST',
          url: '/api/applications/import',
          headers: { 'content-type': 'application/json' },
          payload: '{',
        })
      ).statusCode,
      400,
    );
    assert.equal(
      (await send({ ...payload, jdMarkdown: 'x'.repeat(1100000) })).statusCode,
      413,
    );
  } finally {
    await app.close();
  }
});
test('CORS and request guards allow only exact local/extension origins and reject writes from remote origins', async () => {
  const extension = 'chrome-extension://' + 'a'.repeat(32);
  const firefox = 'moz-extension://12345678-1234-1234-1234-123456789abc';
  const app = buildApp({
    ...readConfig({ IMPORT_EXTENSION_ORIGINS: extension + ',' + firefox }),
    databasePath: ':memory:',
  });
  try {
    for (const origin of [
      'http://127.0.0.1:5173',
      'http://localhost:3001',
      extension,
      firefox,
    ]) {
      const preflight = await app.inject({
        method: 'OPTIONS',
        url: '/api/applications/import',
        headers: {
          origin,
          'access-control-request-method': 'POST',
          'access-control-request-headers': 'content-type',
          'access-control-request-private-network': 'true',
        },
      });
      assert.equal(preflight.statusCode, 204, preflight.body);
      assert.equal(preflight.headers['access-control-allow-origin'], origin);
      assert.equal(
        preflight.headers['access-control-allow-private-network'],
        'true',
      );
      assert.equal(
        preflight.headers['access-control-allow-credentials'],
        undefined,
      );
      const response = await app.inject({
        method: 'POST',
        url: '/api/applications/import',
        headers: { origin },
        payload,
      });
      assert.ok([200, 201].includes(response.statusCode), response.body);
      assert.equal(response.headers['access-control-allow-origin'], origin);
    }
    for (const origin of [
      'null',
      'https://evil.example',
      'https://www.seek.co.nz',
      'http://localhost:9999',
      'http://localhost.evil:5173',
      extension + '/',
      'chrome-extension://' + 'b'.repeat(32),
    ]) {
      for (const method of ['POST', 'OPTIONS'] as const) {
        const response = await app.inject({
          method,
          url: '/api/applications/import',
          headers: { origin, 'access-control-request-method': 'POST' },
          ...(method === 'POST'
            ? { payload: { ...payload, sourceJobId: '987' } }
            : {}),
        });
        assert.equal(response.statusCode, 403, response.body);
        assert.equal(
          response.headers['access-control-allow-origin'],
          undefined,
        );
      }
    }
    for (const extra of [
      { headers: { host: 'evil.example' } },
      { remoteAddress: '192.168.1.2' },
      { headers: { 'sec-fetch-site': 'cross-site' } },
    ]) {
      assert.equal(
        (
          await app.inject({
            method: 'POST',
            url: '/api/applications/import',
            payload,
            ...extra,
          })
        ).statusCode,
        403,
      );
    }
    assert.equal(
      (
        await app.inject({
          method: 'OPTIONS',
          url: '/api/applications/import',
          headers: {
            origin: extension,
            'access-control-request-method': 'DELETE',
          },
        })
      ).statusCode,
      403,
    );
    assert.equal(
      (
        await app.inject({
          method: 'OPTIONS',
          url: '/api/applications/import',
          headers: {
            origin: extension,
            'access-control-request-method': 'POST',
            'access-control-request-headers': 'authorization',
          },
        })
      ).statusCode,
      403,
    );
    assert.equal((await app.inject('/api/applications')).json().length, 1);
    assert.throws(() => readConfig({ IMPORT_EXTENSION_ORIGINS: '*' }));
    assert.throws(() =>
      readConfig({ IMPORT_EXTENSION_ORIGINS: 'https://evil.example' }),
    );
  } finally {
    await app.close();
  }
});
test('migration upgrades populated history without data loss and restores append-only triggers', () => {
  const root = mkdtempSync(join(tmpdir(), 'workspace-import-migrate-'));
  try {
    const old = join(root, 'old');
    mkdirSync(join(old, 'meta'), { recursive: true });
    const journal = JSON.parse(
      readFileSync(join(projectRoot, 'drizzle/meta/_journal.json'), 'utf8'),
    );
    journal.entries = journal.entries.slice(0, 3);
    writeFileSync(join(old, 'meta/_journal.json'), JSON.stringify(journal));
    for (const entry of journal.entries)
      writeFileSync(
        join(old, entry.tag + '.sql'),
        readFileSync(join(projectRoot, 'drizzle', entry.tag + '.sql')),
      );
    const path = join(root, 'workspace.db');
    const prior = new Database(path);
    migrate(drizzle(prior), { migrationsFolder: old });
    prior.exec(
      "INSERT INTO applications(id,source,source_job_id,title,company,stage,created_at,updated_at) VALUES ('old','seek','12345','Engineer','Example','SAVED','2026-01-01','2026-01-01'); INSERT INTO application_events(id,application_id,event_type,stage,event_at,note) VALUES(42,'old','CREATED','SAVED','2026-01-01','Original history');",
    );
    prior.close();
    const { db, sqlite } = openDatabase(path);
    try {
      const original = sqlite
        .prepare('SELECT * FROM application_events WHERE id=42')
        .get();
      const service = new ApplicationService(new ApplicationRepository(db));
      const result = service.import({ ...payload, requestedStage: 'APPLIED' });
      assert.equal(result.application.id, 'old');
      assert.deepEqual(
        sqlite.prepare('SELECT * FROM application_events WHERE id=42').get(),
        original,
      );
      assert.throws(
        () => sqlite.exec("UPDATE application_events SET note='lost'"),
        /append-only/,
      );
      assert.throws(
        () => sqlite.exec('DELETE FROM application_events'),
        /append-only/,
      );
      assert.deepEqual(sqlite.pragma('foreign_key_check'), []);
      assert.deepEqual(sqlite.pragma('integrity_check'), [
        { integrity_check: 'ok' },
      ]);
    } finally {
      sqlite.close();
    }
    openDatabase(path).sqlite.close();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
