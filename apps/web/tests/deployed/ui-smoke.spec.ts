import { expect, test, type Page } from '@playwright/test';

// Deployed UI smoke: one continuous browser journey per project (ui-desktop and
// ui-mobile-390): login → build a pipeline on the canvas → save → activate →
// run → Pipelines list → Runs list → run detail → logout.
// The pipeline uses http.fetch with no URL, so the run fails deterministically
// with no external fixtures; the failed run detail IS the connector-failure
// state the smoke has to surface.

const EMAIL = process.env.QA_EMAIL;
const PASSWORD = process.env.QA_PASSWORD;

// AppShell collapses the nav rail below the `sm` breakpoint; at 390px the menu
// button must be opened before the nav links exist.
async function navTo(page: Page, label: string) {
  const menu = page.getByRole('button', { name: 'Menu' });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole('link', { name: label }).click();
}

test('deployed UI smoke: login, build, activate, run, failure, logout', async ({ page }, testInfo) => {
  test.skip(!EMAIL || !PASSWORD, 'QA_EMAIL and QA_PASSWORD are required (secrets/qa.env or shell env)');
  const name = `qa-ui-smoke-${testInfo.project.name}-${Date.now()}`;

  await test.step('login via the login page', async () => {
    await page.goto('/login');
    const email = page.getByPlaceholder('you@example.com');
    await expect(email, 'password login form missing — deployed build needs VITE_PASSWORD_LOGIN_ENABLED=true').toBeVisible({ timeout: 20_000 });
    // Password login is rate-limited (10/min per IP, shared with the API
    // specs) — retry on a transient failure instead of going red.
    for (let attempt = 0; ; attempt++) {
      await email.fill(EMAIL!);
      await page.getByPlaceholder('Password (8+ chars)').fill(PASSWORD!);
      await page.getByRole('button', { name: 'Sign in', exact: true }).click();
      const ok = await page.waitForURL(url => url.pathname === '/', { timeout: 20_000 }).then(() => true, () => false);
      if (ok) break;
      if (attempt >= 2) throw new Error('login did not reach the canvas after 3 attempts');
      await page.waitForTimeout(15_000);
    }
    await expect(page.getByLabel('Pipeline name')).toBeVisible({ timeout: 30_000 });
  });

  await test.step('build a source → sink pipeline on the canvas', async () => {
    await page.getByRole('button', { name: 'Edit as Mermaid' }).click();
    const panel = page.locator('aside').filter({ hasText: 'Mermaid editor' });
    // Structure-only editor; node config stays empty, which is what makes the
    // run fail later (http.fetch without a URL).
    await panel.locator('textarea').fill([
      'flowchart LR',
      '  src["Fetch (http.fetch)"]',
      '  out["Store (sink.records)"]',
      '  src --> out',
    ].join('\n'));
    const apply = panel.getByRole('button', { name: 'Apply to canvas' });
    await expect(apply).toBeEnabled({ timeout: 20_000 });
    await apply.click();
    await expect(page.locator('.react-flow__node')).toHaveCount(2, { timeout: 15_000 });
    // Close the panel: at 390px it covers the canvas action bar.
    await panel.locator('button.icon-button').first().click();
    await page.getByLabel('Pipeline name').fill(name);
  });

  await test.step('save, activate, and run the pipeline', async () => {
    const status = page.locator('#pipeline-action-status');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(status).toContainText(/Saved v\d+/, { timeout: 20_000 });
    const activate = page.getByRole('button', { name: 'Activate', exact: true });
    await expect(activate).toBeEnabled({ timeout: 10_000 });
    await activate.click();
    await expect(status).toContainText('Activated in', { timeout: 20_000 });
    await page.getByRole('button', { name: 'Run', exact: true }).click();
    await expect(status).toContainText('Running…', { timeout: 20_000 });
  });

  await test.step('pipeline appears in the Pipelines list', async () => {
    await page.getByRole('button', { name: 'All pipelines' }).click();
    await expect(page).toHaveURL(/\/pipelines/);
    await page.getByPlaceholder('Search…').fill(name);
    await expect(page.getByText(name)).toBeVisible({ timeout: 20_000 });
  });

  await test.step('open the run detail page', async () => {
    await navTo(page, 'Runs');
    await expect(page).toHaveURL(/\/runs/);
    await page.getByPlaceholder('Search…').fill(name);
    const row = page.getByText(name).first();
    // The runs list does not poll — refresh until the just-started run shows.
    await expect(async () => {
      if (!(await row.isVisible())) {
        await page.getByRole('button', { name: 'Refresh runs' }).click();
        throw new Error(`run ${name} not listed yet`);
      }
    }).toPass({ timeout: 60_000, intervals: [2_000] });
    await row.click();
    await page.getByRole('link', { name: 'View full run' }).click();
    await expect(page).toHaveURL(/\/runs\/[0-9a-f-]+/, { timeout: 15_000 });
    await expect(page.getByRole('heading', { name })).toBeVisible({ timeout: 20_000 });
  });

  await test.step('run detail surfaces the connector failure', async () => {
    // The URL-less http.fetch source exhausts its retries (~35s) and the run
    // lands in the failed state with the retry affordance visible.
    await expect(page.getByRole('button', { name: 'Retry run' })).toBeVisible({ timeout: 180_000 });
    await expect(page.getByText('· failed')).toBeVisible();
  });

  await test.step('logout', async () => {
    const railSignOut = page.getByRole('button', { name: 'Sign out' });
    if (!(await railSignOut.isVisible())) {
      // 390px: AppShell hides the nav rail (and its Sign out button); the
      // Profile page hosts the visible one.
      await page.goto('/profile');
    }
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/login/, { timeout: 20_000 });
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  });
});
