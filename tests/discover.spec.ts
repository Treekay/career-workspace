import { test, expect } from '@playwright/test';
import type { DiscoverData } from '../shared/discover.js';
const fixture: DiscoverData = {
  status: 'ready',
  timezone: 'Pacific/Auckland',
  today: '2026-09-29',
  last_run_date: '2026-09-29',
  last_run_at: null,
  export_modified_at: '2026-09-28T12:30:00Z',
  data_updated_at: '2026-09-28T12:00:00Z',
  stale_after_hours: 36,
  current_job_count: 4,
  today_new_count: 2,
  warnings: [],
  jobs: [
    {
      canonical_key: 'a',
      title: 'Backend Engineer',
      company: 'Zulu',
      location: 'Auckland',
      source: 'SEEK',
      fit: 'MEDIUM',
      reason: 'Distributed queues and APIs',
      first_seen_at: '2026-09-28T11:30:00Z',
      last_seen_at: '2026-09-28T11:30:00Z',
      url: 'https://www.seek.co.nz/job/123',
    },
    {
      canonical_key: 'b',
      title: 'Platform Developer',
      company: 'Alpha',
      location: 'Wellington',
      source: 'LINKEDIN',
      fit: 'HIGH',
      reason: 'Platform ownership',
      first_seen_at: '2026-09-27T00:00:00Z',
      last_seen_at: '2026-09-28T10:00:00Z',
      url: 'https://www.linkedin.com/jobs/view/123',
    },
    {
      canonical_key: 'c',
      title: 'Operations Engineer',
      company: 'Beta',
      location: 'Remote',
      source: 'SEEK',
      fit: 'LOW',
      reason: 'Review support load',
      first_seen_at: '2026-09-28T12:00:00Z',
      last_seen_at: '2026-09-28T12:00:00Z',
      url: null,
    },
    {
      canonical_key: 'd',
      title: 'Lead Engineer',
      company: 'Gamma',
      location: 'Hamilton',
      source: 'LINKEDIN',
      fit: 'SKIP',
      reason: 'Outside preferred seniority',
      first_seen_at: '2026-09-20T00:00:00Z',
      last_seen_at: '2026-09-27T00:00:00Z',
      url: 'https://linkedin.com/jobs/view/456',
    },
  ],
};
test('Discover scopes, fits, sources, search fields, sorting and safe new-tab links', async ({
  page,
  context,
}) => {
  await page.route('**/api/discover', (route) =>
    route.fulfill({ json: fixture }),
  );
  await page.goto('/discover');
  await expect(page.locator('.discover-card')).toHaveCount(2);
  await expect(
    page.locator('.discover-kpis').getByText('4', { exact: true }),
  ).toBeVisible();
  await expect(
    page.locator('.discover-kpis').getByText('2', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Last 30 Days', exact: true }).click();
  await expect(page.locator('.discover-card')).toHaveCount(4);
  await expect(page.locator('.discover-card h2').first()).toHaveText(
    'Backend Engineer',
  );
  await page.getByLabel('Sort', { exact: true }).selectOption('Fit');
  await expect(page.locator('.discover-card h2').first()).toHaveText(
    'Platform Developer',
  );
  await page.getByLabel('Sort', { exact: true }).selectOption('Newest');
  await expect(page.locator('.discover-card h2').first()).toHaveText(
    'Operations Engineer',
  );
  await page.getByLabel('Sort', { exact: true }).selectOption('Company');
  await expect(page.locator('.discover-card .discover-company')).toHaveText([
    'Alpha',
    'Beta',
    'Gamma',
    'Zulu',
  ]);
  for (const fit of ['HIGH', 'MEDIUM', 'LOW', 'SKIP']) {
    await page.getByLabel('Fit', { exact: true }).selectOption(fit);
    await expect(page.locator('.discover-card')).toHaveCount(1);
  }
  await page.getByLabel('Fit', { exact: true }).selectOption('All');
  await page.getByLabel('Source', { exact: true }).selectOption('LINKEDIN');
  await expect(page.locator('.discover-card')).toHaveCount(2);
  await page.getByLabel('Source', { exact: true }).selectOption('All');
  for (const term of ['backend', 'Zulu', 'Auckland', 'queues']) {
    await page
      .getByRole('searchbox', { name: 'Search', exact: true })
      .fill(term);
    await expect(page.locator('.discover-card')).toHaveCount(1);
  }
  const link = page.getByRole('link', { name: 'Open on SEEK ↗', exact: true });
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  await context.route('https://www.seek.co.nz/job/123', (route) =>
    route.fulfill({ body: 'Test source destination' }),
  );
  const opened = context.waitForEvent('page');
  await link.click();
  const tab = await opened;
  await tab.waitForLoadState();
  expect(tab.url()).toBe('https://www.seek.co.nz/job/123');
  expect(await tab.evaluate(() => window.opener)).toBeNull();
  await tab.close();
  await page.getByRole('searchbox', { name: 'Search', exact: true }).fill('');
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.screenshot({
    path: 'test-results/discover-desktop.png',
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: 'test-results/discover-mobile.png',
    fullPage: true,
  });
  await expect(
    page.getByRole('button', { name: /Save application|Apply|Mark/ }),
  ).toHaveCount(0);
});
test('missing and stale exports have actionable states; export text cannot execute markup', async ({
  page,
}) => {
  await page.route('**/api/discover', (route) =>
    route.fulfill({
      status: 503,
      json: {
        status: 'missing',
        error: 'Review queue export not found.',
        hint: 'Generate the export in job-alert-workflow.',
      },
    }),
  );
  await page.goto('/discover');
  await expect(page.getByRole('alert')).toContainText(
    'Review queue export not found',
  );
  await page.unroute('**/api/discover');
  await page.route('**/api/discover', (route) =>
    route.fulfill({
      json: {
        ...fixture,
        status: 'stale',
        jobs: [{ ...fixture.jobs[0], title: '<img src=x onerror=alert(1)>' }],
      },
    }),
  );
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('alert')).toContainText('review queue is stale');
  await expect(page.locator('.discover-card h2')).toHaveText(
    '<img src=x onerror=alert(1)>',
  );
  await expect(page.locator('.discover-card img')).toHaveCount(0);
  await page
    .getByRole('searchbox', { name: 'Search', exact: true })
    .fill('not-present');
  await expect(
    page.getByRole('heading', { name: 'No matching jobs' }),
  ).toBeVisible();
});
