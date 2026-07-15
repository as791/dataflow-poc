import { expect, test, type Page, type Route } from '@playwright/test';

type AnalyticsCapture = {
  queries: any[];
  saved: any[];
};

type LineageFixture = {
  nodes: Array<Record<string, unknown>>;
  edges: Array<Record<string, unknown>>;
  columnEdges: Array<Record<string, unknown>>;
  stats: { pipelines: number; assets: number; links: number; sharedAssets: number; columnLinks: number; externalJobs: number };
};

const SPARSE_LINEAGE_NODE_COUNT = 1_064;
const SPARSE_LINEAGE_EDGE_COUNT = 174;

function sparseLineageFixture(): LineageFixture {
  const linkedPipelineCount = SPARSE_LINEAGE_EDGE_COUNT / 2;
  const assetCount = SPARSE_LINEAGE_EDGE_COUNT;
  const pipelineCount = SPARSE_LINEAGE_NODE_COUNT - assetCount;
  const nodes: Array<Record<string, unknown>> = Array.from({ length: pipelineCount }, (_, index) => ({
    id: `pipeline:scale-${index}`,
    kind: 'pipeline',
    pipeline: {
      rowId: `scale-${index}`, pipelineKey: `scale-${index}`, name: `Scale pipeline ${index}`,
      version: 1, status: 'active', environment: 'test', metadata: { domain: index % 2 ? 'finance' : 'sales' },
    },
  }));
  const edges: Array<Record<string, unknown>> = [];
  for (let index = 0; index < linkedPipelineCount; index++) {
    const inputId = `asset:s3://scale/bronze/input-${index}.json`;
    const outputId = `asset:s3://scale/silver/output-${index}.json`;
    nodes.push(
      { id: inputId, kind: 'asset', asset: { urn: inputId.slice(6), platform: 's3', namespace: 'scale', name: `input-${index}.json`, type: 'file', layer: 'bronze' } },
      { id: outputId, kind: 'asset', asset: { urn: outputId.slice(6), platform: 's3', namespace: 'scale', name: `output-${index}.json`, type: 'file', layer: 'silver' } },
    );
    edges.push(
      { id: `scale-in-${index}`, source: inputId, target: `pipeline:scale-${index}`, pipelineRowId: `scale-${index}`, nodeId: 'source' },
      { id: `scale-out-${index}`, source: `pipeline:scale-${index}`, target: outputId, pipelineRowId: `scale-${index}`, nodeId: 'sink' },
    );
  }
  return {
    nodes, edges, columnEdges: [],
    stats: { pipelines: pipelineCount, assets: assetCount, links: edges.length, sharedAssets: 0, columnLinks: 0, externalJobs: 0 },
  };
}

