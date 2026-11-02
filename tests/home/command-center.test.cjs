const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
function load(file, deps = {}) {
  const result = {};
  const code = ts.transpileModule(
    fs.readFileSync(path.resolve(__dirname, "../..", file), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
  new Function("exports", "require", code)(result, (name) => {
    if (name === "server-only") return {};
    if (Object.hasOwn(deps, name)) return deps[name];
    throw Error(`Unexpected dependency: ${name}`);
  });
  return result;
}
const projection = load("lib/home-command-center.ts");
const { resolveDashboardPeriod } = load("lib/dashboard-period-data.ts", {
  "@/lib/supabase/server": {},
  "@/lib/workspace": {},
});
const { readHomeEvidence } = load("lib/home-command-center-data.ts", {
  "@/lib/supabase/server": {},
  "@/lib/workspace": {},
  "./home-command-center": projection,
});
const now = new Date("2026-11-02T15:00:00Z");
const period = resolveDashboardPeriod({ period: "7d" }, now);
const evidence = (rows) => ({ rows, available: true });
const blank = () => ({
  leads: evidence([]),
  stages: evidence([]),
  messages: evidence([]),
  payments: evidence([]),
  courses: evidence([]),
});
const lead = (id, at = period.startIso) => ({
  id,
  display_name: `Lead ${id}`,
  lead_code: id,
  created_at: at,
  first_touch_source: "Instagram",
  interested_course_id: null,
});
const stage = (id, to, at = period.startIso) => ({
  id: `s-${id}-${to}`,
  lead_id: id,
  to_stage: to,
  changed_at: at,
});
const message = (
  id,
  day,
  direction = "inbound",
  sender_type = "lead",
  status = "received",
) => ({
  id,
  conversation_id: "conversation-a",
  lead_id: "a",
  created_at: `${day}T12:00:00Z`,
  direction,
  sender_type,
  status,
});

test("date presets use UTC, equal previous windows and real month boundaries", () => {
  assert.equal(period.startDate, "2026-10-27");
  assert.equal(period.endDate, "2026-11-02");
  assert.equal(period.days, 7);
  assert.equal(resolveDashboardPeriod({ period: "today" }, now).days, 1);
  assert.equal(
    resolveDashboardPeriod({ period: "yesterday" }, now).endDate,
    "2026-11-01",
  );
  const last = resolveDashboardPeriod({ period: "lastmonth" }, now);
  assert.equal(last.startDate, "2026-10-01");
  assert.equal(last.endDate, "2026-10-31");
  assert.equal(last.days, 31);
});
test("invalid, inverted and wholly future custom ranges safely fall back; long ranges cap at 366", () => {
  for (const [from, to] of [
    ["2026-02-30", "2026-03-02"],
    ["2026-11-02", "2026-11-01"],
    ["2027-01-01", "2027-02-01"],
    ["bad", "bad"],
  ])
    assert.equal(
      resolveDashboardPeriod({ period: "custom", from, to }, now).preset,
      "30d",
    );
  assert.equal(
    resolveDashboardPeriod(
      { period: "custom", from: "2000-01-01", to: "2026-11-02" },
      now,
    ).days,
    366,
  );
});
test("cohort funnel uses history before cutoff, includes skipped preceding steps and remains monotonic", () => {
  const input = blank();
  input.leads = evidence([
    lead("a"),
    lead("b"),
    lead("c"),
    lead("old", period.previousStartIso),
  ]);
  input.stages = evidence([
    stage("a", "enrolled"),
    stage("b", "qualified"),
    stage("c", "qualified", period.endExclusiveIso),
    stage("old", "qualified", period.previousStartIso),
    stage("a", "new", "2026-11-01T00:00:00Z"),
  ]);
  const m = projection.projectHome(input, period);
  assert.equal(m.leads.current, 3);
  assert.equal(m.contacted.current, 2);
  assert.equal(m.qualified.current, 2);
  assert.equal(m.cohortEnrolled.current, 1);
  assert.equal(m.enrolled.current, 1);
  assert.equal(m.qualified.previous, 1);
  assert.deepEqual(
    projection.selectHomeRecords(m, "cohortEnrolled").map((r) => r.id),
    ["a"],
  );
});
test("enrolled KPI deduplicates transitions and never treats closed-won as an Enrollment record", () => {
  const input = blank();
  input.leads = evidence([lead("a")]);
  input.stages = evidence([
    stage("a", "closed_won"),
    stage("older-lead", "enrolled"),
    { ...stage("older-lead", "enrolled"), id: "repeat" },
  ]);
  const m = projection.projectHome(input, period);
  assert.equal(m.cohortEnrolled.current, 1);
  assert.equal(m.enrolled.current, 1);
  assert.equal(m.enrolled.records[0].id, "older-lead");
});
test("daily distinct conversations and period distinct conversations use matching drill-down evidence", () => {
  const input = blank();
  input.messages = evidence([
    message("m1", "2026-10-28"),
    message("m2", "2026-10-29"),
    message("m3", "2026-10-29", "outbound", "human", "sent"),
    message("failed", "2026-10-29", "outbound", "human", "failed"),
    message("bot", "2026-10-29", "outbound", "ai", "sent"),
  ]);
  const m = projection.projectHome(input, period);
  assert.equal(m.conversations.current, 1);
  assert.equal(m.replies.current, 1);
  for (const day of ["2026-10-28", "2026-10-29"])
    assert.equal(
      projection.selectHomeRecords(m, "conversations", "", day).length,
      1,
    );
  assert.equal(
    projection.selectHomeRecords(m, "replies", "", "2026-10-29").length,
    1,
  );
});
test("source and course drill-downs keep their complete denominators, including unknown choices", () => {
  const input = blank();
  input.leads = evidence([
    lead("a"),
    { ...lead("b"), first_touch_source: null, interested_course_id: "missing" },
  ]);
  const m = projection.projectHome(input, period);
  assert.equal(
    m.sources.reduce((n, r) => n + r.count, 0),
    2,
  );
  assert.equal(projection.selectHomeRecords(m, "source", "Unknown").length, 1);
  assert.equal(
    projection.selectHomeRecords(m, "course", "Unavailable course").length,
    1,
  );
});
test("net collections subtract refunds, exclude unpaid rows and never combine currencies", () => {
  const input = blank();
  const pay = {
    id: "p1",
    lead_id: "a",
    paid_at: period.startIso,
    currency: "INR",
    amount: 100000,
    payment_kind: "deposit",
    status: "paid",
  };
  input.payments = evidence([
    pay,
    {
      ...pay,
      id: "p2",
      amount: 20000,
      payment_kind: "refund",
      status: "refunded",
    },
    { ...pay, id: "p3", currency: "USD", amount: 25 },
    { ...pay, id: "p4", amount: 50000, status: "pending" },
  ]);
  const m = projection.projectHome(input, period);
  assert.equal(m.revenue.find((r) => r.currency === "INR").current, 80000);
  assert.equal(m.revenue.find((r) => r.currency === "USD").current, 25);
  assert.equal(
    projection.selectHomeRecords(m, "revenue", "", "", "INR").length,
    2,
  );
});
test("invalid money and missing evidence fail closed; empty evidence remains a known empty state", () => {
  const input = blank();
  input.leads = { rows: [lead("a")], available: false };
  input.payments = evidence([
    {
      id: "p",
      lead_id: "a",
      amount: "bad",
      currency: "INR",
      payment_kind: "deposit",
      status: "paid",
      paid_at: period.startIso,
    },
  ]);
  const m = projection.projectHome(input, period);
  assert.equal(m.leads.current, null);
  assert.deepEqual(m.leads.records, []);
  assert.equal(m.revenueAvailable, false);
  assert.deepEqual(m.revenue, []);
  assert.equal(projection.projectHome(blank(), period).leads.current, 0);
});
test("read pagination follows actual response sizes and never accepts the default API row cap", async () => {
  const calls = [];
  const m = await readHomeEvidence(async (offset) => {
    calls.push(offset);
    return {
      data: offset === 0 ? [{ id: 1 }, { id: 2 }] : [{ id: 3 }],
      error: null,
      count: 3,
    };
  });
  assert.equal(m.available, true);
  assert.equal(m.rows.length, 3);
  assert.deepEqual(calls, [0, 2]);
});
test("read caps, missing counts, mid-read changes and errors cannot produce plausible partial totals", async () => {
  for (const result of [
    { data: [], error: null, count: 10001 },
    { data: [], error: null, count: null },
    { data: [], error: { message: "denied" }, count: 0 },
    { data: [], error: null, count: 1 },
  ])
    assert.equal((await readHomeEvidence(async () => result)).available, false);
  let call = 0;
  assert.equal(
    (
      await readHomeEvidence(async () => ({
        data: [{ id: ++call }],
        error: null,
        count: call === 1 ? 2 : 3,
      }))
    ).available,
    false,
  );
});
test("drill-down URLs preserve the selected reporting window and encode source names", () => {
  const url = new URL(
    projection.homeHref(period, {
      detail: "source",
      value: "Google & Meta",
      currency: "INR",
    }),
    "https://example.test",
  );
  assert.equal(url.searchParams.get("value"), "Google & Meta");
  assert.equal(url.searchParams.get("from"), period.startDate);
  assert.equal(url.searchParams.get("currency"), "INR");
  assert.equal(projection.percentageChange(1, 0), null);
});

test("record search rejects anonymous and unauthorized users before data reads", async () => {
  for (const authenticated of [false, true]) {
    const db = {
      auth: {
        getUser: async () => ({
          data: { user: authenticated ? { id: "user" } : null },
          error: null,
        }),
      },
      from: () => {
        throw Error("Must not read records");
      },
    };
    const { GET } = load("app/api/workspace/search/route.ts", {
      "next/server": {
        NextResponse: { json: (body, options) => ({ body, ...options }) },
      },
      "@/lib/supabase/server": { createClient: async () => db },
      "@/lib/workspace": {
        getCurrentWorkspaceContext: async () => ({
          activeWorkspace: { organizationId: "org", role: "viewer" },
        }),
      },
      "@/lib/data": { isMockMode: () => false },
    });
    const result = await GET({
      nextUrl: new URL("https://example.test/api/workspace/search?q=Maria"),
    });
    assert.equal(result.status, authenticated ? 403 : 401);
    assert.equal(result.headers["Cache-Control"], "private, no-store");
  }
});

test("duplicate pages and thrown transport failures cannot become complete evidence", async () => {
  assert.equal(
    (
      await readHomeEvidence(async () => {
        throw Error("offline");
      })
    ).available,
    false,
  );
  assert.equal(
    (
      await readHomeEvidence(async () => ({
        data: [{ id: "repeat" }],
        error: null,
        count: 2,
      }))
    ).available,
    false,
  );
});

test("search uses the active organization on every stream and restricts admissions results", async () => {
  for (const role of ["admin", "admissions"]) {
    const calls = [];
    const fixtures = {
      leads: [
        {
          id: "lead-a",
          display_name: "Maria",
          lead_code: "LD-1",
          organization_id: "active",
        },
        { id: "foreign", display_name: "Maria", organization_id: "foreign" },
      ],
      tasks: [
        {
          id: "task-a",
          title: "Call Maria",
          lead_id: "lead-a",
          status: "open",
          organization_id: "active",
        },
      ],
      conversations: [
        {
          id: "conv-a",
          lead_id: "lead-a",
          channel: "whatsapp",
          organization_id: "active",
        },
      ],
      person_leads: [
        {
          id: "link-a",
          person_id: "person-a",
          lead_id: "lead-a",
          organization_id: "active",
          person: { status: "active" },
        },
      ],
      courses: [
        { id: "course-a", name: "Maria course", organization_id: "active" },
      ],
      campaigns: [
        { id: "campaign-a", name: "Maria campaign", organization_id: "active" },
      ],
    };
    const db = {
      auth: {
        getUser: async () => ({ data: { user: { id: "user" } }, error: null }),
      },
      from(table) {
        const call = { table, filters: [] };
        calls.push(call);
        let rows = fixtures[table] ?? [];
        const value = (row, key) =>
          key.split(".").reduce((r, k) => r?.[k], row);
        const chain = {
          select() {
            return chain;
          },
          eq(key, v) {
            call.filters.push([key, v]);
            rows = rows.filter((r) => value(r, key) === v);
            return chain;
          },
          neq(key, v) {
            rows = rows.filter((r) => value(r, key) !== v);
            return chain;
          },
          in(key, values) {
            rows = rows.filter((r) => values.includes(value(r, key)));
            return chain;
          },
          ilike() {
            return chain;
          },
          order() {
            return chain;
          },
          limit(n) {
            rows = rows.slice(0, n);
            return chain;
          },
          then(resolve) {
            return Promise.resolve({ data: rows, error: null }).then(resolve);
          },
        };
        return chain;
      },
    };
    const { GET } = load("app/api/workspace/search/route.ts", {
      "next/server": {
        NextResponse: { json: (body, options) => ({ body, ...options }) },
      },
      "@/lib/supabase/server": { createClient: async () => db },
      "@/lib/workspace": {
        getCurrentWorkspaceContext: async () => ({
          activeWorkspace: { organizationId: "active", role },
        }),
      },
      "@/lib/data": { isMockMode: () => false },
    });
    const response = await GET({
      nextUrl: new URL("https://example.test/api/workspace/search?q=Maria"),
    });
    assert.equal(response.body.partial, false);
    assert.ok(
      calls.every((c) =>
        c.filters.some(
          ([key, val]) => key === "organization_id" && val === "active",
        ),
      ),
    );
    assert.ok(!JSON.stringify(response.body).includes("foreign"));
    if (role === "admissions") {
      assert.ok(
        !calls.some((c) =>
          ["courses", "campaigns", "person_leads"].includes(c.table),
        ),
      );
      assert.deepEqual(
        new Set(response.body.results.map((r) => r.kind)),
        new Set(["Lead", "Conversation", "Task"]),
      );
    } else {
      assert.deepEqual(
        new Set(response.body.results.map((r) => r.kind)),
        new Set([
          "Lead",
          "Contact",
          "Conversation",
          "Task",
          "Course",
          "Campaign",
        ]),
      );
      assert.ok(
        response.body.results
          .find((r) => r.kind === "Course")
          .href.endsWith("course=course-a"),
      );
    }
  }
});
