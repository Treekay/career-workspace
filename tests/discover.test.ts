import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  statSync,
  utimesSync,
  rmSync,
  symlinkSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readConfig } from '../config/runtime.js';
import { buildApp } from '../server/app.js';
import {
  DiscoverError,
  localDay,
  normalizeExport,
  readDiscover,
} from '../server/discover/service.js';
import { filterJobs } from '../client/discover/model.js';

const now = new Date('2026-09-28T12:30:00Z'); // September 29 in Auckland
const row = (overrides: Record<string, unknown> = {}) => ({
  canonical_key: 'job-1',
  source: 'SEEK',
  source_job_id: null,
  title: 'Backend Engineer',
  company: 'Fern Labs',
  location: 'Auckland',
  fit: 'MEDIUM',
  reason: 'Strong backend focus',
  first_seen_at: '2026-09-28T11:30:00Z',
  last_seen_at: '2026-09-28T11:30:00Z',
  url: 'https://www.seek.co.nz/job/123',
  ...overrides,
});
const envelope = (jobs: unknown[] = [row()]) => ({
  timezone: 'Pacific/Auckland',
  generated_at: '2026-09-28T12:00:00Z',
  run_date: '2026-09-29',
  latest_run: { run_date: '2026-09-29', job_keys: ['job-1'] },
  summary: { queue_count: 99, new_canonical_jobs: 99 },
  job_retention_days: 30,
  current_scope_available: true,
  jobs,
});
test('actual envelope is normalized, today follows export timezone, and counts are recomputed', () => {
  const data = normalizeExport(
    envelope([
      row(),
      row({
        canonical_key: 'yesterday',
        first_seen_at: '2026-09-28T10:30:00Z',
        last_seen_at: '2026-09-28T10:30:00Z',
      }),
      row({
        canonical_key: 'old-first',
        first_seen_at: '2026-08-01T00:00:00Z',
      }),
      row({
        canonical_key: 'boundary',
        first_seen_at: '2026-08-30T12:00:00Z',
        last_seen_at: '2026-08-30T12:00:00Z',
      }),
      row({
        canonical_key: 'expired',
        first_seen_at: '2026-08-20T00:00:00Z',
        last_seen_at: '2026-08-30T10:00:00Z',
      }),
    ]),
    now,
    36,
    now,
  );
  assert.equal(data.today, '2026-09-29');
  assert.equal(data.current_job_count, 4);
  assert.equal(data.today_new_count, 1);
  assert.equal(data.last_run_at, null);
  assert.equal(data.status, 'ready');
  assert.deepEqual(
    data.jobs.map((j) => j.canonical_key),
    ['job-1', 'yesterday', 'old-first', 'boundary'],
  );
});
test('freshness distinguishes producer run date and file age from a stable data watermark', () => {
  const input = { ...envelope(), generated_at: '2026-08-01T00:00:00Z' };
  assert.equal(normalizeExport(input, now, 36, now).status, 'ready');
  assert.equal(
    normalizeExport(input, new Date(now.getTime() - 37 * 3600000), 36, now)
      .status,
    'stale',
  );
  assert.equal(
    normalizeExport({ ...input, run_date: '2026-09-20' }, now, 36, now).status,
    'stale',
  );
  assert.throws(
    () => normalizeExport({ ...input, run_date: '2027-01-01' }, now, 36, now),
    DiscoverError,
  );
});
test('URL allowlist accepts real SEEK redirects and LinkedIn, rejects disguised or executable links', () => {
  const urls = [
    ['SEEK', 'https://email.s.seek.co.nz/ss/c/example', true],
    [
      'LINKEDIN',
      'https://www.linkedin.com/comm/jobs/view/123/?tracking=example',
      true,
    ],
    ['SEEK', 'https://au.seek.com/job/123', true],
    ['SEEK', 'https://seek.co.nz.evil.example/job/1', false],
    ['SEEK', 'javascript:alert(1)', false],
    ['SEEK', 'https://www.linkedin.com/jobs/view/1', false],
    ['LINKEDIN', 'https://user:password@linkedin.com/jobs/1', false],
    ['LINKEDIN', 'https://linkedin.com:123/jobs/1', false],
  ] as const;
  const data = normalizeExport(
    envelope(
      urls.map(([source, url], i) =>
        row({ canonical_key: String(i), source, url }),
      ),
    ),
    now,
    36,
    now,
  );
  urls.forEach(([, , allowed], i) =>
    assert.equal(data.jobs[i].url !== null, allowed),
  );
  assert.ok(data.warnings.some((w) => w.startsWith('5 unsupported')));
});
test('bad rows and unsupported envelopes are explicit, and extra data is not exposed', () => {
  const data = normalizeExport(
    envelope([
      row({ private_note: 'not part of contract' }),
      row(),
      row({ canonical_key: 'bad', first_seen_at: 'invalid' }),
      row({ canonical_key: 'future', last_seen_at: '2027-01-01T00:00:00Z' }),
    ]),
    now,
    36,
    now,
  );
  assert.equal(data.jobs.length, 1);
  assert.ok(data.warnings[0].startsWith('3 invalid'));
  assert.equal('private_note' in data.jobs[0], false);
  assert.throws(() => normalizeExport([], now, 36, now), DiscoverError);
  assert.throws(
    () =>
      normalizeExport({ ...envelope(), timezone: 'not-a-zone' }, now, 36, now),
    DiscoverError,
  );
  assert.throws(
    () =>
      normalizeExport(
        { ...envelope(), current_scope_available: false },
        now,
        36,
        now,
      ),
    DiscoverError,
  );
  assert.throws(
    () => readConfig({ DISCOVER_STALE_HOURS: '0' }),
    /positive number/,
  );
});
test('filter/search/sort support every requested field and preserve recommended ranking', () => {
  const data = normalizeExport(
    envelope([
      row({
        canonical_key: 'a',
        company: 'Zulu',
        fit: 'LOW',
        reason: 'Distributed queues',
      }),
      row({
        canonical_key: 'b',
        source: 'LINKEDIN',
        company: 'Alpha',
        location: 'Wellington',
        title: 'Platform Developer',
        fit: 'HIGH',
        url: 'https://linkedin.com/jobs/view/2',
        first_seen_at: '2026-09-27T00:00:00Z',
      }),
      row({ canonical_key: 'c', company: 'Beta', fit: 'SKIP' }),
    ]),
    now,
    36,
    now,
  );
  const base = {
    scope: 'Last 30 Days' as const,
    fit: 'All',
    source: 'All',
    search: '',
    sort: 'Recommended',
  };
  assert.deepEqual(
    filterJobs(data, base).map((j) => j.canonical_key),
    ['a', 'b', 'c'],
  );
  assert.deepEqual(
    filterJobs(data, { ...base, sort: 'Company' }).map((j) => j.company),
    ['Alpha', 'Beta', 'Zulu'],
  );
  assert.deepEqual(
    filterJobs(data, { ...base, sort: 'Fit' }).map((j) => j.fit),
    ['HIGH', 'LOW', 'SKIP'],
  );
  assert.equal(
    filterJobs(data, { ...base, sort: 'Newest' })[0].canonical_key,
    'a',
  );
  for (const search of ['platform', 'alpha', 'WELLINGTON'])
    assert.equal(filterJobs(data, { ...base, search })[0].canonical_key, 'b');
  assert.equal(
    filterJobs(data, { ...base, search: 'queues' })[0].canonical_key,
    'a',
  );
  assert.equal(
    filterJobs(data, { ...base, fit: 'HIGH', source: 'LINKEDIN' }).length,
    1,
  );
  assert.equal(filterJobs(data, { ...base, scope: 'Today' }).length, 2);
});
test('fixed-path file reader and API are read-only, bounded, and recover from missing or malformed files', async () => {
  const root = mkdtempSync(join(tmpdir(), 'career-discover-'));
  const sibling = join(root, 'sibling');
  const exports = join(sibling, 'job-ops/exports');
  mkdirSync(exports, { recursive: true });
  const file = join(exports, 'review-queue.json');
  const config = readConfig(
    { DATABASE_PATH: './test.db', JOB_ALERT_WORKFLOW_PATH: sibling },
    root,
  );
  const app = buildApp(config);
  try {
    const missing = await app.inject({ method: 'GET', url: '/api/discover' });
    assert.equal(missing.statusCode, 503);
    assert.equal(missing.json().status, 'missing');
    assert.equal(
      (await app.inject({ method: 'GET', url: '/api/health' })).statusCode,
      200,
    );
    writeFileSync(file, '{');
    assert.equal(
      (await app.inject({ method: 'GET', url: '/api/discover' })).json().status,
      'invalid',
    );
    const fileNow = new Date(Date.now() - 60000);
    const live = {
      ...envelope([
        row({
          first_seen_at: fileNow.toISOString(),
          last_seen_at: fileNow.toISOString(),
        }),
      ]),
      generated_at: fileNow.toISOString(),
      run_date: localDay(fileNow, 'Pacific/Auckland'),
    };
    writeFileSync(file, JSON.stringify(live));
    utimesSync(file, fileNow, fileNow);
    const bytes = readFileSync(file);
    const mtime = statSync(file).mtimeMs;
    const result = await readDiscover(config, fileNow);
    assert.equal(result.current_job_count, 1);
    const api = await app.inject({
      method: 'GET',
      url: '/api/discover?path=../../unrelated.json',
    });
    assert.equal(api.statusCode, 200);
    assert.equal(api.headers['cache-control'], 'no-store');
    assert.deepEqual(readFileSync(file), bytes);
    assert.equal(statSync(file).mtimeMs, mtime);
    assert.deepEqual(
      (await app.inject({ method: 'GET', url: '/api/applications' })).json(),
      [],
    );
    assert.equal(
      (await app.inject({ method: 'POST', url: '/api/discover', payload: {} }))
        .statusCode,
      404,
    );
    writeFileSync(file, 'x'.repeat(10 * 1024 * 1024 + 1));
    assert.equal(
      (await app.inject({ method: 'GET', url: '/api/discover' })).json().status,
      'invalid',
    );
  } finally {
    await app.close();
    rmSync(root, { recursive: true, force: true });
  }
});
test('reader rejects an export directory redirected outside the configured sibling root', async () => {
  const root = mkdtempSync(join(tmpdir(), 'career-discover-link-'));
  const sibling = join(root, 'sibling');
  const outside = join(root, 'outside');
  mkdirSync(join(sibling, 'job-ops'), { recursive: true });
  mkdirSync(outside);
  writeFileSync(join(outside, 'review-queue.json'), JSON.stringify(envelope()));
  try {
    symlinkSync(
      outside,
      join(sibling, 'job-ops/exports'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    const config = readConfig({ JOB_ALERT_WORKFLOW_PATH: sibling }, root);
    await assert.rejects(
      () => readDiscover(config, now),
      /outside the configured sibling/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