async function mockAPI(page: Page, analytics?: AnalyticsCapture, lineage?: LineageFixture) {
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (analytics && path.startsWith('/api/analytics/')) return fulfillAnalytics(route, path, analytics);
    const body = path.endsWith('/auth/refresh') ? { accessToken: 'test', user: { id: 'u1', email: 'qa@example.com', role: 'owner', tenant_id: 't1' } }
      : path.endsWith('/auth/me') ? { user: { id: 'u1', email: 'qa@example.com', role: 'owner', tenant_id: 't1' } }
      : path.endsWith('/pipelines/lineage/workspace') ? lineage ?? {
        nodes: [
          { id: 'asset:s3://qa/bronze/orders.json', kind: 'asset', asset: { urn: 's3://qa/bronze/orders.json', platform: 's3', namespace: 'qa', name: 'orders.json', type: 'file', layer: 'bronze' } },
          { id: 'pipeline:p1', kind: 'pipeline', pipeline: { rowId: 'p1', pipelineKey: 'orders', name: 'Orders pipeline', version: 1, status: 'active', environment: 'test', metadata: { domain: 'sales' } } },
          { id: 'asset:postgres://warehouse/silver.orders', kind: 'asset', asset: { urn: 'postgres://warehouse/silver.orders', platform: 'postgres', namespace: 'warehouse', name: 'silver.orders', type: 'table', layer: 'silver' } },
        ],
        edges: [
          { id: 'e1', source: 'asset:s3://qa/bronze/orders.json', target: 'pipeline:p1', pipelineRowId: 'p1', nodeId: 'source' },
          { id: 'e2', source: 'pipeline:p1', target: 'asset:postgres://warehouse/silver.orders', pipelineRowId: 'p1', nodeId: 'sink' },
        ],
        columnEdges: [],
        stats: { pipelines: 1, assets: 2, links: 2, sharedAssets: 0, columnLinks: 0, externalJobs: 0 },
      }
      : path.endsWith('/pipelines/lineage/changes') ? { items: [] }
      : path.endsWith('/executions/monitoring/overview') ? { pipelines: [] }
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

test('cold lineage route loads React Flow structural styles', async ({ page }) => {
  await mockAPI(page);
  await page.goto('/lineage');

  await expect(page.locator('.react-flow__node')).toHaveCount(3);
  const layout = await page.evaluate(() => {
    const graph = document.querySelector<HTMLElement>('.react-flow')!;
    const graphRegion = graph.parentElement!;
    const toolbar = graphRegion.previousElementSibling as HTMLElement;
    const node = document.querySelector<HTMLElement>('.react-flow__node')!;
    const controls = document.querySelector<HTMLElement>('.react-flow__controls')!;
    const rect = (element: HTMLElement) => {
      const bounds = element.getBoundingClientRect();
      return { top: bounds.top, right: bounds.right, bottom: bounds.bottom, left: bounds.left, width: bounds.width };
    };
    return {
      nodePosition: getComputedStyle(node).position,
      controlsPosition: getComputedStyle(controls).position,
      graph: rect(graph),
      toolbar: rect(toolbar),
      node: rect(node),
      controls: rect(controls),
    };
  });

  expect(layout.nodePosition).toBe('absolute');
  expect(layout.controlsPosition).toBe('absolute');
  expect(layout.node.width).toBeLessThan(layout.graph.width / 2);
  expect(layout.graph.top).toBeGreaterThanOrEqual(layout.toolbar.bottom);
  expect(layout.node.top).toBeGreaterThanOrEqual(layout.graph.top);
  expect(layout.node.left).toBeGreaterThanOrEqual(layout.graph.left);
  expect(layout.node.right).toBeLessThanOrEqual(layout.graph.right);
  expect(layout.node.bottom).toBeLessThanOrEqual(layout.graph.bottom);
  expect(layout.controls.top).toBeGreaterThanOrEqual(layout.graph.top);
  expect(layout.controls.left).toBeGreaterThanOrEqual(layout.graph.left);
  expect(layout.controls.right).toBeLessThanOrEqual(layout.graph.right);
  expect(layout.controls.bottom).toBeLessThanOrEqual(layout.graph.bottom);
});

test('actual-scale sparse lineage stays culled and contained on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockAPI(page, undefined, sparseLineageFixture());
  await page.goto('/lineage');

  await expect(page.getByText(`${SPARSE_LINEAGE_NODE_COUNT}/${SPARSE_LINEAGE_NODE_COUNT} nodes · ${SPARSE_LINEAGE_EDGE_COUNT} links`, { exact: true })).toBeVisible();
  await expect(page.locator('.react-flow__node').first()).toBeVisible();
  await expect(page.locator('.react-flow__minimap')).toBeHidden();

  const measurement = await page.evaluate(() => {
    const graph = document.querySelector<HTMLElement>('.react-flow')!;
    const bounds = graph.parentElement!.getBoundingClientRect();
    return {
      domNodeCount: document.querySelectorAll('.react-flow__node').length,
      graph: { top: bounds.top, right: bounds.right, bottom: bounds.bottom, left: bounds.left, height: bounds.height },
      viewport: { width: window.innerWidth, height: window.innerHeight },
    };
  });

  expect(measurement.domNodeCount).toBeGreaterThan(0);
  expect(measurement.domNodeCount).toBeLessThan(SPARSE_LINEAGE_NODE_COUNT / 2);
  expect(measurement.graph.top).toBeGreaterThanOrEqual(0);
  expect(measurement.graph.left).toBeGreaterThanOrEqual(0);
  expect(measurement.graph.right).toBeLessThanOrEqual(measurement.viewport.width + 1);
  expect(measurement.graph.bottom).toBeLessThanOrEqual(measurement.viewport.height + 1);
  expect(measurement.graph.height).toBeGreaterThanOrEqual(measurement.viewport.height * 0.5);
});

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
