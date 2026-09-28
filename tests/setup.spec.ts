import { test, expect } from '@playwright/test';
test('clean first-run wizard verifies local storage, explains optional external setup, completes and resets without data loss', async ({
  page,
  request,
}) => {
  await request.post('/api/setup/reset', { data: {} });
  const application = await (
    await request.post('/api/applications', {
      data: {
        source: 'other',
        company: 'Setup retention fixture',
        title: 'Engineer',
      },
    })
  ).json();
  try {
    await page.goto('/');
    await page.getByRole('link', { name: 'Start setup' }).click();
    await expect(
      page.getByRole('heading', { name: 'Set up your workspace' }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Verify read/write permissions' })
      .click();
    await expect(
      page.getByText(
        'SQLite initialized; database and data directory are readable and writable.',
      ),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Confirm directory & continue' })
      .click();
    await expect(
      page.getByText('chrome://extensions', { exact: true }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Test workspace connection' })
      .click();
    await expect(
      page.getByText(/Workspace API and SQLite responded/),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByRole('button', { name: 'Run daily workflow now' }).click();
    await expect(
      page.getByRole('heading', {
        name: 'Continue in the Gmail-connected session',
      }),
    ).toBeVisible();
    await expect(
      page.getByText('Run daily job alert workflow.', { exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.route('**/api/setup/career-ops/test', (r) =>
      r.fulfill({
        json: {
          status: 'Needs setup',
          checkedAt: new Date().toISOString(),
          missing: ['cv.md'],
          warningCount: 1,
          templateCount: 0,
          message: 'Complete onboarding in career-ops.',
        },
      }),
    );
    await page
      .getByRole('button', { name: 'Test Career Ops', exact: true })
      .click();
    await expect(
      page.getByText('Doctor: Needs setup', { exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page
      .getByRole('button', { name: 'Rerun checks', exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: 'Mark setup complete' }),
    ).toBeEnabled();
    await page.screenshot({
      path: 'test-results/setup-final.png',
      fullPage: true,
    });
    await page.getByRole('button', { name: 'Mark setup complete' }).click();
    await expect(page).toHaveURL('/');
    await expect(page.getByRole('link', { name: 'Start setup' })).toHaveCount(
      0,
    );
    await page.goto('/settings');
    await page.getByRole('button', { name: 'Reset setup state only' }).click();
    await expect(page.getByText(/Setup state reset/)).toBeVisible();
    expect(
      (await request.get('/api/applications/' + application.id)).status(),
    ).toBe(200);
  } finally {
    await request.delete('/api/applications/' + application.id);
  }
});

test('settings persist edited paths without applying them silently and setup remains responsive', async ({
  page,
  request,
}) => {
  const state = await (await request.get('/api/setup/state')).json();
  try {
    await page.goto('/setup?step=2');
    const input = page.getByLabel('EasySeek repository path');
    await input.fill('../missing-EasySeek-fixture');
    await page
      .getByRole('button', { name: 'Save configuration', exact: true })
      .click();
    await expect(
      page.getByText(/Saved settings are waiting for a restart/),
    ).toBeVisible();
    await page.reload();
    await expect(input).toHaveValue('../missing-EasySeek-fixture');
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: 'test-results/setup-mobile.png',
      fullPage: true,
    });
    await page.goto('/setup?step=5');
    await page
      .getByRole('button', { name: 'Rerun checks', exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: 'Mark setup complete' }),
    ).toBeDisabled();
  } finally {
    await request.post('/api/setup/settings', { data: state.values });
    await request.post('/api/setup/reset', { data: {} });
  }
});
