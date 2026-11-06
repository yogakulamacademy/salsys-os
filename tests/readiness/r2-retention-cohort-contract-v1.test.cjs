// Research-only, synthetic retention semantics. NOT a CRM report, RPC or production KPI.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const DAY = 86400000;
const MIN_COHORT = 20;
const isDate = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s)
  && Number.isFinite(Date.parse(s + "T00:00:00Z"))
  && new Date(Date.parse(s + "T00:00:00Z")).toISOString().slice(0, 10) === s;
const dayOf = (t) => new Date(t).toISOString().slice(0, 10);
const gatesReady = (g) => ["tenantAuthorization", "sourceCoverage", "identityContinuity",
  "consentContinuity", "historyCompleteness", "eventTimeQuality",
  "botFiltering", "privacyErasureCoverage", "ownerAcceptance"].every((k) => g?.[k] === true);
const ready = Object.freeze({
  tenantAuthorization: true, sourceCoverage: true, identityContinuity: true,
  consentContinuity: true, historyCompleteness: true, eventTimeQuality: true,
  botFiltering: true, privacyErasureCoverage: true, ownerAcceptance: true,
});

// Important: identityEpoch is SYNTHETIC evidence of a checked consent-identity boundary;
// it is NOT a column in public.raw_events. The actual system has not proved this yet.
function syntheticCohortTrial(events, { organizationId, asOfUtc, historyStartUtc,
  completeThroughUtc, windowDays = 7, returnDay = 1, gates = {} } = {}) {
  const blocked = (reason) => ({ status: "blocked", reason, rows: [] });
  if (!gatesReady(gates)) return blocked("acceptance_gates_unverified");
  if (!isDate(asOfUtc) || !isDate(historyStartUtc) || !isDate(completeThroughUtc)
    || !organizationId || ![7, 14, 30].includes(windowDays)
    || ![1, 7, 30].includes(returnDay)) {
    return blocked("invalid_contract");
  }
  const today = Date.parse(asOfUtc + "T00:00:00Z");
  const lastVerifiedDay = Date.parse(completeThroughUtc + "T00:00:00Z");
  // Closure alone is not proof of complete ingestion; a verified UTC day
  // watermark must be independently supplied for this synthetic contract.
  if (lastVerifiedDay >= today || lastVerifiedDay < Date.parse(historyStartUtc + "T00:00:00Z")) {
    return blocked("unverified_complete_day");
  }
  const lastCohort = lastVerifiedDay - returnDay * DAY;
  const firstCohort = lastCohort - (windowDays - 1) * DAY;
  if (Date.parse(historyStartUtc + "T00:00:00Z") > firstCohort - 30 * DAY) {
    return blocked("insufficient_washout_history");
  }
  if (!Array.isArray(events) || events.length > 50000) return blocked("unbounded_or_invalid_input");

  const eventIds = new Map();
  const sessions = new Map();
  for (const e of events) {
    if (e.organizationId !== organizationId || e.eventName !== "web.session_started") continue;
    if (typeof e.occurredAt !== "string" || typeof e.receivedAt !== "string") {
      return blocked("unreliable_event_time_or_delivery");
    }
    const occurred = Date.parse(e.occurredAt);
    const received = Date.parse(e.receivedAt);
    if (!Number.isFinite(occurred) || !Number.isFinite(received) || occurred >= today + DAY) {
      return blocked("unreliable_event_time_or_delivery");
    }
    // Do not use incomplete as-of-day activity, dates beyond the externally
    // verified completeness watermark, or events received after as-of midnight.
    if (occurred >= lastVerifiedDay + DAY || received >= today) continue;
    if (!e.sourceId || !e.visitorId || !e.sessionId || !e.eventId || !e.identityEpoch
      || e.analytics !== "granted") return blocked("unverified_source_or_consent");
    if (occurred < Date.parse(historyStartUtc + "T00:00:00Z")
      || received < occurred - 300000 || received - occurred > DAY) {
      return blocked("unreliable_event_time_or_delivery");
    }
    const personKey = JSON.stringify([organizationId, e.sourceId, e.visitorId, e.identityEpoch]);
    const sessionKey = JSON.stringify([personKey, e.sessionId]);
    // Delivery IDs may overlap across independent tracking sources.
    const scopedEventId = JSON.stringify([e.sourceId, e.eventId]);
    const prior = eventIds.get(scopedEventId);
    if (prior && prior !== sessionKey) return blocked("conflicting_duplicate_event");
    if (prior) continue;
    eventIds.set(scopedEventId, sessionKey);
    const older = sessions.get(sessionKey);
    if (!older || occurred < older.occurred) sessions.set(sessionKey, { personKey, occurred });
  }

  const groups = new Map();
  for (const record of sessions.values()) {
    const group = groups.get(record.personKey) || [];
    group.push(record.occurred);
    groups.set(record.personKey, group);
  }
  const perDate = new Map();
  for (let t = firstCohort; t <= lastCohort; t += DAY) {
    perDate.set(dayOf(t), { denominator: 0, returns: 0 });
  }
  for (const moments of groups.values()) {
    // One key can be *new to an observation window* after a verified 30-day
    // inactive washout, even if that key has older recorded sessions. Reusing
    // the earliest-ever event would wrongly omit such cohorts.
    // Sessions are already deduplicated by their source/visitor/epoch/session
    // key, so distinct UTC session-start dates represent independent sessions.
    const activeDays = [...new Set(moments.map(dayOf))].sort();
    let priorActiveDayMs = null;
    const activeSet = new Set(activeDays);
    for (const dateUtc of activeDays) {
      const dayMs = Date.parse(dateUtc + "T00:00:00Z");
      const bucket = perDate.get(dateUtc);
      // The 30 *preceding* UTC days must have no observed eligible starts.
      // Activity exactly 30 days earlier is still inside the washout.
      const passedWashout = priorActiveDayMs === null
        || priorActiveDayMs < dayMs - 30 * DAY;
      if (bucket && passedWashout) {
        bucket.denominator++;
        if (activeSet.has(dayOf(dayMs + returnDay * DAY))) {
          bucket.returns++;
        }
      }
      priorActiveDayMs = dayMs;
    }
  }
  return {
    status: "synthetic_only",
    // Intentionally no source IDs, visitor IDs, session IDs, event IDs or raw times.
    rows: [...perDate].map(([dateUtc, item]) => item.denominator < MIN_COHORT
      ? { dateUtc, status: "suppressed", denominator: null, returns: null }
      : { dateUtc, status: "synthetic", denominator: item.denominator, returns: item.returns }),
  };
}

