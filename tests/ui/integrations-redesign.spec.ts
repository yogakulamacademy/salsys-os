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
  const session = { access_token: token, refresh_token: 'synthetic-local-refresh',
    expires_at: expires, expires_in: 3600, token_type: 'bearer', user };
  await context.addCookies([{ name: 'sb-127-auth-token',
    value: 'base64-' + b64(session), domain: '127.0.0.1', path: '/', sameSite: 'Lax' }]);
});

test('Integrations dashboard shows honest health and authorized entry points', async ({ page }) => {
  await page.goto('/settings/integrations');
  await expect(page.getByRole('heading', { name: 'Account Integrations', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Integration Health' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Connected Accounts' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Connect Account' })).toHaveAttribute('href','/settings/integrations/connect');
  await expect(page.getByRole('heading', { name: 'Security & Access' })).toBeVisible();
  await expect(page.getByText('92%', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Data & Sync Settings' })).toBeVisible();
  await page.screenshot({ animations: 'disabled', path: 'test-results/integrations-overview-desktop.png' });
  for (const width of [1440, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth),
      { message: 'Integration dashboard horizontal overflow at ' + width + 'px' }).toBeLessThanOrEqual(width);
  }
  await page.screenshot({ animations: 'disabled', path: 'test-results/integrations-overview-mobile.png' });
});

test('Connect Account wizard filters providers and uses existing OAuth choices', async ({ page }) => {
  await page.goto('/settings/integrations/connect?provider=google');
  await expect(page.getByRole('heading', { name: 'Connect an Account', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Select an integration' })).toBeVisible();
  const providers=page.locator('.aiu-wizard-provider-grid');
  await expect(providers.locator('.aiu-choice')).toHaveCount(4);
  await page.getByRole('button', { name: 'Messaging', exact: true }).click();
  await expect(providers.locator('.aiu-choice')).toHaveCount(3);
  await page.getByRole('button', { name: 'Analytics', exact: true }).click();
  await expect(providers.locator('.aiu-choice')).toHaveCount(1);
  await expect(providers.getByRole('link', { name: /Google/ })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 900 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ animations: 'disabled', path: 'test-results/integrations-connect-mobile.png' });
});

test('Connect Account completion cannot be forged with a query parameter', async ({ page }) => {
  await page.goto('/settings/integrations/connect?provider=google&step=complete');
  await expect(page.getByRole('heading', { name: 'Connect an Account', exact: true })).toBeVisible();
  // Synthetic fixture has no real provider authorization, so query-controlled
  // completion must fall back to the actual first step.
  await expect(page.getByRole('heading', { name: 'Select an integration' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Google connection confirmed' })).toHaveCount(0);
});
