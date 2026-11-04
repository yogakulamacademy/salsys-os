import { expect, test } from '@playwright/test';

test.beforeEach(async ({ context }) => {
  const user = {
    id: '00000000-0000-4000-8000-000000000001',
    aud: 'authenticated',
    role: 'authenticated',
    email: 'reviewer@example.test',
    app_metadata: { provider: 'email' },
    user_metadata: {},
  };
  const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const token = b64({ alg: 'HS256', typ: 'JWT' }) + '.' +
    b64({ sub: user.id, role: 'authenticated', aud: 'authenticated', exp: expires }) +
    '.synthetic-local-fixture';
  const session = {
    access_token: token,
    refresh_token: 'synthetic-local-refresh',
    expires_at: expires,
    expires_in: 3600,
    token_type: 'bearer',
    user,
  };
  await context.addCookies([{
    name: 'sb-127-auth-token',
    value: 'base64-' + b64(session),
    domain: '127.0.0.1',
    path: '/',
    sameSite: 'Lax',
  }]);
});

test('Workspace Settings overview preserves real routes and avoids fabricated values', async ({ page }) => {
  await page.goto('/settings/overview');
  await expect(page.getByRole('heading', { name: 'Workspace settings', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'CRM Rules & Pipeline' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'CRM Co-Pilot' })).toBeVisible();

  const nav = page.getByRole('navigation', { name: 'Workspace settings sections' });
  await expect(nav.getByRole('link', { name: 'Overview' })).toHaveAttribute('aria-current', 'page');
  await expect(nav.getByRole('link', { name: 'CRM Rules' })).toHaveAttribute('href', '/settings');
  await expect(nav.getByRole('link', { name: 'Sales Assets' })).toHaveAttribute('href', '/settings/assets');
  await expect(nav.getByRole('link', { name: 'AI Knowledge' })).toHaveAttribute('href', '/settings/knowledge');

  // Synthetic CI uses reference mode. The dashboard must not turn illustrative
  // reference data into apparently live tenant counts or system health scores.
  await expect(page.getByText('Mock mode', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('No live tenant values in mock or setup mode.').first()).toBeVisible();
  await expect(page.getByText('92%', { exact: true })).toHaveCount(0);
  await expect(page.getByText('2 connected', { exact: true })).toHaveCount(0);
});

test('Workspace Settings stays in the viewport on desktop, tablet and mobile', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto('/settings/overview');
  await expect(page.getByRole('heading', { name: 'Workspace settings', exact: true })).toBeVisible();
  await page.screenshot({ animations:'disabled', path:'test-results/workspace-settings-redesign-desktop.png' });

  for (const width of [1024, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(
      () => page.evaluate(() => document.documentElement.scrollWidth),
      { message: 'Workspace Settings must not cause document horizontal overflow at ' + width + 'px' },
    ).toBeLessThanOrEqual(width);
    await expect(page.getByRole('heading', { name: 'CRM Rules & Pipeline' })).toBeVisible();
  }
  await page.screenshot({ animations:'disabled', path:'test-results/workspace-settings-redesign-mobile.png' });
});
