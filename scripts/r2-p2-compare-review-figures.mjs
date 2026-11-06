#!/usr/bin/env node
// R2-P2 local-only acceptance aid. No network, database, authentication or writes.
// No customer identifiers or raw input lines are printed.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_EVENTS = ["web.page_viewed", "web.form_started", "web.form_submitted"];
const MAX_CAPTURE_SKEW_MS = 120_000;
const validWindow = (n) => [7, 14, 30].includes(n);
const safeCount = (n) => Number.isSafeInteger(n) && n >= 0;
const assert = (condition) => { if (!condition) throw new Error("invalid aggregate-only input"); };
const timestamp = (s) => {
  assert(typeof s === "string" && s.length <= 40
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(s));
  const ms = Date.parse(s);
  assert(Number.isFinite(ms));
  return ms;
};
const UTC_DAY_MS = 86_400_000;
const utcDayStart = (day) => {
  assert(typeof day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(day));
  const ms = Date.parse(day + "T00:00:00Z");
  assert(Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === day);
  return ms;
};
const expectedUtcDays = (first, last, days, sampledAtMs) => {
  assert(validWindow(days));
  const firstMs = utcDayStart(first), lastMs = utcDayStart(last);
  // The date range must be complete, contiguous and match the capture's
  // actual UTC day. A first/last-only comparison can hide a missing middle day.
  assert(lastMs - firstMs === (days - 1) * UTC_DAY_MS);
  assert(new Date(sampledAtMs).toISOString().slice(0, 10) === last);
  return Array.from({ length: days }, (_, i) =>
    new Date(firstMs + i * UTC_DAY_MS).toISOString().slice(0, 10));
};

const noExtraKeys = (obj, fields) => {
  assert(obj !== null && typeof obj === "object" && !Array.isArray(obj));
  assert(Object.keys(obj).every((key) => fields.includes(key)));
};
const readCount = (value) => {
  assert(/^(?:0|[1-9]\d{0,14})$/.test(value));
  const number = Number(value);
  assert(safeCount(number));
  return number;
};

export function parseUiCopy(text) {
  assert(typeof text === "string" && text.length <= 8192);
  const lines = text.trim().split(/\r?\n/);
  if (lines[0] === "SalsysOS R2 | Ordered funnel review figures") {
    assert(lines[1] === "Status: dashboard observation, NOT owner/admin acceptance or SQL reconciliation");
    const window = /^Rolling observation window: (7|14|30) days \(not UTC calendar-day Event Activity\)$/.exec(lines[2] || "");
    assert(window);
    const sampledAt = /^Report generated: (.+)$/.exec(lines[3] || "");
    assert(sampledAt && lines[4] === "Aggregation: source-scoped anonymous visitor and session");
    const stepLines = lines.slice(5, -4);
    assert(stepLines.length === 3 && lines.length === 12);
    const steps = stepLines.map((line, index) => {
      const match = /^Step ([1-5]): (web\.[a-z_]+); ordered_sessions=(0|[1-9]\d*)$/.exec(line);
      assert(match && Number(match[1]) === index + 1 && match[2] === DEFAULT_EVENTS[index]);
      return readCount(match[3]);
    });
    assert(steps.every((n, i) => i === 0 || n <= steps[i-1]));
    const denominator = /^Observed page-view sessions denominator: (0|[1-9]\d*)$/.exec(lines[8] || "");
    assert(denominator);
    const pathSessions = readCount(denominator[1]);
    assert(pathSessions >= steps[0]);
    assert(lines[9] === "Counts show ordered observed sessions, not independent event totals, unique people, CRM leads, payments or enrollment.");
    assert(lines[10] === "Compare only against the authorized tenant-scoped rolling funnel SQL for the same observation period.");
    assert(lines[11] === "No tenant, visitor, session or source identifiers, paths or URLs are included.");
    return { kind: "funnel", days: Number(window[1]), sampledAt: timestamp(sampledAt[1]), counts: steps, pathSessions };
  }
  if (lines[0] === "SalsysOS R2 | Event activity review figures") {
    assert(lines.length === 11);
    assert(lines[1] === "Status: dashboard observation, NOT acceptance or SQL reconciliation");
    const range = /^UTC calendar window: (7|14|30) days \((\d{4}-\d{2}-\d{2}) through (\d{4}-\d{2}-\d{2})\)$/.exec(lines[2] || "");
    const sampledAt = /^Report generated: (.+)$/.exec(lines[3] || "");
    assert(range && sampledAt);
    const incomplete = /^Current UTC day incomplete: (yes|no)$/.exec(lines[4] || "");
    assert(incomplete);
    const series = lines.slice(5,8).map((line,i) => {
      const match = /^(web\.[a-z_]+): events=(0|[1-9]\d*); identified_sessions=(0|[1-9]\d*)$/.exec(line);
      assert(match && match[1] === DEFAULT_EVENTS[i]);
      const total = readCount(match[2]), sessions = readCount(match[3]);
      assert(sessions <= total);
      return { event_name: match[1], total_events: total, observed_sessions: sessions };
    });
    assert(lines[8] === "Semantics: independent observed event counts, not ordered funnel conversions or payments.");
    assert(lines[9] === "Reconcile with authorized tenant-scoped SQL from the same observation period.");
    assert(lines[10] === "This copy contains no tenant, visitor, source or session identifiers, or URLs.");
    const capture = timestamp(sampledAt[1]);
    expectedUtcDays(range[2], range[3], Number(range[1]), capture);
    return { kind: "trends", days: Number(range[1]), sampledAt: capture, firstDay: range[2], lastDay: range[3], lastDayIncomplete: incomplete[1] === "yes", series };
  }
  throw new Error("unrecognized report type");
}

