import { expect, test } from '@playwright/test';
import fixture from '../growth/fixtures/gt01.json';
import { buildJourneyEvidence, type JourneyRecord } from '../../lib/journey-evidence';

async function smartRead(body: any, changes: Record<string, unknown> = {}) {
  const asOf = new Date().toISOString();
  const enquiryAt = new Date(Date.now() - 2 * 86_400_000).toISOString();
  const rows: JourneyRecord[] = [
    { organization_id: 'synthetic-org', person_id: 'synthetic-person', lead_id: body.data.lead.id, journey_event_key: 'v1', source_record_id: 'v1', source_table: 'touchpoints', event_category: 'digital', event_type: 'page_view', event_at: new Date(Date.now() - 3_600_000).toISOString(), web_session_id: 'session-a', source: 'google', metadata: { page_path: '/courses/yoga' } },
    { organization_id: 'synthetic-org', person_id: 'synthetic-person', lead_id: body.data.lead.id, journey_event_key: 'v2', source_record_id: 'v2', source_table: 'touchpoints', event_category: 'digital', event_type: 'page_view', event_at: new Date(Date.now() - 7_200_000).toISOString(), web_session_id: 'session-b', source: 'instagram', metadata: { page_path: '/fees' } },
  ];
  return { ...body, data: { ...body.data, generatedAt: asOf, lead: { ...body.data.lead, owner: 'Reviewer', stage: 'qualified', nextFollowupAt: new Date(Date.now() - 86_400_000).toISOString() }, openTasks: [], availability: { ...body.data.availability, openTasks: 'empty' }, journeyEvidence: buildJourneyEvidence({ organizationId: 'synthetic-org', personId: 'synthetic-person', leadId: body.data.lead.id, enquiryAt, asOf, rows, total: rows.length }), ...changes } };
}

