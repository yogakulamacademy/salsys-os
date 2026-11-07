const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "../..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const sql = read("supabase/migrations/20261105230000_r2_p2_page_event_breakdowns_v1.sql");
const server = read("lib/native-behavior-breakdown-data.ts");
const contract = read("lib/native-behavior-contract.ts");
const panel = read("components/marketing/native-behavior-breakdown.tsx");
const marketing = read("app/marketing/canonical-workspace.tsx");
const fixture = read("tests/ui/fixture-server.mjs");
const browser = read("tests/ui/behavior-page-breakdowns.spec.ts");

test("Page event breakdown is authenticated and tenant-bound, with no new raw table grants", () => {
  assert.match(sql, /security definer/i);
  assert.match(sql, /auth\.role\(\) <> 'authenticated'/);
  assert.match(sql, /public\.is_crm_user\(\)/);
  assert.match(sql, /public\.is_organization_member\(p_organization_id\)/);
  assert.match(sql, /e\.organization_id = p_organization_id/g);
  assert.match(sql, /revoke all on function public\.get_native_behavior_page_breakdown_v1\([\s\S]*?from public,anon;/i);
  assert.match(sql, /grant execute on function public\.get_native_behavior_page_breakdown_v1\([\s\S]*?to authenticated;/i);
  assert.match(server, /requireCurrentOrganizationId\(supabase, auth\.user\.id\)/);
  assert.match(server, /supabase\.auth\.getUser\(\)/);
  assert.doesNotMatch(sql, /\b(insert into|alter table|delete from|update public\.raw_events)\b/i);
});

test("Report choices and volume are bounded and private URLs are excluded", () => {
  assert.match(sql, /v_days not in \(7,14,30\)/);
  assert.match(sql, /schema_version = 1/);
  assert.match(sql, /c\.status = 'active'/);
  assert.match(sql, /limit 50001/);
  assert.match(sql, /if v_candidate_count > 50000/);
  assert.match(sql, /limit 10/);
  assert.match(sql, /count\(distinct \(tracking_source_id,anonymous_visitor_id\)\)/);
  assert.match(sql, /having count\(distinct \(tracking_source_id,anonymous_visitor_id\)\)/);
  assert.match(sql, />= 3/);
  assert.match(sql, /native_safe_page_path_v2\(p_path\)/);
  assert.match(sql, /native_safe_behavior_breakdown_page_v1\('\/account\/billing\.php'\)/);
  assert.match(sql, /native_safe_behavior_breakdown_page_v1\('\/enroll\.php'\)/);
  assert.match(sql, /revoke all on function public\.native_safe_behavior_breakdown_page_v1\(text\)/);
  assert.match(server, /function safePath/);
  assert.match(server, /students\?/);
  assert.match(server, /leads\?/);
  assert.match(server, /item\.path/);
  assert.match(server, /visitors < 3/);
});

test("One event's observations are separated from session counts and withheld totals", () => {
  assert.match(sql, /count\(\*\)::bigint as total_events/);
  assert.match(sql, /count\(\*\) filter \(where safe_path <> '\/other'\)/);
  assert.match(sql, /'hidden_or_other_events',totals\.total_events-displayed\.events/);
  assert.match(sql, /'identified_sessions',totals\.identified_sessions/);
  assert.match(sql, /'timezone','UTC'/);
  assert.match(server, /displayedEvents \+ hiddenOrOtherEvents !== totalEvents/);
  assert.match(server, /sum !== displayedEvents/);
  assert.match(panel, /Other or withheld events/);
  assert.match(panel, /not a conversion attribution report/);
});

test("Breakdown stays a sibling to the independently available funnel, paths and trends", () => {
  assert.match(contract, /normalizeBehaviorBreakdownEvent/);
  assert.match(marketing, /getNativeBehaviorPageBreakdown/);
  assert.match(marketing, /getNativeBehaviorWorkspace\(request\)/);
  assert.match(marketing, /getNativeBehaviorTrends/);
  // Applied funnel request must remount only when its date/ordered steps change
  // so Back/Forward cannot leave draft controls inconsistent with the report.
  assert.match(marketing, /<NativeBehaviorExplorer\s+key=\{request\.days \+ ":" \+ request\.steps\.join\(","\)\}/);
  assert.match(marketing, /<NativeBehaviorExplorer[\s\S]*?workspace=\{workspace\}[\s\S]*?trends=\{trends\}[\s\S]*?\/>/);
  assert.match(marketing, /<NativeBehaviorBreakdownPanel breakdown=\{breakdown\}/);
  assert.match(panel, /<form method="get" action="\/marketing"/);
  assert.match(panel, /name="view" value="behavior"/);
  assert.match(panel, /name="days" value=\{String\(breakdown\.days\)\}/);
  assert.match(panel, /name="steps" value=\{appliedSteps\.join\(","\)\}/);
  assert.match(panel, /name="breakdown"/);
  assert.match(panel, /defaultValue=\{breakdown\.eventName\}/);
  assert.match(panel, /<button type="submit"/);
  assert.doesNotMatch(panel, /useEffect|router\.push|onClick=\{apply\}/);
  assert.doesNotMatch(panel, /^"use client";/);
  assert.match(panel, /role="status"/);
});

test("Synthetic browser integration covers small cohorts, tenant metadata and mobile", () => {
  assert.match(fixture, /get_native_behavior_page_breakdown_v1/);
  assert.match(fixture, /body\.p_organization_id!==activeBehaviorOrganization\(\)/);
  assert.match(fixture, /const activeBehaviorOrganization=.*secondaryOrganizationId:organizationId/);
  assert.match(fixture, /behaviorScenario==='small'/);
  assert.match(browser, /No event data and small-cohort evidence/);
  assert.match(browser, /Invalid breakdown parameter/);
  assert.match(browser, /width of \[390, 768, 1440\]/);
});
