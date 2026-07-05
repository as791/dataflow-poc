import { expect, test, type Page } from '@playwright/test';

async function mockAPI(page: Page) {
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
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