export function parseSqlAggregate(text, kind) {
  assert(typeof text === "string" && text.length <= 64_000);
  let data = JSON.parse(text);
  const wrapper = kind === "funnel" ? "default_funnel_aggregates_only" : "tenant_aggregate_only";
  if (data && typeof data === "object" && Object.keys(data).length === 1 && Object.hasOwn(data, wrapper)) data = data[wrapper];
  const shared = ["report","status","window_days","sampled_at_utc","candidate_events","is_authenticated_role_test"];
  const allowed = kind === "funnel"
    ? [...shared,"funnel","path_sessions","uses_independent_ordering_check","is_path_edge_reconciliation"]
    : [...shared,"first_day_utc","last_day_utc","last_day_incomplete","series","is_funnel_or_path_reconciliation"];
  noExtraKeys(data, allowed);
  assert(data.status === "aggregate_comparison_only"
    && validWindow(data.window_days)
    && safeCount(data.candidate_events) && data.candidate_events <= 50_000
    && data.is_authenticated_role_test === false
    && typeof data.report === "string");
  if (kind === "funnel") {
    assert(data.report === "r2_p2_default_funnel_aggregate_comparison_v1"
      && data.uses_independent_ordering_check === true
      && data.is_path_edge_reconciliation === false
      && safeCount(data.path_sessions)
      && Array.isArray(data.funnel) && data.funnel.length === 3);
    const steps = data.funnel.map((step,i) => {
      noExtraKeys(step, ["event_name","sessions"]);
      assert(step.event_name === DEFAULT_EVENTS[i] && safeCount(step.sessions));
      return step.sessions;
    });
    assert(steps.every((n,i) => i===0 || n<=steps[i-1]));
    assert(data.path_sessions>=steps[0]);
    return { kind, days:data.window_days, sampledAt:timestamp(data.sampled_at_utc), counts:steps, pathSessions:data.path_sessions };
  }
  assert(data.report === "r2_p2_behavior_default_trends_reconcile_v1"
    && data.is_funnel_or_path_reconciliation === false
    && typeof data.first_day_utc === "string"
    && typeof data.last_day_utc === "string"
    && /^\d{4}-\d{2}-\d{2}$/.test(data.first_day_utc)
    && /^\d{4}-\d{2}-\d{2}$/.test(data.last_day_utc)
    && data.last_day_incomplete === true
    && Array.isArray(data.series) && data.series.length === 3);
  const capture = timestamp(data.sampled_at_utc);
  const dates = expectedUtcDays(
    data.first_day_utc, data.last_day_utc, data.window_days, capture,
  );
  const series = data.series.map((row,i) => {
    noExtraKeys(row, ["event_name","total_events","observed_sessions","daily"]);
    assert(row.event_name === DEFAULT_EVENTS[i]
      && safeCount(row.total_events) && safeCount(row.observed_sessions)
      && row.observed_sessions <= row.total_events
      && Array.isArray(row.daily) && row.daily.length === data.window_days);
    let dailyTotal = 0;
    row.daily.forEach((day, dayIndex) => {
      noExtraKeys(day,["date_utc","events","sessions"]);
      assert(day.date_utc === dates[dayIndex]
        && safeCount(day.events) && safeCount(day.sessions)
        && day.sessions <= day.events);
      dailyTotal += day.events;
      assert(safeCount(dailyTotal) && dailyTotal <= row.total_events);
    });
    // SQL's overall event count must be the sum of its complete UTC-day grid.
    // Distinct observed sessions may recur across days, so do NOT add them.
    assert(dailyTotal === row.total_events);
    return { event_name:row.event_name,total_events:row.total_events,observed_sessions:row.observed_sessions };
  });
  assert(series.reduce((sum, row) => sum + row.total_events, 0) === data.candidate_events);
  return { kind, days:data.window_days, sampledAt:capture, firstDay:data.first_day_utc,lastDay:data.last_day_utc,lastDayIncomplete:data.last_day_incomplete,series };
}

