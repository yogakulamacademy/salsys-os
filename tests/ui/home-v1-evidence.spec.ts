import { expect, test } from '@playwright/test';

// Entire suite uses the existing local synthetic Supabase fixture.
// No real customer accounts, credentials, organizations or external calls.
test.beforeEach(async ({ context }) => {
  const user = {
    id: '00000000-0000-4000-8000-000000000001',
    aud: 'authenticated',
    role: 'authenticated',
    email: 'home-v1-test@example.test',
    app_metadata: { provider: 'email' },
    user_metadata: {},
  };
  const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const accessToken = [
    b64({ alg: 'HS256', typ: 'JWT' }),
    b64({ sub: user.id, role: 'authenticated', aud: 'authenticated', exp: expires }),
    'synthetic-local-fixture',
  ].join('.');
  const session = {
    access_token: accessToken,
    refresh_token: 'synthetic-local-refresh',
    expires_at: expires,
    expires_in: 3600,
    token_type: 'bearer',
    user,
  };
  await context.addCookies([{
    name: 'sb-127-auth-token',
    value: `base64-${b64(session)}`,
    domain: '127.0.0.1',
    path: '/',
    sameSite: 'Lax',
  }]);
});

test('Home has exactly four metric headlines, and opens source detail in the selected period', async ({ page }) => {
  await page.goto('/home?period=30d');
  const pulse = page.locator('section[aria-label="Business pulse"]');
  await expect(pulse).toBeVisible();
  for (const label of ['Leads', 'Qualified leads', 'Open pipeline value', 'Recorded collections']) {
    await expect(pulse.getByText(label, { exact: true })).toBeVisible();
  }
  await expect(pulse.getByText('Needs reply', { exact: true })).toHaveCount(0);
  await expect(pulse.getByText('Open pipeline value', { exact: true })).toBeVisible();
  const performance = page.getByRole('region', { name: 'Conversion and collections' });
  await expect(performance.getByRole('heading', { name: 'Qualification milestones', exact: true })).toBeVisible();
  await expect(performance.getByRole('heading', { name: 'Recorded collections trend', exact: true })).toBeVisible();
  await expect(performance.getByText('Qualification history unavailable', { exact: true })).toBeVisible();
  await expect(performance.locator('[data-empty-variant="revenue"]')).toHaveAttribute('data-evidence-state', 'unavailable');

  await expect(page.getByText('UTC reporting days', { exact: true })).toBeVisible();
  const coverage = page.getByTestId('home-reporting-coverage');
  await expect(coverage).toBeVisible();
  await expect(coverage.getByText('0 of 5 reporting indicators available')).toBeVisible();
  await expect(coverage.getByText('Selected-period evidence is incomplete.')).toBeVisible();
  await coverage.locator('summary').click();
  await expect(coverage.getByText('Qualification milestones', { exact: true })).toBeVisible();
  await expect(coverage.getByText('Recorded payment ledger', { exact: true })).toBeVisible();
  await expect(coverage.getByText('data freshness and live synchronization are unverified.', { exact: false })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(coverage.getByText('Reporting days use UTC.', { exact: false })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  const shortcuts = page.getByRole('navigation', { name: 'Home section shortcuts' });
  await expect(shortcuts).toBeVisible();
  await expect(shortcuts.getByRole('link', { name: 'Work queue' })).toHaveAttribute('href', '#home-action-queue');
  await expect(shortcuts.getByRole('link', { name: 'Conversion' })).toHaveAttribute('href', '#home-conversion');
  await expect(shortcuts.getByRole('link', { name: 'Business breakdown' })).toHaveAttribute('href', '#home-business-breakdown');
  await shortcuts.getByRole('link', { name: 'Work queue' }).click();
  await expect(page).toHaveURL(/#home-action-queue$/);
  await expect(page.locator('#home-action-queue')).toBeVisible();



  const geography = page.getByRole('region', { name: 'Geographic data readiness' });
  await expect(geography).toBeVisible();
  await expect(geography.getByText('Geographic coverage unavailable', { exact: true })).toBeVisible();
  await expect(geography.getByTestId('home-world-map-disabled')).toHaveAttribute('data-map-state', 'locked');
  await expect(geography.getByText('Map unavailable', { exact: true })).toBeVisible();
  await geography.getByText('Why is the map locked?').click();
  await expect(geography.getByText('No world-map distribution or location-based demand claims', { exact: false })).toBeVisible();
  const conversion = page.getByRole('region', { name: 'Conversion and collections' });
  await expect(conversion.getByRole('heading', { name: 'Pipeline health' })).toBeVisible();

  const detail = page.getByRole('link', { name: 'Analyze sources', exact: true });
  await expect(detail).toHaveAttribute('href', /\/home\/sources\?period=30d/);
  await detail.click();
  await expect(page).toHaveURL(/\/home\/sources\?period=30d/);
  await expect(page.getByRole('heading', { name: 'Acquisition sources', exact: true })).toBeVisible();
  await expect(page.getByText('Acquisition evidence is unavailable', { exact: false })).toBeVisible();

  await expect(page.getByRole('link', { name: 'Back to Home' })).toHaveAttribute('href', /\/home\?period=30d/);
  await expect(page.getByRole('link', { name: 'Review ledger context' })).toBeVisible();
});

test('Source intelligence shows no invented source-to-cash figures, including on mobile', async ({ page }) => {
  await page.goto('/home/sources?period=7d');
  await expect(page.getByRole('heading', { name: 'Acquisition sources', exact: true })).toBeVisible();
  await expect(page.getByText('This is not a source-to-cash conversion report.', { exact: false })).toBeVisible();
  await expect(page.getByText('Source-attributed collections will remain unavailable', { exact: false })).toBeVisible();
  await expect(page.getByText('Acquisition evidence is unavailable', { exact: false })).toBeVisible();
  await expect(page.getByText('—', { exact: true }).first()).toBeVisible();
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(
      () => page.evaluate(() => document.documentElement.scrollWidth),
      { message: `source report width at ${width}px` },
    ).toBeLessThanOrEqual(width);
  }
});

test('Valuation page refuses to manufacture prices or coverage when evidence is missing', async ({ page }) => {
  await page.goto('/revenue/valuation');
  await expect(page.getByRole('heading', { name: 'Opportunity valuation', exact: true })).toBeVisible();
  await expect(page.getByText('Valuation records are unavailable', { exact: false })).toBeVisible();
  await expect(page.getByText('No amount is assigned automatically here.', { exact: false })).toBeVisible();
  await expect(page.getByText('Valuation coverage is not a revenue forecast.', { exact: false })).toBeVisible();
  await expect(page.getByText('Eligible open leads', { exact: true })).toBeVisible();
  await expect(page.getByText('Need valuation', { exact: true })).toBeVisible();
  await expect(page.getByText('Value coverage', { exact: true })).toBeVisible();
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(
      () => page.evaluate(() => document.documentElement.scrollWidth),
      { message: `valuation queue width at ${width}px` },
    ).toBeLessThanOrEqual(width);
  }
});