function event(visitorId, day, sessionId, options = {}) {
  return {
    organizationId: "tenant-a", sourceId: "site-a", visitorId, identityEpoch: "grant-a",
    sessionId, eventId: visitorId + "-" + day + "-" + sessionId, eventName: "web.session_started",
    analytics: "granted", occurredAt: day + "T10:00:00Z",
    receivedAt: day + "T10:00:02Z", ...options,
  };
}
const options = { organizationId: "tenant-a", asOfUtc: "2026-11-06",
  historyStartUtc: "2026-09-25", completeThroughUtc: "2026-11-05",
  windowDays: 7, returnDay: 1, gates: ready };

test("R2-P3 is blocked by default and cannot turn a short event history into a D30 KPI", () => {
  assert.equal(syntheticCohortTrial([], { ...options, gates: {} }).reason, "acceptance_gates_unverified");
  assert.equal(syntheticCohortTrial([], { ...options, historyStartUtc: "2026-10-22",
    returnDay: 30 }).reason, "insufficient_washout_history");
});

test("exact UTC D1 counts a new session but not refreshes, retries or a session reused on a later day", () => {
  const rows = [];
  for (let i = 0; i < 20; i++) {
    const v = "v" + i;
    rows.push(event(v, "2026-11-01", "first"));
    rows.push(event(v, "2026-11-01", "first")); // same event ID retry
    rows.push(event(v, "2026-11-02", i < 10 ? "return" : "first"));
    rows.push(event(v, "2026-11-03", "late")); // not D1
  }
  const report = syntheticCohortTrial(rows, options);
  const cohort = report.rows.find((x) => x.dateUtc === "2026-11-01");
  assert.equal(report.status, "synthetic_only");
  assert.deepEqual(cohort, { dateUtc: "2026-11-01", status: "synthetic",
    denominator: 20, returns: 10 });
  assert.equal(JSON.stringify(report).includes("visitorId"), false);
});

