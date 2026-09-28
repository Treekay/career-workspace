import { test, expect } from '@playwright/test';
import { careerActions, careerLabels } from '../shared/career-ops.js';

test('Career Ops and Settings show provider configuration, connection failures and retesting', async ({
  page,
}) => {
  let settingsWrites = 0;
  page.on('request', (request) => {
    if (
      request.url().endsWith('/api/setup/settings') &&
      request.method() === 'POST'
    )
      settingsWrites++;
  });
  const base = {
    configuredPath: '../career-ops',
    path: 'F:/code/career-ops',
    dataPath: 'F:/code/career-ops',
    cliPath: null,
  };
  await page.route('**/api/career-ops/connection', (route) =>
    route.fulfill({
      json: {
        ...base,
        status: 'Missing',
        message: 'Career Ops directory is missing.',
      },
    }),
  );
  await page.route('**/api/career-ops/test', (route) =>
    route.fulfill({
      json: { ...base, status: 'Connected', message: 'Local CLI available.' },
    }),
  );
  await page.goto('/career-ops');
  await expect(
    page.getByRole('heading', { name: 'Career Ops', exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/Career Ops is unavailable/)).toBeVisible();
  await page.goto('/settings');
  await expect(
    page.getByText('Unavailable', { exact: true }).last(),
  ).toBeVisible();
  await expect(page.getByLabel('Career Ops repository path')).toHaveValue(
    '../career-ops',
  );
  await page.getByRole('button', { name: 'Test connection' }).click();
  await expect(
    page.getByText('Connected', { exact: true }).last(),
  ).toBeVisible();
  await page.goto('/settings');
  await expect(
    page.getByRole('button', { name: 'Test connection' }),
  ).toBeVisible();
  await page.unroute('**/api/career-ops/test');
  await page.route('**/api/career-ops/test', (route) =>
    route.fulfill({
      json: {
        ...base,
        status: 'Invalid',
        message: 'Codex is not signed in. Run codex login locally.',
      },
    }),
  );
  await page.getByRole('button', { name: 'Test connection' }).click();
  await expect(page.getByText('Error', { exact: true }).last()).toBeVisible();
  await expect(page.getByText(/Codex is not signed in/)).toBeVisible();
  expect(settingsWrites).toBe(0);
});
test('detail actions handle unavailable providers, running/completed drafts, and missing JDs', async ({
  page,
  request,
}) => {
  const app = (
    await request.post('/api/applications', {
      data: {
        source: 'other',
        title: 'Provider UI fixture',
        company: 'Example',
        jd_markdown: '# Full JD',
      },
    })
  ).json();
  const application = await app;
  const base = '/api/applications/' + application.id + '/career-ops/runs';
  let runs: object[] = [];
  let action: string | null = null;
  let reads = 0;
  await page.route('**' + base, async (route) => {
    if (route.request().method() === 'POST') {
      action = route.request().postDataJSON().action;
      if (action === 'tailor-cv')
        return route.fulfill({
          status: 503,
          json: { error: 'Career Ops is not configured. Check Settings.' },
        });
      const run = {
        id: '11111111-1111-4111-8111-111111111111',
        applicationId: application.id,
        action,
        status: 'running',
        startedAt: '2026-09-29T01:00:00Z',
        finishedAt: null,
        message: 'Running existing workflow.',
        artifactPath: null,
      };
      runs = [run];
      reads = 0;
      return route.fulfill({ status: 202, json: run });
    }
    if (runs.length && ++reads > 1)
      runs = [
        {
          ...runs[0],
          status: 'completed',
          message: 'Draft saved as a new artifact.',
          artifactPath: 'data/applications/fixture/result.md',
        },
      ];
    return route.fulfill({ json: runs });
  });
  try {
    await page.goto('/applications/' + application.id);
    for (const key of careerActions)
      await expect(
        page.getByRole('button', { name: careerLabels[key], exact: true }),
      ).toBeEnabled();
    await page.getByRole('button', { name: 'Tailor CV', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText(
      'Career Ops is not configured',
    );
    await page
      .getByRole('button', { name: 'Analyze Fit', exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: 'Analyze Fit', exact: true }),
    ).toBeDisabled();
    await expect(page.getByText('Analyze Fit · completed')).toBeVisible({
      timeout: 10000,
    });
    expect(action).toBe('analyze-fit');
    await expect(
      page.getByRole('link', { name: 'Download draft' }),
    ).toHaveAttribute(
      'href',
      base + '/11111111-1111-4111-8111-111111111111/document',
    );
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.screenshot({
      path: 'test-results/career-ops-detail.png',
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await request.patch('/api/applications/' + application.id, {
      data: { jd_markdown: null },
    });
    await page.reload();
    await expect(
      page.getByRole('button', { name: 'Analyze Fit', exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByText(/A full JD snapshot is required/),
    ).toBeVisible();
  } finally {
    await request.delete('/api/applications/' + application.id);
  }
});
