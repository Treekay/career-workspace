import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { ZodError } from 'zod';
import { openDatabase } from '../server/db/client.js';
import { ApplicationRepository } from '../server/applications/repository.js';
import {
  ApplicationNotFound,
  ApplicationService,
} from '../server/applications/service.js';
import { buildApp } from '../server/app.js';
import { projectRoot, readConfig } from '../config/runtime.js';
import { applicationStages, artifactTypes } from '../shared/tracker.js';

const base = {
  source: 'seek',
  source_job_id: '123',
  title: 'Software Engineer',
  company: 'Example',
};
function fixture() {
  const connection = openDatabase(':memory:');
  let tick = 0;
  const service = new ApplicationService(
    new ApplicationRepository(connection.db),
    () => new Date(Date.UTC(2026, 8, 28, 0, 0, tick++)).toISOString(),
  );
  return { ...connection, service };
}

test('CRUD defaults, explicit nullable metadata, timestamps, and archive visibility', () => {
  const { service, sqlite } = fixture();
  try {
    const saved = service.create({ ...base, jd_markdown: '# Original JD' });
    assert.equal(saved.stage, 'SAVED');
    assert.equal(saved.canonical_key, 'seek:123');
    assert.equal(saved.applied_at, null);
    assert.equal(saved.jd_saved_at, saved.created_at);
    assert.equal(saved.updated_at, saved.created_at);
    assert.equal(service.list().length, 1);
    const updated = service.update(saved.id, {
      title: 'Senior Software Engineer',
      location: 'Auckland',
      url: 'https://example.com/job',
      notes: 'Follow up',
      fit_level: 'strong',
      fit_score: 88.5,
      analysis_summary: 'Relevant experience',
      next_action: 'Prepare CV',
      next_action_at: '2026-10-01T10:00:00+13:00',
    });
    assert.equal(updated.next_action_at, '2026-09-30T21:00:00.000Z');
    assert.ok(updated.updated_at > saved.updated_at);
    assert.equal(updated.created_at, saved.created_at);
    assert.equal(updated.jd_markdown, saved.jd_markdown);
    assert.equal(service.events(saved.id).length, 1);
    service.update(saved.id, { notes: null, fit_score: null });
    assert.equal(service.get(saved.id).notes, null);
    service.archive(saved.id);
    service.archive(saved.id);
    assert.equal(service.list().length, 0);
    assert.throws(() => service.get(saved.id), ApplicationNotFound);
    assert.ok(service.get(saved.id, { include_deleted: 'true' }).deleted_at);
    assert.equal(service.list({ include_deleted: 'true' }).length, 1);
    assert.deepEqual(
      service.events(saved.id).map((event) => event.event_type),
      ['CREATED', 'ARCHIVED'],
    );
    assert.throws(
      () => service.update(saved.id, { notes: 'change' }),
      ApplicationNotFound,
    );
    assert.throws(
      () => service.transition(saved.id, { stage: 'APPLIED' }),
      ApplicationNotFound,
    );
  } finally {
    sqlite.close();
  }
});