export function compareAggregateReviews(ui, sql) {
  assert(ui?.kind === sql?.kind && validWindow(ui.days) && ui.days===sql.days);
  const samplingDeltaMs = Math.abs(ui.sampledAt-sql.sampledAt);
  const skewSeconds = Math.round(samplingDeltaMs/1000);
  if (samplingDeltaMs > MAX_CAPTURE_SKEW_MS) return { status:"REVIEW_REQUIRED_CAPTURE_DRIFT",skewSeconds };
  if (ui.kind==="funnel") {
    const fields = [...DEFAULT_EVENTS.map((event,i) => ({
      name:event, match:ui.counts[i]===sql.counts[i]
    })),{name:"pageview_sessions",match:ui.pathSessions===sql.pathSessions}];
    return { status:fields.every(x=>x.match)?"AGGREGATES_MATCHED_NOT_ACCEPTANCE":"REVIEW_REQUIRED_NUMERIC_DIFFERENCE",skewSeconds,mismatched:fields.filter(x=>!x.match).map(x=>x.name) };
  }
  const matches = ui.firstDay===sql.firstDay && ui.lastDay===sql.lastDay && ui.lastDayIncomplete===sql.lastDayIncomplete
    && ui.series.length===sql.series.length;
  const missed = DEFAULT_EVENTS.filter((event,i) =>
    ui.series[i].event_name!==event || sql.series[i].event_name!==event
    || ui.series[i].total_events!==sql.series[i].total_events
    || ui.series[i].observed_sessions!==sql.series[i].observed_sessions);
  if (!matches) missed.unshift("utc_window");
  return {status:missed.length?"REVIEW_REQUIRED_NUMERIC_DIFFERENCE":"AGGREGATES_MATCHED_NOT_ACCEPTANCE",skewSeconds,mismatched:missed};
}

function runCli() {
  const args=process.argv.slice(2);
  assert(args.length===4 && args[0]==="--ui" && args[2]==="--sql");
  const inputs=[resolve(args[1]),resolve(args[3])];
  const ui=parseUiCopy(readFileSync(inputs[0],"utf8"));
  const sql=parseSqlAggregate(readFileSync(inputs[1],"utf8"),ui.kind);
  const result=compareAggregateReviews(ui,sql);
  process.stdout.write("R2-P2 offline aggregate review: "+result.status+"\n");
  process.stdout.write("Mode: "+ui.kind+"; window: "+ui.days+" days; capture skew: "+result.skewSeconds+" seconds\n");
  if (result.mismatched?.length) process.stdout.write("Fields requiring review: "+result.mismatched.join(", ")+"\n");
  process.stdout.write("No real admin authentication, tenant isolation, consent or report sign-off was verified.\n");
  if (result.status!=="AGGREGATES_MATCHED_NOT_ACCEPTANCE") process.exitCode=2;
}

if (process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  try { runCli(); } catch {
    process.stderr.write("INPUT_REJECTED: Expected safe aggregate-only clipboard and authorized SQL JSON outputs.\n");
    process.exitCode=1;
  }
}
