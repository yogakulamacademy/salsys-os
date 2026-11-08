const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const sql = read("supabase/migrations/20261105220000_r2_p2_event_trends_v1.sql");
const loader = read("lib/native-behavior-trends-data.ts");
const ui = read("components/marketing/native-behavior-trends.tsx");
const marketing = read("app/marketing/canonical-workspace.tsx");
const explorer = read("components/marketing/native-behavior-explorer.tsx");
const fixture = read("tests/ui/fixture-server.mjs");
const browser = read("tests/ui/behavior-explorer.spec.ts");

test("R2-P2 event trends require active CRM membership and a bound tenant", () => {
  assert.match(sql, /security definer/i);
  assert.match(sql, /auth\.role\(\) <> 'authenticated'/);
  assert.match(sql, /public\.is_crm_user\(\)/);
  assert.match(sql, /public\.is_organization_member\(p_organization_id\)/);
  assert.match(sql, /e\.organization_id = p_organization_id/g);
  assert.match(sql, /revoke all on function public\.get_native_behavior_event_trends_v1\([\s\S]*?from public,anon;/i);
  assert.match(sql, /grant execute on function public\.get_native_behavior_event_trends_v1\([\s\S]*?to authenticated;/i);
  assert.match(loader, /requireCurrentOrganizationId\(supabase, auth\.user\.id\)/);
  assert.match(loader, /supabase\.auth\.getUser\(\)/);
});

test("Event names, range, cost and shape are bounded before reading any events", () => {
  assert.match(sql, /v_days not in \(7,14,30\)/);
  assert.match(sql, /cardinality\(p_events\) < 1/);
  assert.match(sql, /cardinality\(p_events\) > 5/);
  assert.match(sql, /count\(distinct event_name\)/);
  assert.match(sql, /c\.status = 'active'/);
  assert.match(sql, /c\.family_key = 'web'/);
  assert.match(sql, /limit 50001/);
  assert.match(sql, /if v_candidate_count > 50000/);
  assert.match(sql, /'volume_limit'/);
  assert.doesNotMatch(sql, /\b(create table|alter table|insert into|update public\.raw_events|delete from)\b/i);
});

test("Daily events use UTC and preserve independent event vs identified-session semantics", () => {
  assert.match(sql, /occurred_at at time zone 'UTC'/i);
  assert.match(sql, /received_at >= v_start_at - interval '1 day'/);
  assert.match(sql, /count\(\*\)::bigint as event_count/);
  assert.match(sql, /count\(distinct \(o\.tracking_source_id,o\.anonymous_visitor_id,o\.session_key\)\)/);
  assert.match(sql, /generated_at/);
  assert.match(sql, /last_day_incomplete/);
  assert.match(sql, /generate_series\(v_start::timestamp,v_today::timestamp,interval '1 day'\)/);
  assert.match(loader, /days\.reduce\(\(total, day\) => total \+ day\.events, 0\) !== totalEvents/);
  assert.match(ui, /These are not funnel conversions/);
  assert.match(ui, /not session counts|not funnel conversions|Identified sessions/i);
});

test("Server trend loader rejects impossible source-scoped session cardinality without treating cross-day reuse as error", () => {
  assert.match(loader, /days\.some\(\(day\) => day\.sessions > observedSessions\)/);
  assert.match(loader, /dailySessions < observedSessions/);
  assert.match(loader, /!Number\.isSafeInteger\(dailySessions\)/);
  assert.doesNotMatch(loader, /dailySessions !== observedSessions/);
  for (const state of [
    "trends-daily-session-exceeds-window",
    "trends-window-session-exceeds-daily",
  ]) {
    assert.ok(fixture.includes("'" + state + "'"), state);
    assert.ok(browser.includes('"' + state + '"'), state);
  }
  assert.match(browser, /Impossible daily\/window trend session counts fail closed/);
});

test("Trends remain a parallel read-only module; missing trends cannot erase funnels", () => {
  assert.match(marketing, /Promise\.all\(\[\s*getNativeBehaviorWorkspace\(request\),\s*getNativeBehaviorTrends/);
  assert.match(explorer, /<NativeBehaviorTrendsPanel trends=\{trends\} \/>/);
  assert.match(explorer, /export function NativeBehaviorExplorer/);
});

test("Synthetic browser scenarios validate tenant request and privacy-safe failure/empty states", () => {
  assert.match(fixture, /get_native_behavior_event_trends_v1/);
  assert.match(fixture, /body\.p_organization_id!==activeBehaviorOrganization\(\)/);
  assert.match(fixture, /const activeBehaviorOrganization=.*secondaryOrganizationId:organizationId/);
  assert.match(fixture, /behaviorScenario==='denied'/);
  assert.match(fixture, /behaviorScenario==='empty'/);
  assert.match(browser, /Event activity reads tenant-scoped UTC trends/);
  assert.match(browser, /Changing the funnel steps updates independent trends/);
  assert.match(browser, /width of \[390,768,1440\]/);
});
