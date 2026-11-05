const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const migration = read("supabase/migrations/20261105170000_r2_p2_native_behavior_explorer_v1.sql");
const server = read("lib/native-behavior-data.ts");
const contract = read("lib/native-behavior-contract.ts");
const client = read("components/marketing/native-behavior-explorer.tsx");
const marketing = read("app/marketing/canonical-workspace.tsx");

test("native explorer stays behind CRM authentication, organization binding and explicit grants", () => {
  assert.match(migration, /security definer/i);
  assert.match(migration, /auth\.role\(\) <> 'authenticated'/);
  assert.match(migration, /public\.is_crm_user\(\)/);
  assert.match(migration, /public\.is_organization_member\(p_organization_id\)/);
  assert.match(migration, /revoke all on function public\.get_native_behavior_workspace_v1\([\s\S]*?from public, anon;/i);
  assert.match(migration, /grant execute on function public\.get_native_behavior_workspace_v1\([\s\S]*?to authenticated;/i);
  assert.match(server, /requireCurrentOrganizationId/);
  assert.match(server, /supabase\.auth\.getUser/);
  assert.doesNotMatch(client, /createAdminClient|service_role|raw_events/);
});

test("native explorer enforces bounded periods, registered steps, and stable sequence ordering", () => {
  assert.match(migration, /v_days not in \(7, 14, 30\)/);
  assert.match(migration, /cardinality\(p_steps\) < 2 or cardinality\(p_steps\) > 5/);
  assert.match(migration, /count\(distinct event_name\)/);
  assert.match(migration, /c\.status = 'active'/);
  assert.match(migration, /array_agg\(e\.source_event_type order by e\.occurred_at, e\.id\)/);
  assert.match(migration, /limit 50001/);
  assert.match(migration, /event_volume_limit|volume_limit/);
  assert.match(migration, /R2-P2 ordered funnel failed complete sequence test/);
  assert.match(migration, /R2-P2 ordered funnel incorrectly counted out-of-order events/);
  assert.match(contract, /DEFAULT_BEHAVIOR_STEPS/);
  assert.match(contract, /new Set\(steps\)\.size === steps\.length/);
});

test("navigation aggregates do not expose visitors and hide small/sensitive paths", () => {
  assert.match(migration, /count\(distinct \(tracking_source_id, session_key, anonymous_visitor_id\)\)/);
  assert.match(migration, /having count\(distinct \(tracking_source_id, session_key, anonymous_visitor_id\)\) >= 3/);
  assert.match(migration, /safe_path <> '\/other'/);
  assert.match(migration, /limit 12/);
  assert.doesNotMatch(migration, /jsonb_build_object\([^)]*anonymous_visitor_id/);
  assert.match(client, /Potentially sensitive URL paths are excluded/);
});

test("SalsysOS exposes the behavior workspace without replacing existing CRM funnel", () => {
  assert.match(marketing, /MarketingView = .*"behavior"/);
  assert.match(marketing, /view === "behavior" \? <BehaviorView/);
  assert.match(marketing, /view === "funnel" \? <FunnelView/);
  assert.match(marketing, /getNativeBehaviorWorkspace\(request\)/);
  assert.match(client, /router\.push\("\/marketing\?" \+ search\.toString\(\)\)/);
  assert.match(client, /role="status"/);
});
