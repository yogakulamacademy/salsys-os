const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const read = (pathName) => fs.readFileSync(path.join(root, pathName), "utf8");
const migration = read("supabase/migrations/20261105171000_r2_p2_public_page_paths_v2.sql");
const server = read("lib/native-behavior-data.ts");
const explorer = read("components/marketing/native-behavior-explorer.tsx");

test("legacy public routes accepted while sensitive/dynamic variants remain excluded", () => {
  assert.match(migration, /native_safe_page_path_v2\(p_path text\)/);
  assert.match(migration, /php\|html\?/);
  assert.match(migration, /R2-P2 safe \.php route was rejected/);
  assert.match(migration, /R2-P2 safe \.html route was rejected/);
  assert.match(migration, /R2-P2 query string leaked/);
  assert.match(migration, /R2-P2 dynamic numeric route leaked/);
  assert.match(migration, /R2-P2 hex identifier leaked/);
  assert.match(migration, /R2-P2 email-bearing route leaked/);
  assert.match(migration, /R2-P2 encoded route leaked/);
  assert.match(migration, /revoke all on function public\.native_safe_page_path_v2\(text\)[\s\S]*?from public, anon, authenticated;/i);
  assert.match(server, /function safePublicPath\(value: string\)/);
  assert.match(server, /isPublicPage =/);
  assert.match(server, /safePublicPath\(from\) \|\| !safePublicPath\(to\)/);
});

test("path edges require distinct visitors, no individual identifiers, and small aggregate output", () => {
  assert.match(migration, /having count\(distinct \(tracking_source_id, anonymous_visitor_id\)\) >= 3/i);
  assert.match(migration, /count\(distinct \(tracking_source_id, session_key, anonymous_visitor_id\)\)::bigint as sessions/);
  assert.match(migration, /'path_min_visitors', 3/);
  assert.match(migration, /limit 12/);
  assert.match(migration, /limit 50001/);
  assert.doesNotMatch(migration, /'anonymous_visitor_id',\s*anonymous_visitor_id/);
  assert.match(explorer, /distinct tracked visitor IDs/);
  assert.match(explorer, /not verified people or physical devices/);
  assert.match(server, /minPathVisitors:/);
});

test("RPC retains tenant, source, authorization and privacy boundaries", () => {
  assert.match(migration, /auth\.role\(\) <> 'authenticated'/);
  assert.match(migration, /public\.is_crm_user\(\)/);
  assert.match(migration, /public\.is_organization_member\(p_organization_id\)/);
  assert.match(migration, /e\.organization_id = p_organization_id/);
  assert.match(migration, /partition by tracking_source_id, session_key, anonymous_visitor_id/);
  assert.match(migration, /public\.native_safe_page_path_v2\(e\.payload ->> 'pagePath'\) as safe_path/);
  assert.match(migration, /revoke all on function public\.get_native_behavior_workspace_v1\(uuid, integer, text\[\]\)[\s\S]*?from public, anon;/i);
  assert.match(migration, /grant execute on function public\.get_native_behavior_workspace_v1\(uuid, integer, text\[\]\)[\s\S]*?to authenticated;/i);
  assert.match(migration, /'volume_limit'/);
});