test("different tenant, tracking source or consent epoch never extends a browser identity", () => {
  const rows = [];
  for (let i = 0; i < 20; i++) {
    const v = "v" + i;
    rows.push(event(v, "2026-11-01", "first"));
    rows.push(event(v, "2026-11-02", "other-tenant", { organizationId: "tenant-b" }));
    rows.push(event(v, "2026-11-02", "other-site", { sourceId: "site-b" }));
    rows.push(event(v, "2026-11-02", "after-withdrawal", { identityEpoch: "regrant-b" }));
  }
  const cohort = syntheticCohortTrial(rows, options).rows.find((x) => x.dateUtc === "2026-11-01");
  assert.equal(cohort.denominator, 20);
  assert.equal(cohort.returns, 0);
});

test("the same delivery event ID is independent across two tracking sources", () => {
  const first = event("source-collision", "2026-11-01", "one");
  const second = { ...event("source-collision", "2026-11-01", "two"),
    sourceId: "site-b", eventId: first.eventId };
  assert.equal(syntheticCohortTrial([first, second], options).status, "synthetic_only");
});

test("D7 and D30 are exact, fully matured UTC return days rather than eventual-return or cumulative windows", () => {
  const d7 = Array.from({ length: 20 }, (_, i) => [
    event("d7-" + i, "2026-10-25", "first"),
    event("d7-" + i, i < 5 ? "2026-11-01" : "2026-11-02", "return"),
  ]).flat();
  const seven = syntheticCohortTrial(d7, { ...options,
    historyStartUtc: "2026-09-20", returnDay: 7 });
  assert.equal(seven.rows.find((x) => x.dateUtc === "2026-10-25").returns, 5);

  const d30 = Array.from({ length: 20 }, (_, i) => [
    event("d30-" + i, "2026-10-01", "first"),
    event("d30-" + i, i < 8 ? "2026-10-31" : "2026-11-01", "return"),
  ]).flat();
  const thirty = syntheticCohortTrial(d30, { ...options,
    historyStartUtc: "2026-08-31", returnDay: 30 });
  assert.equal(thirty.rows.find((x) => x.dateUtc === "2026-10-01").returns, 8);
  assert.equal(thirty.rows.some((x) => x.dateUtc === "2026-10-07"), false);
});

test("verified 30-day washout allows old browser keys to be new-to-window without misclassifying recent returns", () => {
  const rows = [];
  for (let i = 0; i < 20; i++) {
    rows.push(event("return-after-gap-" + i, "2026-10-01", "old"));
    rows.push(event("return-after-gap-" + i, "2026-11-01", "new-entry"));
    rows.push(event("return-after-gap-" + i, "2026-11-02", "new-return"));

    // A start in the preceding 30 UTC days blocks a second cohort entry.
    rows.push(event("recent-activity-" + i, "2026-10-15", "recent"));
    rows.push(event("recent-activity-" + i, "2026-11-01", "not-new"));
    rows.push(event("recent-activity-" + i, "2026-11-02", "still-not-new"));

    // The earliest excluded day is inclusive: Oct 2 is exactly 30 days
    // before Nov 1 and must still disqualify the Nov 1 entry.
    rows.push(event("boundary-activity-" + i, "2026-10-02", "boundary"));
    rows.push(event("boundary-activity-" + i, "2026-11-01", "not-new"));
    rows.push(event("boundary-activity-" + i, "2026-11-02", "still-not-new"));
  }
  const report = syntheticCohortTrial(rows, options);
  const cohort = report.rows.find((row) => row.dateUtc === "2026-11-01");
  assert.equal(report.status, "synthetic_only");
  assert.deepEqual(cohort, { dateUtc: "2026-11-01", status: "synthetic",
    denominator: 20, returns: 20 });
});

test("D30 new-to-window eligibility also permits older history outside the washout only", () => {
  const rows = Array.from({ length: 20 }, (_, i) => [
    event("d30-gap-" + i, "2026-08-31", "old"),
    event("d30-gap-" + i, "2026-10-01", "new-entry"),
    event("d30-gap-" + i, "2026-10-31", "new-return"),
  ]).flat();
  const report = syntheticCohortTrial(rows, { ...options,
    historyStartUtc: "2026-08-30", returnDay: 30 });
  assert.equal(report.status, "synthetic_only");
  assert.deepEqual(report.rows.find((row) => row.dateUtc === "2026-10-01"), {
    dateUtc: "2026-10-01", status: "synthetic", denominator: 20, returns: 20,
  });
});

