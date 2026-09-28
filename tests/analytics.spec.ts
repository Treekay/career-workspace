import { test, expect } from '@playwright/test';
const ids: string[] = [];
test('empty analytics shows unknown rates and real empty states', async ({
  page,
}) => {
  await page.goto('/analytics');
  await expect(
    page.getByRole('heading', { name: 'Analytics', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.conversion-card strong')).toHaveText([
    '—',
    '—',
    '—',
  ]);
  await expect(
    page.getByRole('heading', { name: 'Not enough comparable outcomes yet' }),
  ).toBeVisible();
  await expect(
    page.getByText('No fit scores recorded yet.', { exact: false }),
  ).toBeVisible();
});
test('real event paths drive metrics, charts, archive retention, and responsive layout', async ({
  page,
  request,
}) => {
  const paths = [
    ['APPLIED', 'REJECTED'],
    ['APPLIED', 'SCREENING', 'REJECTED'],
    ['APPLIED', 'INTERVIEW', 'REJECTED'],
    ['APPLIED', 'INTERVIEW', 'OFFERED'],
    ['SAVED'],
  ];
  for (const [index, path] of paths.entries()) {
    const result = await request.post('/api/applications', {
      data: {
        source: 'other',
        title: 'Engineer',
        company: 'Analytics sample ' + index,
        stage: path[0],
        fit_score: index === 4 ? 0 : 60 + index * 10,
        applied_at: index < 4 ? '2026-09-01T00:00:00Z' : null,
      },
    });
    expect(result.status()).toBe(201);
    const row = await result.json();
    ids.push(row.id);
    for (const stage of path.slice(1))
      expect(
        (
          await request.post('/api/applications/' + row.id + '/stage', {
            data: { stage },
          })
        ).ok(),
      ).toBeTruthy();
  }
  await request.delete('/api/applications/' + ids[0]);
  await page.goto('/analytics');
  await expect(page.locator('.conversion-card strong')).toHaveText([
    '50%',
    '50%',
    '25%',
  ]);
  await expect(page.locator('.path-flow')).toHaveCount(4);
  await expect(
    page.getByRole('img', {
      name: 'Application journey Sankey: ribbon widths represent recorded application counts',
    }),
  ).toBeVisible();
  await expect(
    page.getByLabel('Recorded path: Applied → Rejected', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel('Recorded path: Applied → Screening → Rejected', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByLabel('Recorded path: Applied → Interview → Rejected', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByLabel('Recorded path: Applied → Interview → Offered', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole('img', {
      name: 'Fit score versus furthest recorded progression',
    }),
  ).toBeVisible();
  await expect(
    page.getByText('All 5 tracked records, including 1 archived.', {
      exact: false,
    }),
  ).toBeVisible();
  await page.getByLabel('Waiting only').check();
  await expect(
    page.getByText('No waiting applications to measure.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Monthly', exact: true }).click();
  await expect(page.locator('.volume-count')).toHaveText(['4']);
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.screenshot({
    path: 'test-results/analytics-desktop.png',
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: 'test-results/analytics-mobile.png',
    fullPage: true,
  });
});
test('analytics error recovery does not display invented metrics', async ({
  page,
}) => {
  await page.route('**/api/analytics', (route) => route.abort());
  await page.goto('/analytics');
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.locator('.conversion-card')).toHaveCount(0);
  await page.unroute('**/api/analytics');
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.locator('.conversion-card')).toHaveCount(3);
});
test.afterAll(async ({ request }) => {
  for (const id of ids) await request.delete('/api/applications/' + id);
});
