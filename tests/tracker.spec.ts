import { test, expect, type APIRequestContext } from '@playwright/test';
import { applicationStages } from '../shared/tracker.js';

const ids: string[] = [];
async function create(
  request: APIRequestContext,
  value: Record<string, unknown>,
) {
  const result = await request.post('/api/applications', {
    data: {
      source: 'seek',
      title: 'Platform Engineer',
      company: 'Demo Studio',
      ...value,
    },
  });
  expect(result.status()).toBe(201);
  const row = await result.json();
  ids.push(row.id);
  return row;
}
test.beforeAll(async ({ request }) => {
  for (const [index, stage] of applicationStages.entries()) {
    const row = await create(request, {
      company: [
        'Northstar',
        'Fern Labs',
        'Harbour',
        'Juniper',
        'Orbit',
        'Atlas',
        'Acorn',
        'Willow',
      ][index],
      stage,
      fit_score: index === 0 ? 0 : 95 - index * 5,
      fit_level: 'Strong',
      location: 'Auckland',
      url: 'https://example.com/job',
      jd_markdown:
        '# Platform Engineer\n\nBuild reliable systems.\n<script>alert("unsafe")</script>',
      analysis_summary: 'Strong platform experience. Review the team scope.',
      next_action: index < 4 ? 'Follow up with recruiter' : null,
      next_action_at: index < 4 ? '2026-10-02T00:00:00Z' : null,
    });
    if (index === 0)
      await request.post('/api/applications/' + row.id + '/artifacts', {
        data: { type: 'CV', path: 'documents/northstar-cv.pdf' },
      });
  }
});
test.afterAll(async ({ request }) => {
  for (const id of ids) await request.delete('/api/applications/' + id);
});
test('overview reflects all stages, rankings, and real counts', async ({
  page,
}) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Overview', exact: true }),
  ).toBeVisible();
  const kpis = page.locator('.kpi');
  await expect(kpis.nth(0).locator('strong')).toHaveText('8');
  await expect(kpis.nth(1).locator('strong')).toHaveText('6');
  await expect(kpis.nth(2).locator('strong')).toHaveText('2');
  await expect(kpis.nth(3).locator('strong')).toHaveText('1');
  await expect(kpis.nth(4).locator('strong')).toHaveText('1');
  await expect(kpis.nth(5).locator('strong')).toHaveText('1');
  await expect(
    page.getByRole('img', { name: /Application status:/ }),
  ).toBeVisible();
  await expect(page.locator('.ranking-row')).toHaveCount(3);
  await expect(page.locator('.ranking-row').first()).toContainText('Fern Labs');
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.screenshot({
    path: 'test-results/tracker-overview.png',
    fullPage: true,
  });
});
test('list filters, search, quick stage update, and timeline survive reload', async ({
  page,
  request,
}) => {
  await page.goto('/applications');
  await expect(page.locator('.application-row')).toHaveCount(6);
  await page.getByRole('button', { name: /^Waiting/ }).click();
  await expect(page.locator('.application-row')).toHaveCount(2);
  await page.getByRole('button', { name: /^Closed/ }).click();
  await expect(page.locator('.application-row')).toHaveCount(2);
  await page.getByRole('button', { name: /^All/ }).click();
  await expect(page.locator('.application-row')).toHaveCount(8);
  await page
    .getByRole('searchbox', { name: 'Search applications' })
    .fill('Northstar');
  await expect(page.locator('.application-row')).toHaveCount(1);
  await page.getByLabel('Stage for Northstar').selectOption('INTERVIEW');
  await expect(page.locator('.application-row .stage-badge')).toHaveText(
    'Interview',
  );
  await page.getByRole('link', { name: 'View details →' }).click();
  await expect(
    page.getByRole('heading', { name: 'Platform Engineer', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.timeline')).toContainText('Moved to Interview');
  await expect(page.locator('.document-text').first()).toContainText(
    '<script>',
  );
  await expect(page.locator('.artifact-list')).toContainText(
    'documents/northstar-cv.pdf',
  );
  await page.reload();
  await expect(page.getByLabel('Stage for Northstar')).toHaveValue('INTERVIEW');
  const events = await (
    await request.get('/api/applications/' + ids[0] + '/events')
  ).json();
  expect(
    events.filter(
      (event: { event_type: string }) => event.event_type === 'STAGE_CHANGED',
    ),
  ).toHaveLength(1);
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.screenshot({
    path: 'test-results/tracker-detail.png',
    fullPage: true,
  });
});
test('detail edits persist and update summary immediately; stage failure leaves original value', async ({
  page,
  request,
}) => {
  await page.goto('/applications/' + ids[0]);
  await page
    .getByLabel('Notes', { exact: true })
    .fill('Prepare examples for the hiring manager.');
  await page.getByLabel('Next action', { exact: true }).fill('Send portfolio');
  await page.getByLabel('Due date and time (local)').fill('2026-10-05T10:00');
  await page.getByRole('button', { name: 'Save notes & action' }).click();
  await expect(page.getByRole('status')).toContainText([
    'API & database connected',
    'Notes saved.',
  ]);
  await expect(page.locator('.detail-facts')).toContainText('Send portfolio');
  await page.reload();
  await expect(page.getByLabel('Notes', { exact: true })).toHaveValue(
    'Prepare examples for the hiring manager.',
  );
  await page.route('**/api/applications/*/stage', (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Stage save failed' }),
    }),
  );
  await page.getByLabel('Stage for Northstar').selectOption('OFFERED');
  await expect(page.getByRole('alert')).toContainText('Stage save failed');
  await expect(page.getByLabel('Stage for Northstar')).toHaveValue('INTERVIEW');
  const row = await (await request.get('/api/applications/' + ids[0])).json();
  expect(row.stage).toBe('INTERVIEW');
});
test('create through the UI, move through every stage, retain history and check mobile', async ({
  page,
  request,
}) => {
  await page.goto('/applications?add=true');
  await page.getByLabel('Company', { exact: true }).fill('Kauri Systems');
  await page.getByLabel('Job title').fill('Backend Engineer');
  await page
    .getByRole('button', { name: 'Save application', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Backend Engineer', exact: true }),
  ).toBeVisible();
  const id = page.url().split('/').pop()!;
  ids.push(id);
  for (const stage of applicationStages.slice(1)) {
    await page.getByLabel('Stage for Kauri Systems').selectOption(stage);
    await expect(page.getByLabel('Stage for Kauri Systems')).toHaveValue(stage);
    await expect(page.locator('.timeline li')).toHaveCount(
      applicationStages.indexOf(stage) + 1,
    );
  }
  await page.reload();
  await expect(page.getByLabel('Stage for Kauri Systems')).toHaveValue(
    'WITHDRAWN',
  );
  const events = await (
    await request.get('/api/applications/' + id + '/events')
  ).json();
  expect(events.map((event: { stage: string }) => event.stage)).toEqual([
    ...applicationStages,
  ]);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: 'test-results/tracker-mobile-detail.png',
    fullPage: true,
  });
  await page.goto('/applications?filter=All');
  await expect(page.locator('.application-row')).toHaveCount(9);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: 'test-results/tracker-mobile-list.png',
    fullPage: true,
  });
});
test('empty search, missing detail, and dashboard request recovery are explicit', async ({
  page,
}) => {
  await page.goto('/applications');
  await page
    .getByRole('searchbox', { name: 'Search applications' })
    .fill('not-present');
  await expect(
    page.getByRole('heading', { name: 'No matching applications' }),
  ).toBeVisible();
  await page.goto('/applications/00000000-0000-4000-8000-000000000000');
  await expect(page.getByRole('alert')).toContainText('Application not found');
  await page.route('**/api/applications?*', (route) => route.abort());
  await page.goto('/');
  await expect(page.getByRole('alert')).toBeVisible();
  await page.unroute('**/api/applications?*');
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(
    page.getByRole('heading', { name: 'Overview', exact: true }),
  ).toBeVisible();
});
test('dashboard reads beyond the first API page', async ({ page }) => {
  const row = await (
    await page.request.get('/api/applications/' + ids[0])
  ).json();
  await page.route('**/api/applications?*', (route) => {
    const offset = new URL(route.request().url()).searchParams.get('offset');
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(
        offset === '0'
          ? Array.from({ length: 200 }, (_, i) => ({ ...row, id: 'page-' + i }))
          : offset === '200'
            ? [{ ...row, id: 'last-page' }]
            : [],
      ),
    });
  });
  await page.goto('/');
  await expect(page.locator('.kpi').first().locator('strong')).toHaveText(
    '201',
  );
});