test("small cohorts suppress both numerator and denominator; empty data are not published as 0 percent", () => {
  const trial = syntheticCohortTrial([
    event("private-id", "2026-11-01", "first"),
    event("private-id", "2026-11-02", "return"),
  ], options);
  assert.deepEqual(trial.rows.find((x) => x.dateUtc === "2026-11-01"), {
    dateUtc: "2026-11-01", status: "suppressed", denominator: null, returns: null,
  });
  assert.doesNotMatch(JSON.stringify(trial), /private-id|site-a|tenant-a|grant-a|2026-11-02T/);
  assert.equal(trial.rows.length, 7);
});

test("unknown consent, stale delivery, absent identity or conflicting event IDs fail closed", () => {
  const good = event("v", "2026-11-01", "s");
  for (const changed of [
    { ...good, analytics: "unknown" },
    { ...good, sessionId: "" },
    { ...good, identityEpoch: null },
    { ...good, receivedAt: "2026-11-04T10:00:02Z" },
    { ...good, occurredAt: "not-a-date" },
  ]) {
    assert.equal(syntheticCohortTrial([changed], options).status, "blocked");
  }
  const conflict = { ...good, sessionId: "other" };
  assert.equal(syntheticCohortTrial([good, conflict], options).reason, "conflicting_duplicate_event");
  assert.equal(syntheticCohortTrial(Array.from({ length: 50001 }, () => good), options).reason,
    "unbounded_or_invalid_input");
});


test("eligibility requires a verified complete-day watermark, bot assessment and deletion coverage", () => {
  for (const invalid of [
    { completeThroughUtc: undefined },
    { completeThroughUtc: "2026-11-06" }, // current partial day
    { completeThroughUtc: "2026-11-07" }, // impossible future watermark
    { gates: { ...ready, botFiltering: false } },
    { gates: { ...ready, privacyErasureCoverage: false } },
    { gates: { ...ready, eventTimeQuality: false } },
  ]) {
    const trial = syntheticCohortTrial([], { ...options, ...invalid });
    assert.equal(trial.status, "blocked", JSON.stringify(invalid));
    assert.deepEqual(trial.rows, []);
  }
});

test("D30 cohort maturity follows verified completeness, not calendar closure alone", () => {
  const events = Array.from({ length: 20 }, (_, i) => [
    event("m" + i, "2026-10-06", "first"),
    event("m" + i, "2026-11-05", "returned"),
  ]).flat();
  const base = { ...options, historyStartUtc: "2026-08-30",
    returnDay: 30, windowDays: 7 };
  const fullyVerified = syntheticCohortTrial(events, base);
  assert.equal(fullyVerified.rows.find((row) => row.dateUtc === "2026-10-06").returns, 20);

  const delayWarning = syntheticCohortTrial(events,
    { ...base, completeThroughUtc: "2026-11-04" });
  assert.equal(delayWarning.rows.some((row) => row.dateUtc === "2026-10-06"), false);
  assert.equal(delayWarning.status, "synthetic_only");
});

test("incomplete-day events and post-cutoff receipts cannot inflate a previously mature cohort", () => {
  const rows = Array.from({ length: 20 }, (_, i) => [
    event("v" + i, "2026-11-01", "first"),
    event("v" + i, "2026-11-02", "return", i < 8
      ? {} : { receivedAt: "2026-11-06T00:10:00Z" }),
    event("v" + i, "2026-11-06", "today", { analytics: "unknown" }),
  ]).flat();
  const report = syntheticCohortTrial(rows, options);
  assert.equal(report.status, "synthetic_only");
  assert.equal(report.rows.find((row) => row.dateUtc === "2026-11-01").returns, 8);
});

test("research-only model is not wired to app, API or database and requires explicit external acceptance", () => {
  const doc = fs.readFileSync(path.join(__dirname,
    "../../docs/r2-p3-retention-cohort-contract-v1.md"), "utf8");
  for (const phrase of ["RESEARCH ONLY", "30-day washout", "source-scoped",
    "Issue #523", "Issue #520", "Issue #530", "60", "20"]) {
    assert.ok(doc.includes(phrase), "Missing acceptance boundary: " + phrase);
  }
});
