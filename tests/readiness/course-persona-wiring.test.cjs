const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const read = (p) => fs.readFileSync(p, 'utf8');

test('personas table: row-level security, members read, managers change', () => {
  const sql = read('supabase/migrations/20261120230000_course_personas_v1.sql');
  assert.match(sql, /enable row level security/);
  assert.match(sql, /is_organization_member\(organization_id\)/);
  assert.match(sql, /can_manage_organization\(organization_id\)/);
  assert.match(sql, /revoke all on public\.course_personas from anon/);
  assert.match(sql, /unique \(organization_id, course_id\)/);
});

test('persona reads and writes are scoped to the business', () => {
  const src = read('lib/course-persona-data.ts');
  const reads = (src.match(/(admin|client)\.from\("[a-z_]+"\)/g) || []).length;
  const scoped = (src.match(/organization_id(: |", )organizationId/g) || []).length;
  assert.ok(reads > 0 && scoped >= reads, `${scoped} scoped of ${reads}`);
  // Refresh writes drafts only; approval is a separate manager action.
  const refresh = src.slice(src.indexOf('export async function refreshCoursePersonas'), src.indexOf('export async function listCoursePersonas'));
  assert.doesNotMatch(refresh, /approved_traits/);
});

test('persona actions are for managers only', () => {
  const src = read('app/personas/actions.ts');
  assert.match(src, /can_manage_organization/);
  assert.match(src, /Only managers can change personas/);
  assert.match(src, /approved_by: ctx\.user\.id/);
});

test('Re-engaged no longer shows the old temperature', () => {
  const page = read('app/re-engaged/page.tsx');
  assert.doesNotMatch(page, /TemperatureBadge/);
  assert.doesNotMatch(page, /<th className="px-3 py-3">Temperature<\/th>/);
});

test('Personas page: managers learn and approve; Fit uses approved personas only', () => {
  const page = read('app/personas/page.tsx');
  assert.match(page, /can_manage_organization/);
  assert.match(page, /manager \? \(/);
  const data = read('lib/course-persona-data.ts');
  const fit = data.slice(data.indexOf('export async function fitForLeads'));
  assert.match(fit, /getApprovedPersonas\(admin, organizationId\)/);
  assert.doesNotMatch(fit, /draft_traits/);
  assert.match(fit, /\.eq\("organization_id", organizationId\)/);
  const nav = read('components/crm/crm-navigation.tsx');
  assert.match(nav, /href: '\/personas', label: 'Personas'/);
});
