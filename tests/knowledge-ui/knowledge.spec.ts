import { expect, test } from '@playwright/test';
const source = 'http://127.0.0.1:3168';
test.beforeEach(async ({ context, request }) => {
  await request.get(`${source}/__knowledge_scenario?state=empty`);
  const user = { id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated', email: 'reviewer@example.test', app_metadata: { provider: 'email' }, user_metadata: {} };
  const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: user.id, role: 'authenticated', aud: 'authenticated', exp: expires })}.synthetic-local-fixture`;
  await context.addCookies([{ name: 'sb-127-auth-token', value: `base64-${b64({ access_token: token, refresh_token: 'synthetic-local-refresh', expires_at: expires, expires_in: 3600, token_type: 'bearer', user })}`, domain: '127.0.0.1', path: '/', sameSite: 'Lax' }]);
});
test('empty knowledge has one useful starting action and no zero-stat strip', async ({ page }) => {
  await page.goto('/settings/knowledge');
  await expect(page.getByText('Build your approved business knowledge', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Add the first draft' })).toBeVisible();
  await expect(page.getByText('Knowledge items', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('region',{name:'Knowledge library summary'})).toHaveCount(0);
  const preview=page.getByRole('region',{name:'Test approved knowledge'});
  await preview.getByRole('textbox',{name:'Customer question'}).fill('no-match');
  await preview.getByRole('button',{name:'Check approved knowledge'}).click();
  await expect(preview.getByRole('status')).toContainText('No approved, currently eligible knowledge matched');
  await page.screenshot({animations:'disabled',path:'test-results/knowledge-empty-desktop.png'});
});
test('preview shows approved document/version and clears old evidence when the question changes', async ({ page, request }) => {
  await request.get(`${source}/__knowledge_scenario?state=matched`);
  await page.goto('/settings/knowledge');
  const preview=page.getByRole('region',{name:'Test approved knowledge'});
  await preview.getByRole('textbox',{name:'Customer question'}).fill('How do transfers work?');
  await preview.getByRole('button',{name:'Check approved knowledge'}).click();
  await expect(preview.getByRole('heading',{name:'Synthetic transfer policy'})).toBeVisible();
  await expect(preview.getByText('Version 2 · No expiry recorded')).toBeVisible();
  await page.screenshot({animations:'disabled',path:'test-results/knowledge-match-desktop.png'});
  await preview.getByRole('textbox',{name:'Customer question'}).fill('A different question');
  await expect(preview.getByRole('heading',{name:'Synthetic transfer policy'})).toHaveCount(0);
  await page.setViewportSize({width:390,height:900});
  await preview.getByRole('textbox',{name:'Customer question'}).fill('How do transfers work?');
  await preview.getByRole('button',{name:'Check approved knowledge'}).click();
  await expect(preview.getByRole('heading',{name:'Synthetic transfer policy'})).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({animations:'disabled',path:'test-results/knowledge-preview-mobile.png'});
});
test('retrieval outage is explicit and is never displayed as no match', async ({ page, request }) => {
  await request.get(`${source}/__knowledge_scenario?state=matched`);await page.goto('/settings/knowledge');
  const preview=page.getByRole('region',{name:'Test approved knowledge'});
  await preview.getByRole('textbox',{name:'Customer question'}).fill('fail');await preview.getByRole('button',{name:'Check approved knowledge'}).click();
  await expect(preview.getByRole('status')).toContainText('Knowledge retrieval is unavailable');
  await expect(preview.getByRole('status')).not.toContainText('No approved, currently eligible knowledge matched');
});
test('library failure shows unknown readiness and disables the preview', async ({ page, request }) => {
  await request.get(`${source}/__knowledge_scenario?state=library-error`);await page.goto('/settings/knowledge');
  await expect(page.getByText('Knowledge could not be loaded',{exact:true})).toBeVisible();
  await expect(page.getByText('Knowledge items',{exact:true})).toHaveCount(0);
  await expect(page.getByRole('region',{name:'Knowledge library summary'})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Check approved knowledge'})).toBeDisabled();
});
