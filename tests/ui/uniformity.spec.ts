import { expect, test } from '@playwright/test';

test.beforeEach(async ({ context }) => {
  const user = { id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated', email: 'reviewer@example.test', app_metadata: { provider: 'email' }, user_metadata: {} };
  const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const access_token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: user.id, role: 'authenticated', aud: 'authenticated', exp: expires })}.synthetic-local-fixture`;
  const session = { access_token, refresh_token: 'synthetic-local-refresh', expires_at: expires, expires_in: 3600, token_type: 'bearer', user };
  await context.addCookies([{ name: 'sb-127-auth-token', value: `base64-${b64(session)}`, domain: '127.0.0.1', path: '/', sameSite: 'Lax' }]);
});

test('inbox opens unselected; search keeps a bounded, illustrated empty list', async ({ page }) => {
  await page.goto('/conversations');
  await expect(page.getByRole('heading', { name: 'Inbox', exact: true })).toBeVisible();
  await expect(page.getByText('Select a conversation', { exact: true })).toBeVisible();
  await expect(page.locator('.ui-empty-artwork').first()).toBeVisible();
  await page.getByRole('textbox', { name: /Search conversations/ }).fill('zzzz-no-such-customer');
  await expect(page.getByText('No matching conversations', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reset inbox filters' })).toBeVisible();
  await page.screenshot({ animations: 'disabled', path: 'test-results/inbox-empty-desktop.png' });
  for (const width of [390, 768, 1254, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const layout = await page.locator('.conversation-workspace').evaluate(el => ({ width: el.clientWidth, scroll: el.scrollWidth, height: el.clientHeight }));
    expect(layout.scroll).toBeLessThanOrEqual(layout.width + 2);
    expect(layout.height).toBeLessThan(1000);
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThan(1800);
  }
  await page.setViewportSize({ width: 390, height: 900 });
  await page.screenshot({ animations: 'disabled', path: 'test-results/inbox-empty-mobile.png' });
});

test('selecting a conversation and hiding context reclaims the grid column', async ({ page }) => {
  await page.goto('/conversations');
  const first = page.locator('.conversation-sidebar a[href^="/conversations?lead="]').first();
  await expect(first).toBeVisible();
  await first.click();
  await expect(page.getByText('Select a conversation', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Hide customer context', exact: true })).toBeVisible();
  const before = await page.locator('.conversation-workspace').evaluate(el => ({ width: el.clientWidth, scroll: el.scrollWidth, columns: getComputedStyle(el).gridTemplateColumns }));
  expect(before.scroll).toBeLessThanOrEqual(before.width + 2);
  await page.getByRole('button', { name: 'Hide customer context', exact: true }).click();
  await expect(page.locator('.inbox-desktop-context')).toHaveCount(0);
  const after = await page.locator('.conversation-workspace').evaluate(el => getComputedStyle(el).gridTemplateColumns);
  expect(after.split(' ').length).toBe(2);
  expect(before.columns.split(' ').length).toBe(3);
  await page.screenshot({ animations: 'disabled', path: 'test-results/inbox-selected-desktop.png' });
  await page.setViewportSize({ width: 768, height: 1024 });
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThan(1800);
  await page.getByRole('button', { name: 'Open customer context', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Customer context', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Customer context', exact: true })).toHaveCount(0);
});

test('lead queue precedes booking cards and retains table headers for an empty view', async ({ page }) => {
  await page.goto('/leads?q=zzzz-no-such-lead');
  await expect(page.getByRole('heading', { name: 'Leads', exact: true })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Lead', exact: true })).toBeVisible();
  await expect(page.getByText('No leads match this view', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Clear filters', exact: true })).toBeVisible();
  const table = await page.locator('table').boundingBox();
  expect(table!.y).toBeLessThan(600);
  await page.screenshot({ animations: 'disabled', path: 'test-results/leads-empty-desktop.png' });
});

test('metric dialog traps focus, closes with Escape and restores its trigger', async ({ page }) => {
  await page.goto('/home');
  const trigger = page.getByRole('button', { name: 'Inspect Leads', exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Leads', exact: true });
  await expect(dialog).toBeVisible();
  await expect.poll(() => dialog.evaluate(el => el.contains(document.activeElement))).toBe(true);
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
  await trigger.click();
  await page.locator('[data-modal-backdrop]').click({ position: { x: 10, y: 10 } });
  await expect(dialog).toHaveCount(0);
});

test('workspace search finds permitted commands and supports keyboard dismissal', async ({ page }) => {
  await page.goto('/home');
  await page.getByRole('button', { name: /Search workspaces and actions/ }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Search workspaces and actions', exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('textbox').fill('leads');
  await expect(dialog.getByRole('link', { name: /Show leads that need action/ })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

test('shared brand and neutral panels render across core destinations', async ({ page }) => {
  for (const route of ['/home', '/leads', '/marketing', '/revenue', '/performance', '/automation', '/settings/overview']) {
    await page.goto(route);
    await expect(page.getByText('Application error: a server-side exception has occurred', { exact: false })).toHaveCount(0);
    await expect(page.locator('main h1').first()).toBeVisible();
    await expect(page.locator('.salsys-brand-mark').first()).toHaveText('S');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1440);
    for (const width of [768, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth), { message: `${route} at ${width}px` }).toBeLessThanOrEqual(width);
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({ animations: 'disabled', path: `test-results/${route.replaceAll('/', '-')}-desktop.png` });
  }
  await page.goto('/home');
  await page.screenshot({ animations: 'disabled', path: 'test-results/home-desktop.png' });
  await page.locator('details.topbar-profile-menu > summary').click();
  await page.getByRole('button', { name: 'Switch to dark mode', exact: true }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.locator('details.topbar-profile-menu > summary').click();
  await page.screenshot({ animations: 'disabled', path: 'test-results/home-dark.png' });
});
