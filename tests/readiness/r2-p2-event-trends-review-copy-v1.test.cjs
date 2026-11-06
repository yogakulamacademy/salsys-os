const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const root = path.resolve(__dirname, "../..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const helper = read("lib/native-behavior-trends-review-copy.ts");
const panel = read("components/marketing/native-behavior-trends.tsx");
const browser = read("tests/ui/behavior-explorer.spec.ts");
const js = ts.transpileModule(helper, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const sandbox = { exports: {} };
vm.runInNewContext(js, sandbox, { timeout: 1000 });
const format = sandbox.exports.formatNativeBehaviorReviewCopy;

const dateRange = ["2026-10-31","2026-11-01","2026-11-02",
  "2026-11-03","2026-11-04","2026-11-05","2026-11-06"];
function fixture() {
  return {
    available: true,
    windowDays: 7,
    generatedAt: "2026-11-06T10:20:00Z",
    lastDayIncomplete: true,
    selectedEvents: ["web.page_viewed","web.form_started"],
    series: [
      { eventName: "web.page_viewed", totalEvents: 12, observedSessions: 7,
        days: dateRange.map((dateUtc, i) => ({dateUtc,events:i===6?6:1,sessions:1})) },
      { eventName: "web.form_started", totalEvents: 2, observedSessions: 2,
        days: dateRange.map((dateUtc, i) => ({dateUtc,events:i<2?1:0,sessions:i<2?1:0})) },
    ],
    message: null,
  };
}
test("Explicit review copy includes only period, report timestamp and independent event/session totals", () => {
  const report = fixture();
  const output = format(report);
  assert.ok(output);
  assert.match(output, /Status: dashboard observation, NOT acceptance or SQL reconciliation/);
  assert.match(output, /UTC calendar window: 7 days \(2026-10-31 through 2026-11-06\)/);
  assert.match(output, /Report generated: 2026-11-06T10:20:00Z/);
  assert.match(output, /web\.page_viewed: events=12; identified_sessions=7/);
  assert.match(output, /web\.form_started: events=2; identified_sessions=2/);
  assert.match(output, /Current UTC day incomplete: yes/);
  assert.doesNotMatch(output, /ordered funnel conversion rate/i);
});

test("Review copy uses an allowlist and excludes injected tenant, source, session, visitor and URL fields", () => {
  const report = fixture();
  report.organization_id = "DO-NOT-COPY-TENANT-UUID";
  report.session_key = "DO-NOT-COPY-SESSION";
  report.visitor_id = "DO-NOT-COPY-VISITOR";
  report.tracking_source_id = "DO-NOT-COPY-SOURCE";
  report.pathname = "/private?email=DO-NOT-COPY";
  report.series[0].raw_payload = "DO-NOT-COPY-PRIVATE-PAYLOAD";
  const output = format(report);
  for (const value of [
    "DO-NOT-COPY", "/private", "organization_id", "session_key",
    "tracking_source_id", "raw_payload",
  ]) assert.equal(output.includes(value),false,value);
});

test("Event Activity copy accepts full ISO UTC/offset timestamps only", () => {
  const valid = fixture();
  for (const stamp of [
    "2026-11-06T10:20:00Z",
    "2026-11-06T10:20:00.123Z",
    "2026-11-06T15:50:00+05:30",
  ]) {
    const report = structuredClone(valid);
    report.generatedAt = stamp;
    assert.match(format(report), new RegExp("Report generated: " + stamp.replace(/[.*+?^${}()|[\\]\\]/g, "\\test("Unavailable, malformed or untrusted reports are not copyable", () => {")));
  }
});

test("Event Activity copy rejects valid-looking timestamp prefixes with additional text", () => {
  const report = fixture();
  for (const unsafe of [
    "2026-11-06T10:20:00Z\\nSECRET_TOKEN",
    "2026-11-06T10:20:00Z https://site.invalid/?token=SECRET",
    "2026-11-06T10:20:00Z#SECRET",
    "2026-11-06T10:20:00Z\\r\\nSECRET",
    "2026-11-06T10:20:00",
    "2026-11-06T10:20:00+99:99",
    "not-a-timestamp",
    "2026-11-06T10:20:00Z" + "x".repeat(200),
  ]) {
    const clone = structuredClone(report);
    clone.generatedAt = unsafe;
    assert.equal(format(clone), null, unsafe.slice(0, 40));
  }
});

test("Unavailable, malformed or untrusted reports are not copyable", () => {
  const valid = fixture();
  const changes = [
    (r)=>{r.available=false;},
    (r)=>{r.generatedAt=null;},
    (r)=>{r.series=[];},
    (r)=>{r.windowDays=99;},
    (r)=>{r.series[0].totalEvents=null;},
    (r)=>{r.series[0].observedSessions=13;},
    (r)=>{r.series[0].eventName="web.page_viewed\naccess_token=secret";},
    (r)=>{r.series[1].days[0].dateUtc="2026-01-01";},
  ];
  for (const modify of changes) {
    const report = structuredClone(valid);
    modify(report);
    assert.equal(format(report), null);
  }
});

test("Only an explicit client click can write to the clipboard; unavailable report omits action", () => {
  assert.match(panel, /"use client"/);
  assert.match(panel, /navigator\.clipboard\.writeText\(reviewCopy\)/);
  assert.match(panel, /onClick=\{copyReviewFigures\}/);
  assert.match(panel, /\{reviewCopy \? \(/);
  assert.match(panel, /Clipboard unavailable; no data copied/);
  assert.match(browser, /Copy Event activity review figures/);
});
