const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const read = (p) => readFileSync(path.join(__dirname, '../..', p), 'utf8');

test('price suggestions are review-gated and manager-only in the database', () => {
  const sql = read('supabase/migrations/20261116170000_course_price_suggestions_v1.sql');
  assert.match(sql, /enable row level security/);
  assert.match(sql, /Only organization managers can approve prices/);
  assert.match(sql, /price suggestion batch must belong to the same organization/);
  assert.match(sql, /one_pending_per_batch/);
  assert.match(sql, /'website_pricing'/);
  assert.match(sql, /when coalesce\(p_approve_inr, false\) then 'approved' else 'rejected'/);
  assert.doesNotMatch(sql, /grant (insert|update|delete)[^;]*course_price_suggestions[^;]*to authenticated/i);
});

test('checking prices never crawls or writes batches; approval goes through the RPC', () => {
  const actions = read('app/settings/website-prices/actions.ts');
  const check = actions.slice(actions.indexOf('export async function checkWebsitePricesAction'), actions.indexOf('export async function decideWebsitePriceAction'));
  assert.doesNotMatch(check, /fetch\(/);
  assert.doesNotMatch(check, /from\('course_batches'\)\s*\.(update|upsert|insert)/);
  assert.match(check, /seo_page_snapshots/);
  assert.match(check, /managerContext\(\)/);
  assert.match(actions, /can_manage_organization/);
  const decide = actions.slice(actions.indexOf('export async function decideWebsitePriceAction'));
  assert.match(decide, /approve_course_price_suggestion_v1/);
  assert.doesNotMatch(decide, /createAdminClient/);
});

test('Indian price is used only for leads in India and only when approved', () => {
  const data = read('lib/offer-suggestion-data.ts');
  assert.match(data, /isIndia/);
  assert.match(data, /website_pricing\?\.inr/);
});
