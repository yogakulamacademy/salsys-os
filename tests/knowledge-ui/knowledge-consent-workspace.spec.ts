import { expect, test } from '@playwright/test';

test.beforeEach(async ({ context }) => {
  // Only synthetic, loopback fixture identity; no hosted Supabase session.
  const user = {
    id: '00000000-0000-4000-8000-000000000001',
    aud: 'authenticated', role: 'authenticated',
    email: 'reviewer@example.test',
    app_metadata: { provider: 'email' }, user_metadata: {},
  };
  const base64 = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const token = base64({ alg: 'HS256', typ: 'JWT' }) + '.' +
    base64({ sub: user.id, role: 'authenticated', aud: 'authenticated', exp: expires }) +
    '.synthetic-local-fixture';
  await context.addCookies([{
    name: 'sb-127-auth-token',
    value: 'base64-' + base64({
      access_token: token, refresh_token: 'synthetic-local-refresh',
      expires_at: expires, expires_in: 3600, token_type: 'bearer', user,
    }),
    domain: '127.0.0.1', path: '/', sameSite: 'Lax',
  }]);
});

const host = 'fixture.example.com';
const now = () => new Date();
const recorded = () => ({
  hostname: host, purpose: 'website_discovery_review_only',
  status: 'granted', policy_version: 'synthetic-demo-v1',
  granted_at: new Date(now().getTime() - 3600_000).toISOString(),
  valid_until: new Date(now().getTime() + 3600_000).toISOString(),
  withdrawn_at: null, revision: 1,
});
const audit = () => ({
  hostname: host, action: 'granted', revision: 1,
  occurred_at: new Date(now().getTime() - 3600_000).toISOString(),
  policy_version: 'synthetic-demo-v1', job_cancellations: 0,
});

test('disabled read state never implies consent is absent and never attempts a grant', async ({ page }) => {
  const methods: string[] = [];
  await page.route('**/api/knowledge/discovery/consent', async route => {
    const method = route.request().method();
    if (method !== 'GET') methods.push(method);
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true, managementEnabled: false, readEnabled: false,
        // Intentionally injected data must not be rendered while read gate is OFF.
        records: [recorded()], audit: [audit()],
      }),
    });
  });
  await page.goto('/settings/knowledge/discovery/consent');
  await expect(page.getByRole('heading', { name: 'Discovery consent' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Grant consent unavailable' })).toBeDisabled();
  await expect(page.getByText('Consent history is not available in this environment.', { exact: false })).toBeVisible();
  await expect(page.getByText(host, { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Review withdrawal' })).toHaveCount(0);
  expect(methods).toEqual([]);
});

test('exact-host typed confirmation withdraws once and audits refresh without erasure or grant', async ({ page }) => {
  let consent: Record<string, unknown> = recorded();
  let changes: Array<Record<string, unknown>> = [audit()];
  const actions: Array<{ method: string; body: Record<string, unknown> }> = [];
  await page.route('**/api/knowledge/discovery/consent', async route => {
    const req = route.request();
    if (req.method() === 'DELETE') {
      const body = req.postDataJSON();
      actions.push({ method: req.method(), body });
      expect(body).toEqual({ hostname: host, expectedRevision: 1 });
      consent = { ...consent, status: 'withdrawn', revision: 2,
        withdrawn_at: new Date().toISOString() };
      changes = [{
        hostname: host, action: 'withdrawn', revision: 2,
        occurred_at: new Date().toISOString(),
        policy_version: 'synthetic-demo-v1', job_cancellations: 1,
      }, ...changes];
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, status: 'withdrawn', revision: 2, jobsCancelled: 1 }),
      });
      return;
    }
    if (req.method() !== 'GET') {
      actions.push({ method: req.method(), body: {} });
      await route.fulfill({ status: 403, body: 'Unexpected mutation' });
      return;
    }
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true, managementEnabled: false, readEnabled: true,
        records: [consent], audit: changes,
      }),
    });
  });
  await page.goto('/settings/knowledge/discovery/consent');
  const card = page.getByRole('article', { name: 'Consent for ' + host });
  await expect(card.getByText('Granted, time-limited')).toBeVisible();
  await expect(card.getByText('Read-only website discovery review')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Grant consent unavailable' })).toBeDisabled();
  await card.getByRole('button', { name: 'Review withdrawal' }).click();
  const confirm = page.getByRole('textbox', { name: 'Type ' + host + ' to confirm' });
  const submit = card.getByRole('button', { name: 'Withdraw consent' });
  await expect(submit).toBeDisabled();
  await confirm.fill('other.example.com');
  await expect(submit).toBeDisabled();
  await confirm.fill(host);
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(page.getByRole('status').filter({
    hasText: 'Consent withdrawal confirmed by the database.',
  })).toBeVisible();
  await expect(card.getByText('Withdrawn', { exact: true })).toBeVisible();
  await expect(card.getByRole('button', { name: 'Review withdrawal' })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Consent audit trail' })
    .getByText('Consent withdrawn', { exact: false })).toBeVisible();
  expect(actions).toEqual([{
    method: 'DELETE', body: { hostname: host, expectedRevision: 1 },
  }]);
});

test('stale revision never shows success and refreshes consent state', async ({ page }) => {
  let reads = 0;
  await page.route('**/api/knowledge/discovery/consent', async route => {
    if (route.request().method() === 'DELETE') {
      await route.fulfill({
        status: 409, contentType: 'application/json',
        body: JSON.stringify({ ok: false, error: 'stale_revision' }),
      });
      return;
    }
    reads++;
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true, managementEnabled: false, readEnabled: true,
        records: [recorded()], audit: [audit()],
      }),
    });
  });
  await page.goto('/settings/knowledge/discovery/consent');
  await page.getByRole('button', { name: 'Review withdrawal' }).click();
  await page.getByRole('textbox', { name: 'Type ' + host + ' to confirm' }).fill(host);
  await page.getByRole('button', { name: 'Withdraw consent' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'already withdrawn' })).toBeVisible();
  await expect(page.getByText('Consent withdrawal confirmed by the database.', { exact: false })).toHaveCount(0);
  expect(reads).toBeGreaterThanOrEqual(2);
});

test('read outage is an error, never an empty or implicitly granted state', async ({ page }) => {
  await page.route('**/api/knowledge/discovery/consent', async route => {
    await route.fulfill({
      status: 503, contentType: 'application/json',
      body: JSON.stringify({ ok: false, error: 'Consent state unavailable' }),
    });
  });
  await page.goto('/settings/knowledge/discovery/consent');
  await expect(page.getByRole('region', { name: 'Consent records' })
    .getByRole('alert')).toBeVisible();
  await expect(page.getByText('No discovery consent records were returned')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Review withdrawal' })).toHaveCount(0);
});

test('consent review has no mobile overflow and no grant or erasure endpoint', async ({ page }) => {
  let mutationCount = 0;
  page.on('request', req => {
    if (req.method() !== 'GET' && req.url().includes('/api/knowledge/discovery')) mutationCount++;
  });
  await page.route('**/api/knowledge/discovery/consent', async route => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true, readEnabled: true, managementEnabled: false,
        records: [recorded()], audit: [audit()],
      }),
    });
  });
  await page.setViewportSize({ width: 375, height: 820 });
  await page.goto('/settings/knowledge/discovery/consent');
  await expect(page.getByRole('heading', { name: 'Discovery consent' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(375);
  await page.screenshot({
    animations: 'disabled', path: 'test-results/kb06d-consent-mobile.png',
    fullPage: true,
  });
  expect(mutationCount).toBe(0);
});
