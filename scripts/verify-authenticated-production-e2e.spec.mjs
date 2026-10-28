import { expect, test } from '@playwright/test';

const WORKSPACE_COOKIE = 'salsys-active-workspace';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for authenticated production E2E.`);
  return value;
}

const baseURL = requireEnv('SALSYSOS_E2E_BASE_URL');
const email = requireEnv('SALSYSOS_E2E_EMAIL');
const password = requireEnv('SALSYSOS_E2E_PASSWORD');
const expectedOrganizationId = requireEnv('SALSYSOS_E2E_ORGANIZATION_ID');

if (!UUID_PATTERN.test(expectedOrganizationId)) {
  throw new Error('SALSYSOS_E2E_ORGANIZATION_ID must be a valid UUID.');
}

test.use({
  baseURL,
  ignoreHTTPSErrors: false,
  screenshot: 'off',
  trace: 'off',
  video: 'off',
});

test('password login establishes the expected production tenant session', async ({ page, context }) => {
  const loginResponse = await page.goto('/login?next=/dashboard', {
    waitUntil: 'domcontentloaded',
  });

  expect(loginResponse, 'login page should return a response').not.toBeNull();
  expect(loginResponse?.ok(), 'login page should be available').toBeTruthy();
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();

  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);

  await Promise.all([
    page.waitForURL((url) => url.pathname === '/dashboard', { timeout: 30_000 }),
    page.getByRole('button', { name: 'Sign in' }).click(),
  ]);

  const cookies = await context.cookies(baseURL);
  const workspaceCookie = cookies.find((cookie) => cookie.name === WORKSPACE_COOKIE);

  expect(workspaceCookie, 'tenant workspace cookie should be established').toBeTruthy();
  expect(workspaceCookie?.value).toBe(expectedOrganizationId);
  expect(workspaceCookie?.httpOnly).toBe(true);
  expect(workspaceCookie?.secure).toBe(true);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForURL((url) => url.pathname === '/dashboard', { timeout: 20_000 });
});