test('every stage change preserves ordered history; repeated stage is a no-op; reopening preserves applied_at', () => {
  const { service, sqlite } = fixture();
  try {
    const saved = service.create(base);
    let appliedAt: string | null = null;
    for (const stage of applicationStages.slice(1)) {
      const row = service.transition(saved.id, {
        stage,
        note: 'Moved to ' + stage,
      });
      if (stage === 'APPLIED') appliedAt = row.applied_at;
      if (appliedAt) assert.equal(row.applied_at, appliedAt);
    }
    assert.deepEqual(
      service.events(saved.id).map((event) => event.stage),
      [...applicationStages],
    );
    assert.equal(service.events(saved.id)[2].note, 'Moved to APPLIED');
    const previous = service.get(saved.id);
    assert.deepEqual(
      service.transition(saved.id, { stage: 'WITHDRAWN' }),
      previous,
    );
    assert.equal(service.events(saved.id).length, applicationStages.length);
    service.transition(saved.id, { stage: 'PREPARING' });
    service.transition(saved.id, { stage: 'APPLIED' });
    assert.equal(service.get(saved.id).applied_at, appliedAt);
    assert.equal(service.events(saved.id).length, applicationStages.length + 2);
    const alreadyApplied = service.create({
      ...base,
      stage: 'APPLIED',
      applied_at: '2026-09-01T10:00:00Z',
    });
    assert.equal(alreadyApplied.applied_at, '2026-09-01T10:00:00.000Z');
    assert.equal(service.events(alreadyApplied.id)[0].stage, 'APPLIED');
    const automatic = service.create({ ...base, stage: 'APPLIED' });
    assert.equal(automatic.applied_at, automatic.created_at);
  } finally {
    sqlite.close();
  }
});

test('failed history insert rolls back creation, stage changes, archive, and artifacts', () => {
  const { service, sqlite } = fixture();
  try {
    const saved = service.create(base);
    sqlite.exec(
      "CREATE TRIGGER reject_test_events BEFORE INSERT ON application_events BEGIN SELECT RAISE(ABORT, 'test event failure'); END;",
    );
    assert.throws(
      () => service.create({ ...base, title: 'Another' }),
      /test event failure/,
    );
    assert.throws(
      () => service.transition(saved.id, { stage: 'APPLIED' }),
      /test event failure/,
    );
    assert.throws(() => service.archive(saved.id), /test event failure/);
    assert.throws(
      () =>
        service.addArtifact(saved.id, { type: 'CV', path: 'artifacts/cv.pdf' }),
      /test event failure/,
    );
    assert.deepEqual(service.get(saved.id), saved);
    assert.equal(service.list().length, 1);
    assert.equal(service.events(saved.id).length, 1);
    assert.equal(service.artifacts(saved.id).length, 0);
  } finally {
    sqlite.close();
  }
});

test('canonical keys and source IDs are non-unique hints and never merge distinct applications', () => {
  const { service, sqlite } = fixture();
  try {
    const one = service.create({ ...base, canonical_key: 'possible-match' });
    const two = service.create({ ...base, canonical_key: 'possible-match' });
    const three = service.create({
      ...base,
      source: 'linkedin',
      canonical_key: 'possible-match',
    });
    assert.equal(new Set([one.id, two.id, three.id]).size, 3);
    service.update(one.id, { notes: 'Only first application' });
    assert.equal(service.get(two.id).notes, null);
    assert.equal(service.events(three.id).length, 1);
    assert.equal(
      service.create({ ...base, source_job_id: null }).canonical_key,
      null,
    );
    assert.equal(service.list({ limit: '2', offset: '1' }).length, 2);
    assert.equal(service.list({ stage: 'APPLIED' }).length, 0);
  } finally {
    sqlite.close();
  }
});

test('artifact references support all types and survive archiving without reading or deleting files', () => {
  const { service, sqlite } = fixture();
  try {
    const saved = service.create(base);
    for (const type of artifactTypes) {
      service.addArtifact(saved.id, {
        type,
        path: 'documents/nonexistent-' + type + '.md',
      });
    }
    service.archive(saved.id);
    assert.equal(service.artifacts(saved.id).length, 5);
    assert.equal(
      service
        .events(saved.id)
        .filter((event) => event.event_type === 'ARTIFACT_ADDED').length,
      5,
    );
    assert.throws(
      () => service.addArtifact(saved.id, { type: 'CV', path: 'new.pdf' }),
      ApplicationNotFound,
    );
    assert.throws(
      () => service.addArtifact(randomUUID(), { type: 'CV', path: 'new.pdf' }),
      ApplicationNotFound,
    );
  } finally {
    sqlite.close();
  }
});

