import { test, expect } from '@playwright/test';

test('overview shortcuts preserve stage filters and browser back/forward context', async ({
  page,
  request,
}) => {
  const a = await (
    await request.post('/api/applications', {
      data: {
        source: 'other',
        title: 'Interview role',
        company: 'Workflow fixture',
        stage: 'INTERVIEW',
      },
    })
  ).json();
  try {
    await page.goto('/');
    await page
      .getByRole('link', { name: 'Upcoming interviews', exact: false })
      .click();
    await expect(page.getByLabel('Filter by stage')).toHaveValue('INTERVIEW');
    await expect(
      page.locator('.application-row').filter({ hasText: 'Workflow fixture' }),
    ).toBeVisible();
    await page.getByRole('button', { name: /^Closed/ }).click();
    await expect(page.getByLabel('Filter by stage')).toHaveValue('');
    await page.goBack();
    await expect(page.getByLabel('Filter by stage')).toHaveValue('INTERVIEW');
    await page.goForward();
    await expect(page.getByRole('button', { name: /^Closed/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.goto('/');
    await page.getByRole('link', { name: 'HIGH fit · last 30 days' }).click();
    await expect(page).toHaveURL(/fit=HIGH/);
    await expect(page).toHaveURL(/scope=Last/);
  } finally {
    await request.delete('/api/applications/' + a.id);
  }
});

test('Career Ops dashboard shows real run states, result links, pending tasks and application sections', async ({
  page,
  request,
}) => {
  const a = await (
    await request.post('/api/applications', {
      data: {
        source: 'other',
        title: 'Dashboard role',
        company: 'Dashboard fixture',
        jd_markdown: '# Complete JD',
      },
    })
  ).json();
  await page.route('**/api/workspace/career-ops', (route) =>
    route.fulfill({
      json: {
        applications: [
          {
            id: a.id,
            title: a.title,
            company: a.company,
            stage: 'SAVED',
            hasJd: true,
            analyzed: false,
          },
        ],
        runs: [
          {
            id: 'run-fixture',
            applicationId: a.id,
            action: 'analyze-fit',
            status: 'completed',
            startedAt: '2026-09-29T00:00:00Z',
            finishedAt: '2026-09-29T00:01:00Z',
            message: 'Saved',
            artifactPath: 'data/analysis.md',
          },
        ],
        artifacts: [
          {
            id: 'artifact-fixture',
            applicationId: a.id,
            type: 'ANALYSIS',
            path: 'data/analysis.md',
            createdAt: '2026-09-29T00:01:00Z',
          },
        ],
        warnings: [],
      },
    }),
  );
  try {
    await page.goto('/career-ops');
    await expect(
      page.getByRole('heading', { name: 'Pending analysis' }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Download result' }),
    ).toHaveAttribute(
      'href',
      `/api/applications/${a.id}/career-ops/runs/run-fixture/document`,
    );
    await page.getByRole('button', { name: 'Choose workflow' }).click();
    await expect(
      page.getByRole('button', { name: 'Analyze Fit', exact: true }),
    ).toBeEnabled();
    await page
      .getByRole('link', { name: 'Open application workspace' })
      .click();
    await expect(page.locator('#analysis')).toBeInViewport();
    await page.getByRole('link', { name: 'Notes', exact: true }).click();
    await expect(page.locator('#notes')).toBeInViewport();
    await page.setViewportSize({ width: 768, height: 1024 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: 'test-results/workspace-detail-tablet.png',
      fullPage: true,
    });
  } finally {
    await request.delete('/api/applications/' + a.id);
  }
});

test('Settings tests local integration health and narrow layouts keep content inside viewport', async ({
  page,
}) => {
  await page.route('**/api/workspace/integrations*', (route) => {
    const refreshed =
      new URL(route.request().url()).searchParams.get('refresh') === 'true';
    return route.fulfill({
      json: {
        checkedAt: '2026-09-29T00:00:00Z',
        database: { status: 'Connected', message: 'SQLite ready' },
        easyseek: {
          status: 'Not configured',
          message: 'Browser status cannot be detected.',
          endpoint: 'http://localhost:3001',
        },
        alerts: {
          status: refreshed ? 'Connected' : 'Unavailable',
          message: refreshed ? 'Export ready' : 'Export missing',
        },
      },
    });
  });
  await page.goto('/settings');
  await expect(page.getByText('Export missing', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Test local connections' }).click();
  await expect(page.getByText('Export ready', { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: 'test-results/workspace-settings-mobile.png',
    fullPage: true,
  });
});
