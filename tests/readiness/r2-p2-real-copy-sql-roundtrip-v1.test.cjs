const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const { spawnSync } = require("node:child_process");
const { pathToFileURL } = require("node:url");
const ts = require("typescript");

// This is the actual deployed UI copy formatter -> actual offline operator
// parser. Existing tests covered each side independently with handwritten
// strings. No production credentials, tenant/session IDs or website requests.
const root = path.resolve(__dirname, "../..");
const script = path.join(root, "scripts/r2-p2-compare-review-figures.mjs");
const loadComparator = import(pathToFileURL(script).href);
const names = ["web.page_viewed", "web.form_started", "web.form_submitted"];
const sampledAt = "2026-11-06T16:45:00.000Z";
const EVENT_TOTALS = [40, 11, 5];
const EVENT_SESSIONS = [20, 9, 3];
const FUNNEL_SESSIONS = [12, 8, 4];

function loadFormatter(file, exportName) {
  const source = fs.readFileSync(path.join(root, file), "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const ctx = {
    exports: {},
    require(imported) {
      if (imported === "@/lib/native-behavior-contract") {
        // Use real contract names rather than invented fixture events.
        const contract = fs.readFileSync(path.join(root, "lib/native-behavior-contract.ts"), "utf8");
        const all = [...contract.matchAll(/\{ name: "(web\.[a-z_]+)", label:/g)]
          .map((match) => ({ name: match[1] }));
        assert.ok(all.length >= 10);
        return { BEHAVIOR_EVENTS: all };
      }
      throw new Error("Unrecognized formatter import");
    },
  };
  vm.runInNewContext(code, ctx, { timeout: 1000 });
  assert.equal(typeof ctx.exports[exportName], "function");
  return ctx.exports[exportName];
}

const funnelFormatter = loadFormatter(
  "lib/native-behavior-funnel-review-copy.ts", "formatNativeFunnelReviewCopy",
);
const trendsFormatter = loadFormatter(
  "lib/native-behavior-trends-review-copy.ts", "formatNativeBehaviorReviewCopy",
);

function utcDates(days) {
  const end = Date.parse("2026-11-06T00:00:00Z");
  return Array.from({ length: days }, (_, i) => new Date(
    end - (days - 1 - i) * 86_400_000,
  ).toISOString().slice(0, 10));
}
function funnelReport(days) {
  return {
    available: true,
    days,
    generatedAt: sampledAt,
    aggregationUnit: "source_scoped_visitor_session",
    selectedSteps: names,
    funnel: names.map((event_name, index) => ({
      event_name, sessions: FUNNEL_SESSIONS[index],
    })),
    pathSessions: 18,
    paths: [{
      from_path: "/courses/200-hour-ytt.php",
      to_path: "/enroll.php", sessions: 6, transitions: 9,
    }],
    organization_id: "NEVER-COPY-TENANT",
    anonymous_visitor_id: "NEVER-COPY-VISITOR",
    raw_url: "https://example.invalid/secret?token=NEVER-COPY",
  };
}
function trendsReport(days) {
  const dates = utcDates(days);
  return {
    available: true,
    windowDays: days,
    generatedAt: sampledAt,
    lastDayIncomplete: true,
    selectedEvents: names,
    series: names.map((eventName, index) => ({
      eventName,
      totalEvents: EVENT_TOTALS[index],
      observedSessions: EVENT_SESSIONS[index],
      days: dates.map((dateUtc, i) => ({
        dateUtc,
        events: i === 0 ? EVENT_TOTALS[index] : 0,
        sessions: i === 0 ? EVENT_SESSIONS[index] : 0,
      })),
    })),
    organization_id: "NEVER-COPY-TENANT",
    raw_url: "https://example.invalid/secret?token=NEVER-COPY",
  };
}
function funnelSql(days) {
  return {
    default_funnel_aggregates_only: {
      report: "r2_p2_default_funnel_aggregate_comparison_v1",
      status: "aggregate_comparison_only",
      window_days: days,
      sampled_at_utc: sampledAt,
      candidate_events: 140,
      funnel: names.map((event_name, index) => ({
        event_name, sessions: FUNNEL_SESSIONS[index],
      })),
      path_sessions: 18,
      uses_independent_ordering_check: true,
      is_path_edge_reconciliation: false,
      is_authenticated_role_test: false,
    },
  };
}
function trendsSql(days) {
  const dates = utcDates(days);
  return {
    tenant_aggregate_only: {
      report: "r2_p2_behavior_default_trends_reconcile_v1",
      status: "aggregate_comparison_only",
      window_days: days,
      sampled_at_utc: sampledAt,
      candidate_events: 140,
      first_day_utc: dates[0],
      last_day_utc: dates.at(-1),
      last_day_incomplete: true,
      series: names.map((event_name, index) => ({
        event_name,
        total_events: EVENT_TOTALS[index],
        observed_sessions: EVENT_SESSIONS[index],
        daily: dates.map((date_utc, i) => ({
          date_utc,
          events: i === 0 ? EVENT_TOTALS[index] : 0,
          sessions: i === 0 ? EVENT_SESSIONS[index] : 0,
        })),
      })),
      is_authenticated_role_test: false,
      is_funnel_or_path_reconciliation: false,
    },
  };
}

for (const days of [7, 14, 30]) {
  test("real UI funnel copy matches local SQL comparator for " + days + " days", async () => {
    const { parseUiCopy, parseSqlAggregate, compareAggregateReviews } = await loadComparator;
    const copy = funnelFormatter(funnelReport(days));
    assert.equal(typeof copy, "string");
    assert.doesNotMatch(copy, /NEVER-COPY|\/enroll\.php|example\.invalid/);
    const ui = parseUiCopy(copy);
    const sql = parseSqlAggregate(JSON.stringify(funnelSql(days)), "funnel");
    assert.equal(ui.days, days);
    assert.equal(compareAggregateReviews(ui, sql).status, "AGGREGATES_MATCHED_NOT_ACCEPTANCE");
  });
  test("real UI Event Activity copy matches local SQL comparator for " + days + " days", async () => {
    const { parseUiCopy, parseSqlAggregate, compareAggregateReviews } = await loadComparator;
    const copy = trendsFormatter(trendsReport(days));
    assert.equal(typeof copy, "string");
    assert.doesNotMatch(copy, /NEVER-COPY|example\.invalid/);
    const ui = parseUiCopy(copy);
    const sql = parseSqlAggregate(JSON.stringify(trendsSql(days)), "trends");
    assert.equal(ui.days, days);
    assert.equal(compareAggregateReviews(ui, sql).status, "AGGREGATES_MATCHED_NOT_ACCEPTANCE");
  });
}

test("actual UI copy never silently matches changed metrics, altered window or stale SQL", async () => {
  const { parseUiCopy, parseSqlAggregate, compareAggregateReviews } = await loadComparator;
  const ui = parseUiCopy(funnelFormatter(funnelReport(14)));
  const wrong = funnelSql(14);
  wrong.default_funnel_aggregates_only.funnel[2].sessions--;
  assert.equal(compareAggregateReviews(ui, parseSqlAggregate(JSON.stringify(wrong), "funnel")).status,
    "REVIEW_REQUIRED_NUMERIC_DIFFERENCE");

  const stale = trendsSql(7);
  stale.tenant_aggregate_only.sampled_at_utc = "2026-11-06T16:40:00Z";
  const trendUi = parseUiCopy(trendsFormatter(trendsReport(7)));
  assert.equal(compareAggregateReviews(trendUi, parseSqlAggregate(JSON.stringify(stale), "trends")).status,
    "REVIEW_REQUIRED_CAPTURE_DRIFT");
  assert.throws(() => compareAggregateReviews(ui,
    parseSqlAggregate(JSON.stringify(funnelSql(7)), "funnel")));
  assert.throws(() => compareAggregateReviews(ui,
    parseSqlAggregate(JSON.stringify(trendsSql(14)), "trends")));
});

test("actual formatter-to-offline CLI succeeds only for expected aggregate files", () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "r2-p2-real-formats-"));
  try {
    const clipboard = path.join(folder, "clipboard.txt");
    const snapshot = path.join(folder, "sql.json");
    fs.writeFileSync(clipboard, trendsFormatter(trendsReport(30)));
    fs.writeFileSync(snapshot, JSON.stringify(trendsSql(30)));
    const command = () => spawnSync(process.execPath, [script, "--ui", clipboard, "--sql", snapshot],
      { encoding: "utf8", timeout: 5000 });
    const pass = command();
    assert.equal(pass.status, 0, pass.stderr);
    assert.match(pass.stdout, /AGGREGATES_MATCHED_NOT_ACCEPTANCE/);
    assert.doesNotMatch(pass.stdout + pass.stderr, /NEVER-COPY|example\.invalid|40; identified/);
    const bad = trendsSql(30);
    bad.tenant_aggregate_only.organization_id = "NEVER-COPY-TENANT";
    fs.writeFileSync(snapshot, JSON.stringify(bad));
    const fail = command();
    assert.equal(fail.status, 1);
    assert.match(fail.stderr, /INPUT_REJECTED/);
    assert.doesNotMatch(fail.stdout + fail.stderr, /NEVER-COPY|organization_id/);
  } finally {
    fs.rmSync(folder, { recursive: true, force: true });
  }
});