test('database constraints reject invalid enums, score, orphan rows, destructive parent deletion, and history rewrites', () => {
  const { service, sqlite } = fixture();
  try {
    const saved = service.create(base);
    assert.throws(
      () =>
        sqlite
          .prepare('UPDATE applications SET stage = ? WHERE id = ?')
          .run('UNKNOWN', saved.id),
      /CHECK constraint/,
    );
    assert.throws(
      () =>
        sqlite
          .prepare('UPDATE applications SET source = ? WHERE id = ?')
          .run('market', saved.id),
      /CHECK constraint/,
    );
    assert.throws(
      () =>
        sqlite
          .prepare('UPDATE applications SET fit_score = ? WHERE id = ?')
          .run(101, saved.id),
      /CHECK constraint/,
    );
    assert.throws(
      () =>
        sqlite.prepare('DELETE FROM applications WHERE id = ?').run(saved.id),
      /FOREIGN KEY/,
    );
    assert.throws(
      () => sqlite.exec("UPDATE application_events SET note = 'rewritten'"),
      /append-only/,
    );
    assert.throws(
      () => sqlite.exec('DELETE FROM application_events'),
      /append-only/,
    );
    assert.throws(
      () =>
        sqlite
          .prepare(
            "INSERT INTO artifacts (id, application_id, type, path, created_at) VALUES (?, ?, 'CV', 'cv.pdf', ?)",
          )
          .run(randomUUID(), randomUUID(), saved.created_at),
      /FOREIGN KEY/,
    );
    assert.throws(
      () =>
        sqlite
          .prepare(
            "INSERT INTO artifacts (id, application_id, type, path, created_at) VALUES (?, ?, 'OTHER', 'cv.pdf', ?)",
          )
          .run(randomUUID(), saved.id, saved.created_at),
      /CHECK constraint/,
    );
    assert.deepEqual(sqlite.pragma('foreign_key_check'), []);
    assert.deepEqual(sqlite.pragma('integrity_check'), [
      { integrity_check: 'ok' },
    ]);
  } finally {
    sqlite.close();
  }
});

test('service validates writes and rejects stage bypass, unknown fields, malformed dates, and invalid IDs', () => {
  const { service, sqlite } = fixture();
  try {
    const saved = service.create(base);
    for (const bad of [
      { stage: 'INVALID' },
      { source: 'market' },
      { title: ' ' },
      { fit_score: -1 },
      { applied_at: '2026-02-30T00:00:00Z' },
      { url: 'javascript:alert(1)' },
      { browser_memory_id: 'cache-only' },
    ]) {
      assert.throws(() => service.create({ ...base, ...bad }), ZodError);
    }
    assert.throws(
      () => service.update(saved.id, { stage: 'APPLIED' }),
      ZodError,
    );
    assert.throws(
      () => service.update(saved.id, { created_at: '2026-01-01T00:00:00Z' }),
      ZodError,
    );
    assert.throws(() => service.update(saved.id, {}), ZodError);
    assert.throws(() => service.get('not-a-uuid'), ZodError);
    assert.throws(() => service.list({ limit: '999999' }), ZodError);
    assert.equal(service.events(saved.id).length, 1);
  } finally {
    sqlite.close();
  }
});

