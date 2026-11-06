const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const root = path.resolve(__dirname, "../..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const helper = read("lib/native-behavior-funnel-review-copy.ts");
const browser = read("components/marketing/native-behavior-explorer.tsx");
const ui = read("tests/ui/behavior-explorer.spec.ts");
const contract = read("lib/native-behavior-contract.ts");

// The review helper is executed as transpiled TypeScript in an isolated Node VM;
// the sole runtime import is the exact approved event list from this repository.
const names = [...contract.matchAll(/\{ name: "(web\.[a-z_]+)", label:/g)].map((m) => m[1]);
assert.ok(names.length >= 10);
const script = ts.transpileModule(helper, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const context = {
  exports: {},
  require(name) {
    if (name === "@/lib/native-behavior-contract") {
      return { BEHAVIOR_EVENTS: names.map((name) => ({ name })) };
    }
    throw new Error("Unexpected helper dependency: " + name);
  },
};
vm.runInNewContext(script, context, { timeout: 1000 });
const format = context.exports.formatNativeFunnelReviewCopy;

function fixture() {
  return {
    available: true,
    message: null,
    days: 14,
    generatedAt: "2026-11-06T11:20:00Z",
    aggregationUnit: "source_scoped_visitor_session",
    selectedSteps: ["web.page_viewed", "web.form_started", "web.form_submitted"],
    funnel: [
      { event_name: "web.page_viewed", sessions: 12 },
      { event_name: "web.form_started", sessions: 8 },
      { event_name: "web.form_submitted", sessions: 4 },
    ],
    pathSessions: 18,
    paths: [{ from_path: "/courses/200-hour-ytt.php", to_path: "/enroll.php", sessions: 6, transitions: 9 }],
    minPathVisitors: 3,
    minPathSessions: 3,
  };
}

test("Funnel review exports only rolling window, snapshot timestamp and ordered aggregate sessions", () => {
  const output = format(fixture());
  assert.ok(output);
  assert.match(output, /Status: dashboard observation, NOT owner\/admin acceptance or SQL reconciliation/);
  assert.match(output, /Rolling observation window: 14 days \(not UTC calendar-day Event Activity\)/);
  assert.match(output, /Report generated: 2026-11-06T11:20:00Z/);
  assert.match(output, /Step 1: web\.page_viewed; ordered_sessions=12/);
  assert.match(output, /Step 2: web\.form_started; ordered_sessions=8/);
  assert.match(output, /Step 3: web\.form_submitted; ordered_sessions=4/);
  assert.match(output, /Observed page-view sessions denominator: 18/);
  assert.doesNotMatch(output, /visitor_id|tenant_uuid|conversion_rate/);
});

test("Funnel review never copies arbitrary paths, tenant IDs, source IDs or event payload fields", () => {
  const report = fixture();
  report.organization_id = "SECRET_TENANT";
  report.anonymous_visitor_id = "SECRET_VISITOR";
  report.session_key = "SECRET_SESSION";
  report.tracking_source_id = "SECRET_SOURCE";
  report.raw_url = "https://site.invalid/private?token=SECRET_URL";
  report.funnel[0].payload = "SECRET_PAYLOAD";
  const output = format(report);
  assert.ok(output);
  for (const forbidden of [
    "SECRET_", "/courses/200-hour-ytt.php", "/enroll.php", "site.invalid",
    "organization_id", "session_key", "tracking_source_id", "anonymous_visitor_id",
  ]) assert.equal(output.includes(forbidden), false, forbidden);
});

test("Unavailable, malformed, incorrect-order and injected event reports cannot be copied", () => {
  const changes = [
    (x) => { x.available = false; },
    (x) => { x.generatedAt = null; },
    (x) => { x.generatedAt = "2026-11-06\nSECRET"; },
    (x) => { x.generatedAt = "wrong timestamp"; },
    (x) => { x.days = 99; },
    (x) => { x.aggregationUnit = "global"; },
    (x) => { x.selectedSteps = []; },
    (x) => { x.selectedSteps[2] = "web.page_viewed"; },
    (x) => { x.selectedSteps[1] = "web.unknown_event"; x.funnel[1].event_name = "web.unknown_event"; },
    (x) => { x.selectedSteps[1] = "web.page_viewed\nSECRET"; x.funnel[1].event_name = "web.page_viewed\nSECRET"; },
    (x) => { x.funnel[1].event_name = "web.cta_clicked"; },
    (x) => { x.funnel[0].sessions = -1; },
    (x) => { x.funnel[0].sessions = 4.5; },
    (x) => { x.funnel[0].sessions = Number.MAX_SAFE_INTEGER + 1; },
    (x) => { x.funnel[1].sessions = 13; },
    (x) => { x.funnel.pop(); },
    (x) => { x.pathSessions = -1; },
  ];
  for (const change of changes) {
    const report = structuredClone(fixture());
    change(report);
    assert.equal(format(report), null);
  }
});

test("Clipboard requires an explicit click and never appears for denied funnel results", () => {
  assert.match(browser, /"use client"/);
  assert.match(browser, /onClick=\{copyFunnelReviewFigures\}/);
  assert.match(browser, /navigator\.clipboard\.writeText\(funnelReviewCopy\)/);
  assert.match(browser, /\{funnelReviewCopy \? \(/);
  assert.match(browser, /Clipboard unavailable; no data copied/);
  assert.match(ui, /Copy ordered funnel review figures/);
});
