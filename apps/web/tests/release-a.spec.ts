import { expect, test, type Page, type Route } from '@playwright/test';

type AnalyticsCapture = {
  queries: any[];
  saved: any[];
};

async function mockAPI(page: Page, analytics?: AnalyticsCapture) {
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (analytics && path.startsWith('/api/analytics/')) return fulfillAnalytics(route, path, analytics);
    const body = path.endsWith('/auth/refresh') ? { accessToken: 'test', user: { id: 'u1', email: 'qa@example.com', role: 'owner', tenant_id: 't1' } }
      : path.endsWith('/auth/me') ? { user: { id: 'u1', email: 'qa@example.com', role: 'owner', tenant_id: 't1' } }
      : path.includes('/executions') ? { items: [{ id: 'r1', name: 'Release A run', pipeline_id: 'p1', environment: 'test', phase: 'completed', started_at: '2026-07-05T00:00:00Z', finished_at: '2026-07-05T00:00:01Z' }] }
      : path.includes('/pipelines') ? []
      : path.includes('/dashboards') ? []
      : path.includes('/analytics/datasets') ? []
      : path.endsWith('/edition') ? { features: { realtime: true, advancedConnectors: true }, availability: { realtime: true, advancedConnectors: true } }
      : path.includes('/connectors/catalog') ? { catalog: [] }
      : {};
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
}

async function fulfillAnalytics(route: Route, path: string, capture: AnalyticsCapture) {
  const request = route.request();
  const method = request.method();
  const json = (body: unknown, status = 200) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  if (path === '/api/analytics/datasets') {
    return json([{ collection: 'orders', row_count: 120 }, { collection: 'payments', row_count: 12 }]);
  }
  if (path === '/api/analytics/datasets/orders/schema') {
    return json({ schema: [
      { name: 'created_at', type: 'date' },
      { name: 'status', type: 'string' },
      { name: 'amount', type: 'number' },
      { name: 'paid', type: 'boolean' },
    ] });
  }
  if (path === '/api/analytics/datasets/payments/schema') {
    return json({ schema: [] }, 500);
  }
  if (path === '/api/analytics/datasets/orders/rows') {
    return json({ total: 120, limit: 50, offset: 0, rows: [
      { created_at: '2026-07-10T09:00:00Z', status: 'paid', amount: 120.5, paid: true },
      { created_at: '2026-07-10T10:00:00Z', status: 'refund', amount: 15, paid: false },
    ] });
  }
  if (path === '/api/analytics/datasets/payments/rows') {
    return json({ total: 12, limit: 50, offset: 0, rows: [
      { created_at: '2026-07-10T11:00:00Z', status: 'settled', amount: 12, paid: true },
    ] });
  }
  if (path === '/api/analytics/query') {
    const body = request.postDataJSON();
    capture.queries.push(body);
    if (body.bucket) return json({ count: 2, rows: [
      { time_bucket: '2026-07-10T09:00:00Z', aggregate_value: 120.5 },
      { time_bucket: '2026-07-10T10:00:00Z', aggregate_value: 180.75 },
    ] });
    if (body.aggregate && !body.groupBy) return json({ count: 1, rows: [{ aggregate_value: 301.25 }] });
    if (body.groupBy) return json({ count: 2, rows: [
      { status: 'paid', aggregate_value: 3 },
      { status: 'refund', aggregate_value: 1 },
    ] });
    return json({ count: 2, rows: [
      { status: 'paid', amount: 120.5 },
      { status: 'refund', amount: 15 },
    ] });
  }
  if (path === '/api/analytics/dashboards' && method === 'GET') {
    return json([{ id: 'dash1', name: 'Revenue Ops', definition: {
      timeRangeHours: 24,
      widgets: [
        { id: 'bar', title: 'Bar Revenue', dataset: 'orders', type: 'bar', layout: { x: 0, y: 0, w: 4, h: 3 }, spec: { groupBy: ['status'], aggregate: { field: 'amount', fn: 'sum' } } },
        { id: 'line', title: 'Line Revenue', dataset: 'orders', type: 'line', layout: { x: 4, y: 0, w: 4, h: 3 }, spec: { bucket: 'hour', aggregate: { field: 'amount', fn: 'sum' } } },
        { id: 'area', title: 'Area Revenue', dataset: 'orders', type: 'area', layout: { x: 8, y: 0, w: 4, h: 3 }, spec: { bucket: 'day', aggregate: { field: 'amount', fn: 'avg' } } },
        { id: 'pie', title: 'Pie Status', dataset: 'orders', type: 'pie', layout: { x: 0, y: 3, w: 4, h: 3 }, spec: { groupBy: ['status'], aggregate: { field: 'amount', fn: 'count' } } },
        { id: 'stat', title: 'Stat Revenue', dataset: 'orders', type: 'stat', layout: { x: 4, y: 3, w: 4, h: 3 }, spec: { aggregate: { field: 'amount', fn: 'sum' } } },
        { id: 'table', title: 'Table Orders', dataset: 'orders', type: 'table', layout: { x: 8, y: 3, w: 4, h: 3 }, spec: { select: ['status', 'amount'] } },
      ],
    } }]);
  }
  if (path === '/api/analytics/dashboards' && method === 'POST') {
    const body = request.postDataJSON();
    capture.saved.push(body);
    return json({ id: 'dash2', name: body.name, definition: body.definition }, 201);
  }
  if (path === '/api/analytics/dashboards/dash1' && method === 'PUT') {
    const body = request.postDataJSON();
    capture.saved.push(body);
    return json({ id: 'dash1', name: body.name ?? 'Revenue Ops', definition: body.definition });
  }
  if (/^\/api\/analytics\/dashboards\/[^/]+\/shares$/.test(path)) {
    return json([{ share_token_hash: 'share_hash_12345678', created_at: '2026-07-10T00:00:00Z', expires_at: '2026-07-11T00:00:00Z' }]);
  }
  if (/^\/api\/analytics\/dashboards\/[^/]+\/share$/.test(path)) {
    return json({ shareToken: 'token', shareUrl: '/share/analytics/token', expiresAt: '2026-07-11T00:00:00Z' });
  }
  return json({});
}

