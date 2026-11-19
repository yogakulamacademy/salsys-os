const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (p) => fs.readFileSync(path.join(__dirname, '..', '..', p), 'utf8');

test('tracked links: migration keeps visit country separate and writes server-only', () => {
  const sql = read('supabase/migrations/20261119120000_dm_tracked_links_v1.sql');
  assert.match(sql, /create table if not exists public\.dm_tracked_links/);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /revoke insert, update, delete on public\.dm_tracked_links from anon, authenticated/);
  assert.match(sql, /grant execute on function public\.record_dm_link_visit_v1\(text, text, text, text, text\) to service_role/);
  assert.doesNotMatch(sql, /update public\.leads/i, 'never changes the lead country');
});

test('tracked links: short domain is routed publicly and the AI gets the link', () => {
  const mw = read('middleware.ts');
  assert.ok(mw.includes('function isCrmHost('));
  assert.ok(!mw.includes('yogakulamacademy'), 'no business is hardcoded in the middleware');
  assert.match(mw, /url\.pathname = `\/go\/\$\{code\}`/);
  const route = read('app/go/[code]/route.ts');
  assert.match(route, /findBusinessByLinkDomain/);
  assert.match(route, /domainOwner\.organizationId !== String\(link\.organization_id\)/);
  assert.ok(!route.includes('yogakulamacademy'), 'no business is hardcoded in the link route');
  const core = read('lib/copilot-core.ts');
  assert.match(core, /getOrCreateTrackedLink\(admin/);
  assert.match(core, /trackedCourseLink,/);
  assert.match(core, /\.dmLinksEnabled\)/);
  assert.match(core, /Full course details: <trackedCourseLink>/);
  const runner = read('lib/ai-autopilot-runner.ts');
  assert.match(runner, /queueUnopenedLinks\(ctx\)/);
  assert.match(runner, /created_by_id: "dm_link_no_open_v1"/);
});

test('website forms resolve the course from value, page and names', () => {
  const route = read('app/api/leads/browser/v1/route.ts');
  assert.match(route, /alias_type', 'page_path'/);
  assert.match(route, /course_name:page_title/);
  assert.match(route, /\\bclass\(es\)\?\\b/);
  assert.match(route, /general website offer/);
});
