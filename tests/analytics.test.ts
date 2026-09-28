import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../server/app.js';
import { readConfig } from '../config/runtime.js';
import { calculateAnalytics } from '../server/analytics/service.js';
import type {
  AnalyticsApplication,
  AnalyticsEvent,
} from '../shared/analytics.js';
import type { ApplicationStage } from '../shared/tracker.js';

const now = new Date('2026-09-28T12:00:00Z');
function fixture(paths: ApplicationStage[][]) {
  const applications: AnalyticsApplication[] = [];
  const events: AnalyticsEvent[] = [];
  let id = 1;
  paths.forEach((path, index) => {
    const applicationId = 'job-' + index;
    applications.push({
      id: applicationId,
      title: 'Engineer',
      company: 'Company ' + index,
      stage: path[path.length - 1],
      fit_score: 50 + index * 5,
      applied_at: null,
      deleted_at: null,
    });
    path.forEach((stage, step) =>
      events.push({
        id: id++,
        application_id: applicationId,
        event_type: step === 0 ? 'CREATED' : 'STAGE_CHANGED',
        stage,
        event_at: new Date(Date.UTC(2026, 8, 1 + step)).toISOString(),
      }),
    );
  });
  return { applications, events };
}
test('the four requested paths preserve actual transitions and distinct-application conversions', () => {
  const data = fixture([
    ['APPLIED', 'REJECTED'],
    ['APPLIED', 'SCREENING', 'REJECTED'],
    ['APPLIED', 'INTERVIEW', 'REJECTED'],
    ['APPLIED', 'INTERVIEW', 'OFFERED'],
  ]);
  const report = calculateAnalytics(data.applications, data.events, now);
  assert.deepEqual(
    report.conversions.map((m) => [m.numerator, m.denominator, m.rate]),
    [
      [2, 4, 0.5],
      [1, 2, 0.5],
      [1, 4, 0.25],
    ],
  );
  assert.deepEqual(
    report.paths.map((p) => p.stages.join('>')).sort(),
    [
      'APPLIED>REJECTED',
      'APPLIED>SCREENING>REJECTED',
      'APPLIED>INTERVIEW>REJECTED',
      'APPLIED>INTERVIEW>OFFERED',
    ].sort(),
  );
  assert.equal(report.paths_count, 4);
  assert.equal(report.scatter.eligible, false);
});
test('reopening, out-of-order timestamps, duplicate visits, and metadata events do not inflate conversions', () => {
  const data = fixture([
    ['APPLIED', 'INTERVIEW', 'REJECTED', 'APPLIED', 'INTERVIEW', 'OFFERED'],
    ['INTERVIEW', 'APPLIED', 'OFFERED'],
    ['OFFERED'],
  ]);
  data.events[1].event_at = '2026-08-01T00:00:00Z'; // persisted event insertion order wins
  data.events.push({
    id: 99,
    application_id: 'job-2',
    event_type: 'ARTIFACT_ADDED',
    stage: 'APPLIED',
    event_at: now.toISOString(),
  });
  const report = calculateAnalytics(
    data.applications,
    [...data.events].reverse(),
    now,
  );
  assert.deepEqual(
    report.conversions.map((m) => [m.numerator, m.denominator]),
    [
      [1, 2],
      [2, 2],
      [2, 2],
    ],
  );
  assert.equal(report.without_applied_event, 1);
  assert.ok(
    report.paths.some(
      (p) =>
        p.stages.join('>') ===
        'APPLIED>INTERVIEW>REJECTED>APPLIED>INTERVIEW>OFFERED',
    ),
  );
  assert.equal(report.paths_count, 2);
});
test('archiving preserves historical cohorts and scores but excludes live waiting time', () => {
  const data = fixture([
    ['APPLIED', 'INTERVIEW', 'OFFERED'],
    ['APPLIED'],
    ['APPLIED', 'REJECTED'],
    ['SAVED'],
  ]);
  data.applications[0].deleted_at = now.toISOString();
  const report = calculateAnalytics(data.applications, data.events, now);
  assert.equal(report.total, 4);
  assert.equal(report.archived, 1);
  assert.deepEqual(
    report.conversions.map((m) => [m.numerator, m.denominator]),
    [
      [1, 3],
      [1, 1],
      [1, 3],
    ],
  );
  assert.deepEqual(
    report.waiting.map((a) => a.id),
    ['job-1', 'job-3'],
  );
  assert.equal(report.fit.length, 4);
});
test('waiting age uses the final real stage event and does not fabricate missing or future dates', () => {
  const data = fixture([
    ['APPLIED', 'SCREENING'],
    ['SAVED'],
    ['APPLIED'],
    ['APPLIED'],
  ]);
  data.events.push({
    id: 99,
    application_id: 'job-0',
    event_type: 'ARTIFACT_ADDED',
    stage: 'SCREENING',
    event_at: now.toISOString(),
  });
  data.events = data.events.filter((e) => e.application_id !== 'job-1');
  data.events.find((e) => e.application_id === 'job-2')!.event_at =
    '2027-01-01T00:00:00Z';
  data.applications[3].stage = 'INTERVIEW'; // no matching history; never infer its date
  const report = calculateAnalytics(data.applications, data.events, now);
  assert.equal(report.waiting.find((a) => a.id === 'job-0')!.days, 26);
  for (const id of ['job-1', 'job-2', 'job-3'])
    assert.equal(report.waiting.find((a) => a.id === id)!.days, null);
});
test('scatter eligibility requires five real scored histories and variation, preserving zero scores and rejections', () => {
  const data = fixture([
    ['SAVED'],
    ['APPLIED'],
    ['APPLIED', 'SCREENING'],
    ['APPLIED', 'INTERVIEW', 'REJECTED'],
    ['APPLIED', 'INTERVIEW', 'OFFERED'],
  ]);
  data.applications[0].fit_score = 0;
  const report = calculateAnalytics(data.applications, data.events, now);
  assert.equal(report.scatter.eligible, true);
  assert.equal(report.scatter.points.length, 5);
  assert.equal(
    report.scatter.points.find((p) => p.id === 'job-3')!.progression,
    4,
  );
  assert.equal(report.scatter.points.find((p) => p.id === 'job-0')!.score, 0);
  assert.equal(
    calculateAnalytics(
      data.applications.map((a) => ({ ...a, fit_score: 50 })),
      data.events,
      now,
    ).scatter.eligible,
    false,
  );
  assert.equal(
    calculateAnalytics(
      data.applications,
      data.events.map((e) => ({ ...e, stage: 'APPLIED' })),
      now,
    ).scatter.eligible,
    false,
  );
  data.applications[0].fit_score = null;
  assert.equal(
    calculateAnalytics(data.applications, data.events, now).scatter.eligible,
    false,
  );
});
test('volume uses one persisted applied date per application, UTC boundaries, and observed zero gaps', () => {
  const data = fixture([
    ['APPLIED', 'REJECTED', 'APPLIED'],
    ['APPLIED'],
    ['SAVED'],
    ['INTERVIEW'],
  ]);
  data.applications[0].applied_at = '2026-01-31T23:00:00-02:00'; // February 1 UTC
  data.applications[1].applied_at = '2026-04-01T00:00:00Z';
  data.applications[3].applied_at = '2026-02-02T00:00:00Z'; // known date, but no invented Applied event
  const report = calculateAnalytics(data.applications, data.events, now);
  assert.deepEqual(report.volume.monthly, [
    { start: '2026-02-01', count: 2 },
    { start: '2026-03-01', count: 0 },
    { start: '2026-04-01', count: 1 },
  ]);
  assert.equal(report.volume.weekly[0].start, '2026-01-26');
  assert.equal(report.volume.weekly[0].count, 1);
  assert.equal(report.volume.included, 3);
  assert.equal(report.volume.undated, 1);
  assert.equal(report.conversions[0].denominator, 2);
});
test('empty data uses null rates and useful missing-data indicators rather than fabricated zeros', () => {
  const report = calculateAnalytics([], [], now);
  assert.ok(
    report.conversions.every((m) => m.rate === null && m.denominator === 0),
  );
  assert.deepEqual(report.paths, []);
  assert.deepEqual(report.volume.weekly, []);
  assert.deepEqual(report.scatter.points, []);
  assert.equal(report.scatter.eligible, false);
});
test('analytics endpoint reads all persisted records and leaves database history unchanged', async () => {
  const root = mkdtempSync(join(tmpdir(), 'career-analytics-'));
  const app = buildApp(readConfig({ DATABASE_PATH: './test.db' }, root));
  try {
    for (let index = 0; index < 205; index++) {
      const result = await app.inject({
        method: 'POST',
        url: '/api/applications',
        payload: {
          source: 'other',
          company: 'Test ' + index,
          title: 'Engineer',
          stage: 'APPLIED',
        },
      });
      assert.equal(result.statusCode, 201);
    }
    const before = (
      await app.inject({ method: 'GET', url: '/api/applications?limit=1' })
    ).json()[0];
    const eventUrl = '/api/applications/' + before.id + '/events';
    const history = (await app.inject({ method: 'GET', url: eventUrl })).json();
    const response = await app.inject({ method: 'GET', url: '/api/analytics' });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().total, 205);
    assert.equal(response.json().conversions[0].denominator, 205);
    assert.equal(response.json().paths[0].count, 205);
    assert.deepEqual(
      (await app.inject({ method: 'GET', url: eventUrl })).json(),
      history,
    );
    assert.deepEqual(
      (
        await app.inject({
          method: 'GET',
          url: '/api/applications/' + before.id,
        })
      ).json(),
      before,
    );
    assert.equal(
      (await app.inject({ method: 'POST', url: '/api/analytics', payload: {} }))
        .statusCode,
      404,
    );
  } finally {
    await app.close();
    rmSync(root, { recursive: true, force: true });
  }
});
