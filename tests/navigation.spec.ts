import { test, expect } from '@playwright/test';

test('navigation, API connection, setup, detail deep link, and missing page', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
  await expect(page.getByText('API & database connected')).toBeVisible();
  for (const title of [
    'Discover',
    'Applications',
    'Analytics',
    'Career Ops',
    'Settings',
  ]) {
    await page
      .getByRole('navigation')
      .getByRole('link', { name: title, exact: false })
      .click();
    await expect(
      page.getByRole('heading', { name: title, exact: true }),
    ).toBeVisible();
  }
  await expect(
    page.getByRole('heading', { name: 'Setup & local configuration' }),
  ).toBeVisible();
  await expect(page.getByLabel('EasySeek repository path')).toBeVisible();
  await expect(page.getByLabel('SQLite database path')).toBeVisible();
  await page.goto('/applications/example');
  await expect(
    page.getByRole('heading', { name: 'Application detail' }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Application detail' }),
  ).toBeVisible();
  await page.goto('/missing');
  await expect(
    page.getByRole('link', { name: 'Back to overview' }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test('mobile layout keeps navigation and content within the viewport', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole('navigation')
    .getByRole('link', { name: 'Settings' })
    .click();
  await expect(page.getByLabel('EasySeek repository path')).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test('API outage is visible and retry recovers', async ({ page }) => {
  await page.route('**/api/**', (route) => route.abort());
  await page.goto('/settings');
  await expect(page.getByText('API unavailable')).toBeVisible();
  await expect(page.getByRole('alert')).toContainText(
    'Cannot load local settings',
  );
  await page.unroute('**/api/**');
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.getByLabel('EasySeek repository path')).toBeVisible();
  await expect(page.getByText('API & database connected')).toBeVisible();
});

test('desktop overview screenshot', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await expect(page.getByText('API & database connected')).toBeVisible();
  await page.screenshot({ path: 'test-results/overview.png', fullPage: true });
});
