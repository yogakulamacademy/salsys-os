const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const audit = read("docs/sql/r2-p3-retention-readiness-v1.sql");
const evidence = read("docs/r2-p3-retention-readiness-evidence-v1.md");
const browser = read("public/salsys-tracker.js");
const contract = read("docs/event-tracking-v1.md");

test("R2-P3 diagnostic is a bounded tenant-scoped SELECT-only operator query", () => {
  const statements = audit.split("\n")
    .filter((line) => !line.trimStart().startsWith("--")).join("\n");
  assert.match(statements, /:'organization_id'::uuid/);
  assert.match(statements, /join params p on e\.organization_id = p\.organization_id/gi);
  assert.match(statements, /event_family = 'web'/);
  assert.match(statements, /source_event_type = 'web\.session_started'/);
  assert.match(statements, /analytics_snapshot = 'granted'/);
  assert.match(statements, /limit 50001/i);
  assert.match(statements, /candidate_events > 50000/);
  assert.match(statements, /jsonb_build_object\(/);
  assert.match(statements, /'status','not_ready_for_retention_kpi'/);
  assert.match(statements, /'observed_metrics_are_people',false/);
  assert.doesNotMatch(statements, /\b(?:create|alter|drop|truncate|insert|update|delete|grant|revoke)\s+(?:table|function|into|from|on|public\.)/i);
  assert.doesNotMatch(statements, /\b(?:select\s+anonymous_visitor_id|select\s+session_key)\s+as\s+aggregate_evidence_only\b/i);
});

test("R2-P3 diagnostic does not return raw source, visitor or session identifiers", () => {
  const tail = audit.slice(audit.indexOf("select jsonb_build_object("));
  assert.ok(tail.length > 300);
  for (const name of ["'tracking_source_id'", "'anonymous_visitor_id'", "'session_key'", "'site'", "'page_path'", "'visitor_ids'", "'raw_payload'"]) {
    assert.equal(tail.includes(name), false, "Unexpected user-identifying JSON key: " + name);
  }
  assert.match(audit, /group by tracking_source_id,anonymous_visitor_id,session_key/);
  assert.match(audit, /group by tracking_source_id, anonymous_visitor_id/);
  assert.match(audit, /'same_day_repeat_browser_keys'/);
  assert.match(audit, /'multiple_day_browser_keys'/);
  assert.match(audit, /'session_keys_spanning_utc_dates'/);
});

test("R2-P3 docs describe browser and consent caveats instead of claiming human retention", () => {
  assert.match(browser, /persistentVisitor: 'salsys_vid'/);
  assert.match(browser, /sessionVisitor: 'salsys_vid_session'/);
  assert.match(browser, /session: 'salsys_sid'/);
  assert.match(browser, /if \(analyticsGranted\(\)\) safeSet\(window\.localStorage, KEYS\.persistentVisitor, value\)/);
  assert.match(browser, /safeGet\(window\.sessionStorage, KEYS\.session\)/);
  assert.match(browser, /safeRemove\(window\.localStorage, KEYS\.persistentVisitor\)/);
  assert.match(browser, /function sendSessionStarted\(\)/);
  assert.match(browser, /safeGet\(window\.sessionStorage, KEYS\.sessionStarted\) === emittedSession/);
  assert.match(browser, /queuedSessionStartFor\(emittedSession, emittedVisitor\)/);
  assert.match(browser, /item\.event_name === 'web\.session_started'/);
  assert.match(browser, /item\.session_key === sessionKey/);
  assert.match(browser, /item\.anonymous_visitor_id === browserVisitor/);
  assert.match(contract, /Browser events may include/);
  for (const text of ["approximately 15 calendar days", "same UTC day only", "deny → grant again", "not necessarily a visitor's first-ever visit", "sessionStorage", "minimum of 60 calendar days", "R2-P1 website collection remains OFF"]) {
    assert.ok(evidence.includes(text), "Missing limitation in evidence: " + text);
  }
});

function returnActivityModel(sessionStarts) {
  const sources = new Map();
  for (const entry of sessionStarts) {
    const key = entry.source + "/" + entry.visitor;
    const bucket = sources.get(key) || [];
    bucket.push(entry);
    sources.set(key, bucket);
  }
  let repeatSessionBrowserKeys = 0;
  let multiDayBrowserKeys = 0;
  let sameDayRepeatBrowserKeys = 0;
  for (const events of sources.values()) {
    const sessions = new Set(events.map((e) => e.session));
    const days = new Set(events.map((e) => e.dayUtc));
    if (sessions.size > 1) {
      repeatSessionBrowserKeys++;
      if (days.size === 1) sameDayRepeatBrowserKeys++;
    }
    if (days.size > 1) multiDayBrowserKeys++;
  }
  return { repeatSessionBrowserKeys, multiDayBrowserKeys, sameDayRepeatBrowserKeys };
}

test("Synthetic sources, sessions and UTC days are not conflated into 'people retained'", () => {
  const demo = [
    { source: "a", visitor: "v1", session: "s1", dayUtc: "2026-10-22" },
    { source: "a", visitor: "v1", session: "s1", dayUtc: "2026-10-22" }, // retry, not return
    { source: "a", visitor: "v1", session: "s2", dayUtc: "2026-10-22" }, // same-day repeat
    { source: "a", visitor: "v2", session: "s3", dayUtc: "2026-10-22" },
    { source: "a", visitor: "v2", session: "s4", dayUtc: "2026-10-24" }, // cross-day
    { source: "b", visitor: "v2", session: "s5", dayUtc: "2026-10-24" }, // different source; do not merge
  ];
  assert.deepEqual(returnActivityModel(demo), {
    repeatSessionBrowserKeys: 2,
    multiDayBrowserKeys: 1,
    sameDayRepeatBrowserKeys: 1,
  });
  const elapsedCalendarDays = (new Date("2026-11-05T00:00:00Z") -
    new Date("2026-10-22T00:00:00Z")) / 86_400_000 + 1;
  assert.equal(elapsedCalendarDays, 15);
  assert.ok(elapsedCalendarDays < 60, "No mature D30 cohort allowed from this limited history");
});
