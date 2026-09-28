import { test, expect } from '@playwright/test';

test('localhost cross-origin import preflight, repeat handoff, and timeline work in a browser', async ({
  page,
  request,
}) => {
  await page.goto('/');
  const payload = {
    source: 'seek',
    sourceJobId: '987654321',
    title: 'Browser handoff test',
    company: 'Import fixture',
    jdMarkdown: '# Original snapshot',
    mark: 'SAVED',
    requestedStage: 'SAVED',
  };
  const send = (body: typeof payload) =>
    page.evaluate(async (value) => {
      const response = await fetch(
        'http://127.0.0.1:43001/api/applications/import',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(value),
        },
      );
      return { status: response.status, data: await response.json() };
    }, body);
  const first = await send(payload);
  expect(first.status).toBe(201);
  const id = first.data.application.id;
  try {
    expect((await send(payload)).data.outcome).toBe('unchanged');
    const updated = await send({
      ...payload,
      requestedStage: 'APPLIED',
      jdMarkdown: '# Updated snapshot',
    });
    expect(updated.data.application.stage).toBe('APPLIED');
    expect(
      (
        await send({
          ...payload,
          requestedStage: 'APPLIED',
          jdMarkdown: '# Updated snapshot',
        })
      ).data.outcome,
    ).toBe('unchanged');
    await page.goto('/applications/' + id);
    await expect(
      page.getByRole('heading', { name: payload.title }),
    ).toBeVisible();
    await expect(
      page.getByText('# Updated snapshot', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText('Browser import', { exact: true }).first(),
    ).toBeVisible();
    await expect(
      page.getByText('Moved to Applied', { exact: true }),
    ).toHaveCount(1);
    await page.reload();
    await expect(
      page.getByText('Moved to Applied', { exact: true }),
    ).toHaveCount(1);
  } finally {
    await request.delete('/api/applications/' + id);
  }
});
