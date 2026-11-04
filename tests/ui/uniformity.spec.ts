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

for (const route of ['/home', '/leads', '/marketing', '/revenue', '/performance', '/automation', '/settings/overview']) {
  test(`shared brand and responsive layout: ${route}`, async ({ page }) => {
    await page.goto(route);
    await expect(page.getByText('Application error: a server-side exception has occurred', { exact: false })).toHaveCount(0);
    await expect(page.locator('main h1').first()).toBeVisible();
    await expect(page.locator('.salsys-brand-mark').first()).toHaveText('S');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1440);
    for (const width of [768, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth), { message: `${route} at ${width}px` }).toBeLessThanOrEqual(width);
      await expect(page.getByLabel('Open account menu', { exact: true })).toBeInViewport({ ratio: 1 });
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({ animations: 'disabled', path: `test-results/${route.replaceAll('/', '-')}-desktop.png` });
  });
}

test('Home Command Center uses full shared content width', async ({ page }) => {
  await page.setViewportSize({ width: 1744, height: 1000 });
  await page.goto('/home');

  const geometry = await page.locator('.command-center-v2').evaluate((element) => {
    const shell = element.closest('.page-transition');
    if (!shell) return null;
    const home = element.getBoundingClientRect();
    const parent = shell.getBoundingClientRect();
    return { leftGap: Math.abs(home.left - parent.left), widthGap: Math.abs(home.width - parent.width) };
  });

  expect(geometry).not.toBeNull();
  expect(geometry!.leftGap).toBeLessThanOrEqual(2);
  expect(geometry!.widthGap).toBeLessThanOrEqual(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1744);
});

test('Home evidence-first charts preserve empty-data and action semantics', async ({ page }) => {
  await page.goto('/home');

  await expect(page.getByRole('heading', { name: 'Lead activity', exact: true })).toBeVisible();
  const chart = page.getByTestId('home-lead-activity');
  await expect(chart).toBeVisible();
  // Synthetic mock mode has no authorized period lead query: never manufacture a line graph.
  await expect(chart).toContainText('Selected-period lead evidence is unavailable');
  // Decorative SVG is allowed, but no factual line/chart can be rendered without evidence.
  await expect(chart.locator('svg[aria-hidden="true"]')).toHaveCount(1);
  await expect(chart.locator('.recharts-responsive-container')).toHaveCount(0);
  await expect(chart.getByTestId('home-empty-state')).toHaveAttribute('data-evidence-state', 'unavailable');

  await expect(page.locator('[data-empty-variant="sources"]')).toHaveAttribute('data-evidence-state', 'unavailable');
  await expect(page.locator('[data-empty-variant="batches"]')).toHaveAttribute('data-evidence-state', 'empty');
  await expect(page.locator('[data-empty-variant="status"]')).toHaveAttribute('data-evidence-state', 'unavailable');

  await expect(page.getByRole('heading', { name: 'Action queue', exact: true })).toBeVisible();
  await expect(page.getByTestId('home-reply-pressure')).toHaveCount(0);

  await expect(page.getByText('Financial context', { exact: true })).toBeVisible();
  await page.getByText('Financial context', { exact: true }).click();
  await expect(page.getByText('Current snapshot revenue has not been substituted', { exact: false })).toBeVisible();
  await expect(page.locator('[data-empty-variant="revenue"]')).toHaveAttribute('data-evidence-state', 'unavailable');
  await expect(page.getByRole('link', { name: /View system health/ })).toBeVisible();

  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth), { message: 'Chart layout at ' + width + 'px' }).toBeLessThanOrEqual(width);
  }
});

test('Leads overview renders real summary and responsive controls', async ({ page }) => {
  await page.goto('/leads');
  await expect(page.getByTestId('leads-overview')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Leads overview' }).getByRole('link')).toHaveCount(5);
  await expect(page.getByRole('textbox', { name: 'Search leads' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Source' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Interest' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Score' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Last activity' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Next step' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Aging' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Course' })).toHaveCount(0);
  await expect(page.getByTestId('lead-source-icon').first()).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Attention' })).toHaveCount(0);
  await page.getByRole('button', { name: 'More filters' }).click();
  await expect(page.getByText('Sort', { exact: true })).toBeVisible();
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  }
});

test('Lead import/export actions appear in the intended layout and mock imports cannot write', async ({ page }) => {
  await page.goto('/leads');

  const actions = page.getByTestId('leads-import-export-actions');
  await expect(actions).toBeVisible();
  await expect(actions.getByRole('link', { name: 'Add lead', exact: true })).toBeVisible();
  await expect(actions.getByRole('note', { name: /Export leads unavailable/ })).toBeVisible();

  await actions.locator('summary[aria-label="More add lead options"]').click();
  await expect(actions.getByText('Import leads (CSV)')).toBeVisible();
  await expect(actions.getByText('Import leads (CSV)')).toHaveAttribute('aria-disabled', 'true');

  await page.goto('/leads/import');
  await expect(page.getByRole('heading', { name: 'Import leads' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Download CSV template' })).toBeVisible();

  await page.getByLabel('Choose CSV file').setInputFiles({
    name: 'valid-leads.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('first_name,email,phone\nSample,sample@example.com,\n'),
  });
  await expect(page.getByTestId('leads-import-preview')).toBeVisible();
  await expect(page.getByText('1', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Confirm import/ })).toBeDisabled();
  await expect(page.getByText(/Demo mode is active/)).toBeVisible();
});

test('Home supports the shared dark theme', async ({ page }) => {
  await page.goto('/home');
  await page.screenshot({ animations: 'disabled', path: 'test-results/home-desktop.png' });
  await page.locator('details.topbar-profile-menu > summary').click();
  await page.getByRole('button', { name: 'Switch to dark mode', exact: true }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.locator('details.topbar-profile-menu > summary').click();
  await page.screenshot({ animations: 'disabled', path: 'test-results/home-dark.png' });
});