test('upgrade from original schema preserves metadata; application history survives database reopen and browser-cache expiry', () => {
  const root = mkdtempSync(join(tmpdir(), 'career-tracker-upgrade-'));
  const dbPath = join(root, 'workspace.db');
  try {
    const legacyFolder = join(root, 'legacy');
    mkdirSync(join(legacyFolder, 'meta'), { recursive: true });
    const journal = JSON.parse(
      readFileSync(join(projectRoot, 'drizzle/meta/_journal.json'), 'utf8'),
    );
    journal.entries = journal.entries.slice(0, 1);
    writeFileSync(
      join(legacyFolder, 'meta/_journal.json'),
      JSON.stringify(journal),
    );
    const sqlName = journal.entries[0].tag + '.sql';
    writeFileSync(
      join(legacyFolder, sqlName),
      readFileSync(join(projectRoot, 'drizzle', sqlName)),
    );
    const legacy = new Database(dbPath);
    migrate(drizzle(legacy), { migrationsFolder: legacyFolder });
    legacy
      .prepare('INSERT INTO workspace_metadata (key,value) VALUES (?,?)')
      .run('initialized_at', 'original');
    legacy.close();

    let connection = openDatabase(dbPath);
    let service = new ApplicationService(
      new ApplicationRepository(connection.db),
    );
    const saved = service.create(base);
    service.transition(saved.id, { stage: 'APPLIED' });
    const history = service.events(saved.id);
    // Model an independent browser discovery cache; no application FK points at it.
    connection.sqlite.exec(
      "CREATE TABLE browser_memory (source_job_id TEXT); INSERT INTO browser_memory VALUES ('123'); DELETE FROM browser_memory; DROP TABLE browser_memory;",
    );
    connection.sqlite.close();
    connection = openDatabase(dbPath);
    try {
      service = new ApplicationService(
        new ApplicationRepository(connection.db),
      );
      assert.equal(service.get(saved.id).stage, 'APPLIED');
      assert.deepEqual(service.events(saved.id), history);
      assert.deepEqual(
        connection.sqlite
          .prepare(
            "SELECT value FROM workspace_metadata WHERE key = 'initialized_at'",
          )
          .get(),
        { value: 'original' },
      );
      assert.equal(
        connection.sqlite
          .prepare('SELECT count(*) AS count FROM __drizzle_migrations')
          .get() &&
          (
            connection.sqlite
              .prepare('SELECT count(*) AS count FROM __drizzle_migrations')
              .get() as { count: number }
          ).count,
        4,
      );
    } finally {
      connection.sqlite.close();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('HTTP application CRUD, stage events, validation errors, artifacts, filtering, and archived reads', async () => {
  const root = mkdtempSync(join(tmpdir(), 'career-tracker-api-'));
  const app = buildApp(readConfig({ DATABASE_PATH: './test.db' }, root));
  try {
    const create = await app.inject({
      method: 'POST',
      url: '/api/applications',
      payload: base,
    });
    assert.equal(create.statusCode, 201, create.body);
    const id = create.json().id;
    const url = '/api/applications/' + id;
    assert.equal(create.headers.location, url);
    assert.equal(
      (await app.inject({ method: 'GET', url })).json().stage,
      'SAVED',
    );
    assert.equal(
      (
        await app.inject({ method: 'PATCH', url, payload: { notes: 'A note' } })
      ).json().notes,
      'A note',
    );
    assert.equal(
      (
        await app.inject({
          method: 'PATCH',
          url,
          payload: { stage: 'APPLIED' },
        })
      ).statusCode,
      400,
    );
    assert.equal(
      (
        await app.inject({
          method: 'POST',
          url: url + '/stage',
          payload: { stage: 'APPLIED', note: 'Sent CV' },
        })
      ).json().stage,
      'APPLIED',
    );
    assert.equal(
      (
        await app.inject({
          method: 'POST',
          url: url + '/stage',
          payload: { stage: 'APPLIED' },
        })
      ).statusCode,
      200,
    );
    const history = (
      await app.inject({ method: 'GET', url: url + '/events' })
    ).json();
    assert.deepEqual(
      history.map((event: { stage: string }) => event.stage),
      ['SAVED', 'APPLIED'],
    );
    assert.equal(history[1].note, 'Sent CV');
    assert.equal(
      (
        await app.inject({
          method: 'POST',
          url: url + '/artifacts',
          payload: { type: 'CV', path: 'documents/cv.pdf' },
        })
      ).statusCode,
      201,
    );
    assert.equal(
      (await app.inject({ method: 'GET', url: url + '/artifacts' })).json()
        .length,
      1,
    );
    assert.equal(
      (
        await app.inject({
          method: 'GET',
          url: '/api/applications?stage=APPLIED',
        })
      ).json().length,
      1,
    );
    assert.equal(
      (
        await app.inject({
          method: 'GET',
          url: '/api/applications?stage=SAVED',
        })
      ).json().length,
      0,
    );
    assert.equal(
      (
        await app.inject({
          method: 'GET',
          url: '/api/applications?include_deleted=maybe',
        })
      ).statusCode,
      400,
    );
    assert.equal(
      (
        await app.inject({
          method: 'GET',
          url: '/api/applications/' + randomUUID(),
        })
      ).statusCode,
      404,
    );
    assert.equal(
      (
        await app.inject({
          method: 'POST',
          url: '/api/applications',
          payload: { ...base, source: 'unknown' },
        })
      ).statusCode,
      400,
    );
    assert.equal((await app.inject({ method: 'DELETE', url })).statusCode, 204);
    assert.equal((await app.inject({ method: 'DELETE', url })).statusCode, 204);
    assert.equal((await app.inject({ method: 'GET', url })).statusCode, 404);
    assert.equal(
      (await app.inject({ method: 'GET', url: '/api/applications' })).json()
        .length,
      0,
    );
    assert.equal(
      (await app.inject({ method: 'GET', url: url + '?include_deleted=true' }))
        .statusCode,
      200,
    );
    assert.equal(
      (await app.inject({ method: 'GET', url: url + '/events' })).json().length,
      4,
    );
    assert.equal(
      (await app.inject({ method: 'GET', url: url + '/artifacts' })).json()
        .length,
      1,
    );
    assert.equal(
      (
        await app.inject({
          method: 'POST',
          url: url + '/stage',
          payload: { stage: 'INTERVIEW' },
        })
      ).statusCode,
      404,
    );
  } finally {
    await app.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test('JD snapshot timestamps update, clear, and respect explicit unknown or historical values', () => {
  const { service, sqlite } = fixture();
  try {
    const saved = service.create({
      ...base,
      jd_markdown: '# JD',
      jd_saved_at: null,
    });
    assert.equal(saved.jd_saved_at, null);
    const edited = service.update(saved.id, { jd_markdown: '# Revised JD' });
    assert.equal(edited.jd_saved_at, edited.updated_at);
    const historical = service.update(saved.id, {
      jd_markdown: '# Archived JD',
      jd_saved_at: '2026-09-01T00:00:00Z',
    });
    assert.equal(historical.jd_saved_at, '2026-09-01T00:00:00.000Z');
    const cleared = service.update(saved.id, { jd_markdown: null });
    assert.equal(cleared.jd_saved_at, null);
    assert.equal(cleared.jd_markdown, null);
    assert.equal(service.events(saved.id).length, 1);
  } finally {
    sqlite.close();
  }
});

test('stage age follows transition events, never metadata updates or artifact creation', () => {
  const { service, sqlite } = fixture();
  try {
    const saved = service.create(base);
    assert.equal(service.get(saved.id).stage_entered_at, saved.created_at);
    service.transition(saved.id, { stage: 'APPLIED' });
    const entered = service.get(saved.id).stage_entered_at;
    assert.notEqual(entered, saved.created_at);
    service.update(saved.id, { notes: 'A later edit' });
    service.addArtifact(saved.id, { type: 'CV', path: 'cv.pdf' });
    assert.equal(service.get(saved.id).stage_entered_at, entered);
    assert.equal(service.list()[0].stage_entered_at, entered);
    assert.ok(service.get(saved.id).updated_at > entered);
    service.transition(saved.id, { stage: 'INTERVIEW' });
    assert.ok(service.get(saved.id).stage_entered_at > entered);
  } finally {
    sqlite.close();
  }
});
