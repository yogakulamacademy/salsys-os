const test = require("node:test");
const assert = require("node:assert/strict");
const { pathToFileURL } = require("node:url");
const path = require("node:path");
const { mkdtempSync, writeFileSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { spawnSync } = require("node:child_process");

const script = path.resolve(__dirname,"../../scripts/r2-p2-compare-review-figures.mjs");
const load = import(pathToFileURL(script).href);
const events = ["web.page_viewed","web.form_started","web.form_submitted"];
const ts = "2026-11-06T14:19:19.000Z";

function funnelUi() {
  return [
    "SalsysOS R2 | Ordered funnel review figures",
    "Status: dashboard observation, NOT owner/admin acceptance or SQL reconciliation",
    "Rolling observation window: 14 days (not UTC calendar-day Event Activity)",
    "Report generated: " + ts,
    "Aggregation: source-scoped anonymous visitor and session",
    "Step 1: web.page_viewed; ordered_sessions=12",
    "Step 2: web.form_started; ordered_sessions=8",
    "Step 3: web.form_submitted; ordered_sessions=4",
    "Observed page-view sessions denominator: 15",
    "Counts show ordered observed sessions, not independent event totals, unique people, CRM leads, payments or enrollment.",
    "Compare only against the authorized tenant-scoped rolling funnel SQL for the same observation period.",
    "No tenant, visitor, session or source identifiers, paths or URLs are included.",
  ].join("\n");
}
function funnelSql() {
  return {
    report:"r2_p2_default_funnel_aggregate_comparison_v1",
    status:"aggregate_comparison_only",
    window_days:14,
    sampled_at_utc:ts,
    candidate_events:101,
    funnel:events.map((event_name,i)=>({event_name,sessions:[12,8,4][i]})),
    path_sessions:15,
    uses_independent_ordering_check:true,
    is_authenticated_role_test:false,
    is_path_edge_reconciliation:false,
  };
}
function trendUi() {
  return [
    "SalsysOS R2 | Event activity review figures",
    "Status: dashboard observation, NOT acceptance or SQL reconciliation",
    "UTC calendar window: 7 days (2026-10-31 through 2026-11-06)",
    "Report generated: "+ts,
    "Current UTC day incomplete: yes",
    "web.page_viewed: events=40; identified_sessions=20",
    "web.form_started: events=11; identified_sessions=9",
    "web.form_submitted: events=5; identified_sessions=3",
    "Semantics: independent observed event counts, not ordered funnel conversions or payments.",
    "Reconcile with authorized tenant-scoped SQL from the same observation period.",
    "This copy contains no tenant, visitor, source or session identifiers, or URLs.",
  ].join("\n");
}
function trendSql() {
  const dates=["2026-10-31","2026-11-01","2026-11-02","2026-11-03","2026-11-04","2026-11-05","2026-11-06"];
  const totals=[40,11,5], sessions=[20,9,3];
  return {
    report:"r2_p2_behavior_default_trends_reconcile_v1",
    status:"aggregate_comparison_only",
    window_days:7,sampled_at_utc:ts,candidate_events:56,
    first_day_utc:dates[0],last_day_utc:dates.at(-1),last_day_incomplete:true,
    series:events.map((event_name,i)=>({
      event_name,total_events:totals[i],observed_sessions:sessions[i],
      daily:dates.map((date_utc,j)=>({date_utc,events:j===0?totals[i]:0,sessions:j===0?sessions[i]:0})),
    })),
    is_authenticated_role_test:false,
    is_funnel_or_path_reconciliation:false,
  };
}

test("Exact matching aggregate-only rolling funnel returns a non-acceptance comparison result",async()=>{
  const {parseUiCopy,parseSqlAggregate,compareAggregateReviews}=await load;
  const ui=parseUiCopy(funnelUi()),sql=parseSqlAggregate(JSON.stringify(funnelSql()),"funnel");
  assert.deepEqual(compareAggregateReviews(ui,sql),{
    status:"AGGREGATES_MATCHED_NOT_ACCEPTANCE",skewSeconds:0,mismatched:[],
  });
});

test("Same-window mismatch and stale sampling never return matched approval",async()=>{
  const {parseUiCopy,parseSqlAggregate,compareAggregateReviews}=await load;
  const ui=parseUiCopy(funnelUi());
  const wrong=funnelSql(); wrong.funnel[2].sessions=3;
  const mismatch=compareAggregateReviews(ui,parseSqlAggregate(JSON.stringify(wrong),"funnel"));
  assert.equal(mismatch.status,"REVIEW_REQUIRED_NUMERIC_DIFFERENCE");
  assert.deepEqual(mismatch.mismatched,["web.form_submitted"]);

  const stale=funnelSql();stale.sampled_at_utc="2026-11-06T14:10:00Z";
  const drift=compareAggregateReviews(ui,parseSqlAggregate(JSON.stringify(stale),"funnel"));
  assert.equal(drift.status,"REVIEW_REQUIRED_CAPTURE_DRIFT");
  assert.ok(drift.skewSeconds>120);
});

test("Event Activity's UTC calendar comparison differs from rolling funnel semantics",async()=>{
  const {parseUiCopy,parseSqlAggregate,compareAggregateReviews}=await load;
  const ui=parseUiCopy(trendUi());
  const sql=parseSqlAggregate(JSON.stringify({tenant_aggregate_only:trendSql()}),"trends");
  assert.equal(compareAggregateReviews(ui,sql).status,"AGGREGATES_MATCHED_NOT_ACCEPTANCE");
  const wrong=trendSql();wrong.series[1].observed_sessions=8;
  const mismatch=compareAggregateReviews(ui,parseSqlAggregate(JSON.stringify(wrong),"trends"));
  assert.equal(mismatch.status,"REVIEW_REQUIRED_NUMERIC_DIFFERENCE");
  assert.deepEqual(mismatch.mismatched,["web.form_started"]);
  wrong.series[1].observed_sessions=9; wrong.first_day_utc="2026-11-01";
  assert.equal(compareAggregateReviews(ui,parseSqlAggregate(JSON.stringify(wrong),"trends")).status,"REVIEW_REQUIRED_NUMERIC_DIFFERENCE");
});

test("Input rejects extra identifiers, malformed counts, wrong SQL status and wrong report classes",async()=>{
  const {parseUiCopy,parseSqlAggregate,compareAggregateReviews}=await load;
  const withSecret=funnelSql(); withSecret.organization_id="SECRET_TENANT";
  assert.throws(()=>parseSqlAggregate(JSON.stringify(withSecret),"funnel"));
  const unsafe=funnelSql();unsafe.status="volume_limit";
  assert.throws(()=>parseSqlAggregate(JSON.stringify(unsafe),"funnel"));
  const bypass=funnelSql();bypass.is_authenticated_role_test=true;
  assert.throws(()=>parseSqlAggregate(JSON.stringify(bypass),"funnel"));
  const type=funnelSql();type.funnel[1].sessions=13;
  assert.throws(()=>parseSqlAggregate(JSON.stringify(type),"funnel"));
  const overLimit=funnelSql();overLimit.candidate_events=50001;
  assert.throws(()=>parseSqlAggregate(JSON.stringify(overLimit),"funnel"));
  assert.throws(()=>parseUiCopy(funnelUi()+"\nuser_token=SECRET_TOKEN"));
  assert.throws(()=>parseUiCopy(funnelUi().replace("ordered_sessions=8","ordered_sessions=8.1")));
  assert.throws(()=>parseUiCopy(funnelUi().replace("Step 2: web.form_started","Step 2: web.unknown")));
  assert.throws(()=>compareAggregateReviews(parseUiCopy(funnelUi()),parseSqlAggregate(JSON.stringify(trendSql()),"trends")));
  assert.throws(()=>parseSqlAggregate(JSON.stringify(funnelSql()),"trends"));
});

test("CLI prints only aggregate status, never input contents, and rejects invalid files",()=>{
  const root=mkdtempSync(path.join(tmpdir(),"r2-p2-synthetic-review-"));
  try {
    const uiPath=path.join(root,"ui.txt"), sqlPath=path.join(root,"sql.json");
    writeFileSync(uiPath,funnelUi());
    writeFileSync(sqlPath,JSON.stringify({default_funnel_aggregates_only:funnelSql()}));
    const ok=spawnSync(process.execPath,[script,"--ui",uiPath,"--sql",sqlPath],{encoding:"utf8",timeout:5000});
    assert.equal(ok.status,0,ok.stderr);
    assert.match(ok.stdout,/AGGREGATES_MATCHED_NOT_ACCEPTANCE/);
    assert.doesNotMatch(ok.stdout,/12|15|SECRET_TENANT|https?:\/\//);
    writeFileSync(sqlPath,JSON.stringify({...funnelSql(),organization_id:"SECRET_TENANT"}));
    const rejected=spawnSync(process.execPath,[script,"--ui",uiPath,"--sql",sqlPath],{encoding:"utf8",timeout:5000});
    assert.equal(rejected.status,1);
    assert.match(rejected.stderr,/INPUT_REJECTED/);
    assert.doesNotMatch(rejected.stdout+rejected.stderr,/SECRET_TENANT|organization_id/);
  } finally { rmSync(root,{recursive:true,force:true}); }
});