test('AI redirect opens proposal drawer without standalone navigation', async ({ page }) => {
  await mockAPI(page);
  await page.goto('/ai-builder');
  await expect(page).toHaveURL(/\/?\?ai=1$/);
  await expect(page.getByText('Build with AI')).toBeVisible();
  await expect(page.getByRole('link', { name: /AI Builder/i })).toHaveCount(0);
});

test('Runs presets persist in URL and themes render Analytics', async ({ page }) => {
  await mockAPI(page);
  await page.goto('/runs');
  await expect(page.getByText('Release A run')).toBeVisible();
  await page.getByLabel('Time range').selectOption('1h');
  await expect(page).toHaveURL(/range=1h/);
  await page.goto('/analytics');
  await expect(page.getByRole('heading', { name: 'Analytics' })).toBeVisible();
  await page.evaluate(() => localStorage.setItem('theme', 'dark'));
  await page.reload();
  await expect(page.locator('html')).toHaveClass(/dark/);
});

test('Analytics automation covers chart variants, data validation, and UI controls', async ({ page }) => {
  const analytics: AnalyticsCapture = { queries: [], saved: [] };
  await mockAPI(page, analytics);
  await page.goto('/analytics');

  await expect(page.getByRole('heading', { name: 'Revenue Ops' })).toBeVisible();
  for (const title of ['Bar Revenue', 'Line Revenue', 'Area Revenue', 'Pie Status', 'Stat Revenue', 'Table Orders']) {
    await expect(page.getByText(title)).toBeVisible();
  }
  await expect(page.getByText('301.25')).toBeVisible();
  await expect(page.getByRole('cell', { name: 'paid' }).first()).toBeVisible();
  await expect(page.locator('.recharts-wrapper')).toHaveCount(4);
  await expect(page.getByLabel('Dashboard time range')).toHaveValue('24');
  await expect(page.getByLabel('Auto-refresh interval')).toHaveValue('0');

  await page.getByRole('button', { name: /Add widget/i }).click();
  await expect(page.getByRole('heading', { name: 'Add Widget' })).toBeVisible();
  for (const type of ['bar', 'line', 'area', 'pie', 'stat', 'table']) {
    await expect(page.getByRole('button', { name: type })).toBeVisible();
  }
  const addModal = page.locator('.glass-modal').filter({ hasText: 'Add Widget' });
  await addModal.locator('input.glass-input').first().fill('Filtered Area');
  await page.getByRole('button', { name: 'area' }).click();
  await addModal.locator('select').nth(2).selectOption('amount');
  await addModal.locator('select').nth(3).selectOption('avg');
  await addModal.locator('select').nth(4).selectOption('15 minute');
  await page.getByRole('button', { name: '+ Add filter' }).click();
  await addModal.locator('select').nth(4).selectOption('amount');
  await addModal.locator('select').nth(5).selectOption('>');
  await page.getByPlaceholder('value').fill('100.5');
  await addModal.getByRole('button', { name: /Add widget/i }).click();
  await expect(page.getByText('Filtered Area')).toBeVisible();

  const created = analytics.queries.find(query => query.bucket === '15 minute');
  expect(created).toMatchObject({
    dataset: 'orders',
    bucket: '15 minute',
    aggregate: { field: 'amount', fn: 'avg' },
    where: [{ field: 'amount', op: '>', value: 100.5 }],
  });

  await page.getByTitle('Edit').first().click();
  await expect(page.getByRole('heading', { name: 'Edit Widget' })).toBeVisible();
  await page.getByRole('button', { name: /Save widget/i }).click();
  await expect(page.getByRole('heading', { name: 'Edit Widget' })).toHaveCount(0);

  await page.getByLabel('Dashboard time range').selectOption('168');
  await page.getByRole('button', { name: /Save/i }).click();
  const saveModal = page.locator('.glass-modal').filter({ hasText: 'Save Dashboard' });
  await saveModal.locator('input.glass-input').fill('Revenue Ops Updated');
  await saveModal.getByRole('button', { name: /^Save$/ }).click();
  await expect.poll(() => analytics.saved.at(-1)?.definition?.timeRangeHours).toBe(168);
  expect(analytics.saved.at(-1)?.definition?.widgets.some((widget: any) => 'data' in widget)).toBe(false);

  await page.getByTitle('Browse payments').click();
  await page.locator('.glass-modal').filter({ hasText: 'payments' }).getByRole('button', { name: /Add widget/i }).click();
  await expect(page.getByText(/500/)).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();

  await page.getByTitle('Browse orders').click();
  await expect(page.getByRole('heading', { name: 'orders' })).toBeVisible();
  const previewModal = page.locator('.glass-modal').filter({ hasText: 'orders' });
  await expect(previewModal.getByRole('columnheader', { name: 'amount' })).toBeVisible();
  await previewModal.getByLabel('Close').click();

  await page.getByTitle('Share dashboard').click();
  await expect(page.getByRole('heading', { name: 'Share Dashboard' })).toBeVisible();
  await expect(page.getByText(/12345678/)).toBeVisible();
  await page.getByRole('button', { name: /Create read-only link/i }).click();
  await expect(page.getByText(/\/share\/analytics\/token/)).toBeVisible();
});
