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

// The synthetic local CI identity is not a real tenant Owner/Admin.
// Do not bypass production guards to take screenshots from these sensitive routes.
// Authorized admin visual review is performed using the protected Vercel preview.
test('Integrations dashboard denies synthetic users without tenant-admin access', async ({ page }) => {
  await page.goto('/settings/integrations');
  await expect(page).toHaveURL(/\/dashboard(?:\?.*)?$/);
  await expect(page.getByRole('heading', { name: 'Account Integrations', exact: true })).toHaveCount(0);
});

test('Connection wizard denies access without tenant-admin membership', async ({ page }) => {
  await page.goto('/settings/integrations/connect?provider=google');
  await expect(page).toHaveURL(/\/dashboard(?:\?.*)?$/);
  await expect(page.getByRole('heading', { name: 'Connect an Account', exact: true })).toHaveCount(0);
});

test('A query parameter never bypasses integration authorization', async ({ page }) => {
  await page.goto('/settings/integrations/connect?provider=google&step=complete');
  await expect(page).toHaveURL(/\/dashboard(?:\?.*)?$/);
  await expect(page.getByRole('heading', { name: 'Google connection confirmed', exact: true })).toHaveCount(0);
});