test.beforeEach(async ({ context }) => {
  const user = { id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated', email: 'reviewer@example.test', app_metadata: { provider: 'email' }, user_metadata: {} };
  const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: user.id, role: 'authenticated', aud: 'authenticated', exp: expires })}.synthetic-local-fixture`;
  await context.addCookies([{ name: 'sb-127-auth-token', value: `base64-${b64({ access_token: token, refresh_token: 'synthetic-local-refresh', expires_at: expires, expires_in: 3600, token_type: 'bearer', user })}`, domain: '127.0.0.1', path: '/', sameSite: 'Lax' }]);
});

test('smart Journey filters drill into evidence and review an existing commitment without writing', async ({ page }) => {
  let writes = 0;
  await page.route('**/api/leads/*/inspector', async route => {
    if (route.request().method() !== 'GET') { writes++; await route.abort(); return; }
    const response = await route.fetch();
    await route.fulfill({ json: await smartRead(await response.json()) });
  });
  await page.goto('/leads');
  await page.locator('tbody tr[tabindex="0"]').first().click();
  const inspector = page.getByRole('dialog', { name: 'Lead Inspector', exact: true });
  await inspector.getByRole('button', { name: /^Journey/ }).click();
  const panel = inspector.getByRole('region', { name: 'Enquiry journey evidence' });
  await expect(panel.getByRole('heading', { name: 'Review the overdue follow-up' })).toBeVisible();
  await expect(panel.getByText(/Behavioural recommendations remain unavailable/)).toBeVisible();
  await panel.getByRole('button', { name: 'Filter to /fees', exact: true }).click();
  await expect(panel.getByRole('list', { name: 'Journey events' }).locator('li')).toHaveCount(1);
  await panel.getByRole('button', { name: 'Reset filters', exact: true }).click();
  await panel.getByRole('combobox', { name: 'Source', exact: true }).selectOption('Google');
  await expect(panel.getByRole('list', { name: 'Journey events' }).locator('li')).toHaveCount(1);
  await panel.getByRole('searchbox', { name: 'Search evidence', exact: true }).fill('missing-page');
  await expect(panel.getByText('No activity matches these filters')).toBeVisible();
  await panel.getByRole('button', { name: 'Show all activity' }).click();
  await expect(panel.getByRole('list', { name: 'Journey events' }).locator('li')).toHaveCount(2);
  await page.setViewportSize({ width: 390, height: 900 });
  await panel.getByRole('heading', { name: 'Journey for this enquiry', exact: true }).scrollIntoViewIfNeeded();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ animations: 'disabled', path: 'test-results/smart-journey-mobile.png' });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await panel.getByRole('heading', { name: 'Journey for this enquiry', exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ animations: 'disabled', path: 'test-results/smart-journey-desktop.png' });
  await panel.getByRole('button', { name: 'Review follow-up', exact: true }).click();
  await expect(inspector.getByRole('region', { name: 'Enquiry journey evidence' })).toHaveCount(0);
  await expect(inspector.getByRole('textbox', { name: 'Follow-up', exact: true })).toHaveCount(0);
  expect(writes).toBe(0);
});

test('refresh preserves filters, replaces current context and disables guidance after a failed read', async ({ page }) => {
  let read = 0;
  await page.route('**/api/leads/*/inspector', async route => {
    read++;
    if (read === 3) { await route.fulfill({ status: 503, json: { ok: false, error: 'Synthetic source temporarily unavailable' } }); return; }
    const response = await route.fetch(); const body = await response.json();
    const next = await smartRead(body);
    if (read === 2) {
      next.data.lead.stage = 'enrolled';
      next.data.journeyEvidence.events = next.data.journeyEvidence.events.map((event: any) => ({ ...event, source: 'Instagram' }));
    }
    await route.fulfill({ json: next });
  });
  await page.goto('/leads'); await page.locator('tbody tr[tabindex="0"]').first().click();
  const inspector = page.getByRole('dialog', { name: 'Lead Inspector', exact: true });
  await inspector.getByRole('button', { name: /^Journey/ }).click();
  const panel = inspector.getByRole('region', { name: 'Enquiry journey evidence' });
  await panel.getByRole('combobox', { name: 'Source', exact: true }).selectOption('Google');
  await panel.getByRole('button', { name: 'Refresh Journey', exact: true }).click();
  await expect(panel.getByRole('heading', { name: 'Review the recorded outcome' })).toBeVisible();
  await expect(panel.getByRole('combobox', { name: 'Source', exact: true })).toHaveValue('Google');
  await expect(panel.getByRole('option', { name: 'Google (not in this read)', exact: true })).toHaveCount(1);
  await panel.getByRole('button', { name: 'Refresh Journey', exact: true }).click();
  await expect(panel.getByRole('heading', { name: 'Refresh before choosing the next action' })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Refresh records', exact: true })).toBeVisible();
  await expect(panel.getByText('No activity matches these filters')).toBeVisible();
});

test('a delayed refresh cannot replace a newly selected lead', async ({ page }) => {
  let reads = 0; let release: () => void = () => {};
  const held = new Promise<void>(resolve => { release = resolve; });
  let finishOld: () => void = () => {};
  const oldFinished = new Promise<void>(resolve => { finishOld = resolve; });
  await page.route('**/api/leads/*/inspector', async route => {
    const n = ++reads;
    const response = await route.fetch(); const body = await response.json();
    const next = await smartRead(body);
    if (n === 2) { next.data.lead.name = 'OLD RESPONSE MUST NOT WIN'; await held; }
    if (n === 3) next.data.lead.name = 'CURRENT LEAD SHOULD STAY';
    try { await route.fulfill({ json: next }); } catch { /* The superseded browser request may already be cancelled. */ }
    finally { if (n === 2) finishOld(); }
  });
  await page.goto('/leads');
  await page.locator('tbody tr[tabindex="0"]').first().click();
  const inspector = page.getByRole('dialog', { name: 'Lead Inspector', exact: true });
  await expect(inspector.getByRole('button', { name: 'Refresh Lead Inspector', exact: true })).toBeEnabled();
  await inspector.getByRole('button', { name: 'Refresh Lead Inspector', exact: true }).click();
  await expect.poll(() => reads).toBe(2);
  await inspector.getByRole('button', { name: 'Close', exact: true }).click();
  await page.locator('tbody tr[tabindex="0"]').nth(1).click();
  await expect(inspector.getByRole('heading', { name: 'CURRENT LEAD SHOULD STAY', exact: true })).toBeVisible();
  release();
  await oldFinished;
  await expect.poll(() => reads).toBe(3);
  await expect(inspector.getByText('OLD RESPONSE MUST NOT WIN')).toHaveCount(0);
  await expect(inspector.getByRole('heading', { name: 'CURRENT LEAD SHOULD STAY', exact: true })).toBeVisible();
});

test('GT-01 Journey panel shows scoped counts, filters activity and fits phone width', async ({ page }) => {
  await page.route('**/api/leads/*/inspector', async route => {
    const response = await route.fetch();
    expect(response.ok()).toBe(true);
    const body = await response.json();
    const leadId = body.data.lead.id;
    // Synthetic read-model projection; financial commands are not simulated.
    const rows: JourneyRecord[] = fixture.event_deliveries.map(event => ({
      organization_id: event.tenant, person_id: fixture.identity.person.id, lead_id: leadId,
      journey_event_key: event.source_event_id, source_record_id: event.source_event_id,
      source_table: event.event_type === 'lead_created' ? 'leads' : 'session_id' in event ? 'touchpoints' : 'unsupported_finance_adapter',
      event_category: 'session_id' in event ? 'digital' : 'crm', event_type: event.event_type,
      event_at: event.occurred_at, web_session_id: 'session_id' in event ? String(event.session_id) : null,
      source: fixture.sessions.find(session => 'session_id' in event && session.id === event.session_id)?.source ?? null,
      metadata: { landing_page: 'page_path' in event ? event.page_path : null },
    }));
    const evidence = buildJourneyEvidence({ organizationId: fixture.scope.tenant, personId: fixture.identity.person.id, leadId, enquiryAt: '2026-10-02T10:05:01+05:30', asOf: fixture.scope.as_of, rows, total: rows.length, policy: 'permitted' });
    await route.fulfill({ json: { ...body, data: { ...body.data, lead: { ...body.data.lead, name: 'Alex · synthetic fixture' }, journeyEvidence: evidence, journey: [], journeyTotal: evidence.events.length } } });
  });
  await page.goto('/leads');
  await page.locator('tbody tr[tabindex="0"]').first().click();
  const inspector = page.getByRole('dialog', { name: 'Lead Inspector', exact: true });
  const conversation = inspector.getByRole('link', { name: 'Conversation', exact: true });
  const contrast = await conversation.evaluate(el => {
    const style = getComputedStyle(el);
    const luminance = (color: string) => {
      const [r, g, b] = color.match(/[\d.]+/g)!.slice(0, 3).map(Number).map(v => { const x = v / 255; return x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4; });
      return .2126 * r + .7152 * g + .0722 * b;
    };
    const a = luminance(style.color), b = luminance(style.backgroundColor);
    return { ratio: (Math.max(a, b) + .05) / (Math.min(a, b) + .05), foreground: style.color, background: style.backgroundColor, classes: el.className };
  });
  expect(contrast.ratio, JSON.stringify(contrast)).toBeGreaterThanOrEqual(4.5);
  await inspector.getByRole('button', { name: /^Journey/ }).click();
  const panel = inspector.getByRole('region', { name: 'Enquiry journey evidence' });
  await expect(panel.getByText('2 observed sessions · 3 page views', { exact: true })).toBeVisible();
  await expect(panel.getByText('2 observed sessions · 4 page views', { exact: true })).toBeVisible();
  await panel.getByRole('combobox', { name: 'Activity', exact: true }).selectOption('before');
  await expect(panel.locator('ol > li')).toHaveCount(4);
  await panel.getByRole('combobox', { name: 'Activity', exact: true }).selectOption('all');
  await page.screenshot({ animations: 'disabled', path: 'test-results/journey-gt01-desktop.png' });
  await page.setViewportSize({ width: 390, height: 900 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ animations: 'disabled', path: 'test-results/journey-gt01-mobile.png' });
});

test('empty Customer 360, Admissions and Courses retain useful structure without zero stats', async ({ page }) => {
  await page.goto('/customer-360');
  await expect(page.getByRole('columnheader', { name: 'Contact', exact: true })).toBeVisible();
  await expect(page.getByText('No customer profiles available', { exact: true })).toBeVisible();
  await expect(page.getByText('Active opportunities', { exact: true })).toHaveCount(0);
  await page.screenshot({ animations: 'disabled', path: 'test-results/customer-360-empty.png' });
  await page.goto('/admissions');
  await expect(page.getByRole('navigation', { name: 'Admissions workspace views' })).toBeVisible();
  await expect(page.getByText('No admissions activity yet', { exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Admissions action signals' })).toHaveCount(0);
  await page.screenshot({ animations: 'disabled', path: 'test-results/admissions-empty.png' });
  await page.goto('/admissions?view=payments');
  await expect(page.getByRole('columnheader', { name: 'Opportunity', exact: true })).toBeVisible();
  await expect(page.getByText('No payment-pending opportunities', { exact: true })).toBeVisible();
  await expect(page.getByText('Payment-stage leads', { exact: true })).toHaveCount(0);
  await page.goto('/course-management');
  await expect(page.getByText('No courses yet', { exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Course capacity summary' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'New Course', exact: true })).toBeVisible();
  await page.screenshot({ animations: 'disabled', path: 'test-results/courses-empty.png' });
  await page.getByRole('button', { name: 'New Course', exact: true }).click();
  await expect(page.getByText('Add a course to this school', { exact: true })).toBeVisible();
});
