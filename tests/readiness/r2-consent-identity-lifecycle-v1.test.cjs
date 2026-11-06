const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const tracker = fs.readFileSync(path.join(__dirname, "../../public/salsys-tracker.js"), "utf8");
let serial = 0;
function storage(initial = {}) {
  const entries = new Map(Object.entries(initial));
  return {
    getItem(name) { return entries.has(name) ? entries.get(name) : null; },
    setItem(name, value) { entries.set(name, String(value)); },
    removeItem(name) { entries.delete(name); },
    snapshot() { return Object.fromEntries(entries); },
  };
}
function form() {
  const inputs = new Map();
  return {
    id: "synthetic-lead",
    tagName: "FORM",
    action: "https://example.test/contact",
    querySelector(selector) {
      const match = selector.match(/input\[name="([^"]+)"\]/);
      return match ? inputs.get(match[1]) || null : null;
    },
    appendChild(element) { inputs.set(element.name, element); },
    getAttribute(name) { return name === "name" ? "synthetic-lead" : null; },
    field(name) { return inputs.get(name)?.value || null; },
  };
}
function consentAck(body, effective = body.decisions) {
  return {
    ok: true,
    json: async () => ({
      ok: true,
      visitor_id: body.visitor_id,
      effective_decisions: effective,
      receipts: Object.entries(body.decisions).map(([purpose, decision], index) => ({
        purpose, decision, receipt_id: "synthetic-receipt-" + index,
      })),
    }),
  };
}
function boot({
  local = storage(),
  session = storage(),
  mode = "required",
  consentResponse = null,
  eventResponse = null,
  trackedForm = form(),
} = {}) {
  const calls = [];
  const docListeners = {};
  const windowListeners = {};
  const script = {
    src: "https://crm.salsysos.com/salsys-tracker.js",
    dataset: {
      apiBase: "https://crm.salsysos.com",
      site: "example.test",
      consentMode: mode,
      autoSpa: "false",
      autoPage: "true",
      autoForms: "true",
    },
  };
  const document = {
    currentScript: script,
    title: "Synthetic consent continuity test",
    cookie: "",
    referrer: "",
    getElementsByTagName() { return [script]; },
    querySelectorAll(selector) { return selector === "form" ? [trackedForm] : []; },
    createElement() { return { name: "", value: "" }; },
    addEventListener(name, fn) { (docListeners[name] ||= []).push(fn); },
  };
  const window = {
    localStorage: local,
    sessionStorage: session,
    location: new URL("https://example.test/courses/200-hour-ytt.php"),
    crypto: {
      randomUUID() { serial += 1; return String(serial).padStart(8, "0") + "-0000-4000-8000-000000000001"; },
    },
    history: {},
    innerWidth: 390,
    innerHeight: 844,
    console,
    addEventListener(name, fn) { (windowListeners[name] ||= []).push(fn); },
  };
  async function fetch(url, opts) {
    const body = JSON.parse(opts.body);
    calls.push({ url: String(url), body });
    if (String(url).includes("/privacy/consent/")) {
      return typeof consentResponse === "function"
        ? consentResponse(body)
        : consentAck(body);
    }
    if (typeof eventResponse === "function") return eventResponse(body);
    return { ok: true, json: async () => ({ ok: true, accepted: true }) };
  }
  vm.runInNewContext(tracker, {
    window, document, navigator: { globalPrivacyControl: false, language: "en" },
    URL, Intl, Uint8Array, Math, Date, Promise, fetch, console,
    setTimeout: (fn) => fn(),
  }, { filename: "salsys-tracker.js", timeout: 1500 });

  function eventCalls(name) {
    return calls.filter((c) => c.url.includes("/api/events/browser/")
      && (!name || c.body.event_name === name));
  }
  function emitStorage(key, newValue, oldValue = null) {
    for (const fn of windowListeners.storage || []) {
      fn({ key, newValue, oldValue, storageArea: local, url: window.location.href });
    }
  }
  return { sdk: window.Salsys, local, session, form: trackedForm, calls, eventCalls,
    window, docListeners, windowListeners, emitStorage };
}
async function settle() { await new Promise((resolve) => setImmediate(resolve)); }

test("extra consent receipts outside effective decisions fail closed, even when the claimed grant is valid", async () => {
  for (const extraReceipt of [
    { purpose: "advertising", decision: "granted", receipt_id: "unexpected-ads-grant" },
    { purpose: "analytics", decision: "denied", receipt_id: "conflicting-analytics-denial" },
    { purpose: "marketing", decision: "denied", receipt_id: "unrequested-marketing-denial" },
  ]) {
    const app = boot({
      consentResponse: async (body) => {
        const receipt = consentAck(body);
        return {
          ok: true,
          json: async () => ({
            ...(await receipt.json()),
            receipts: [
              ...(await receipt.json()).receipts,
              extraReceipt,
            ],
          }),
        };
      },
    });
    await assert.rejects(app.sdk.consent({ analytics: "granted" }),
      /Privacy preference server receipt was not verified/);
    assert.equal(app.sdk.privacy().analytics_allowed_locally, false);
    assert.equal(app.local.getItem("salsys_vid"), null);
    assert.equal((await app.sdk.track("web.page_viewed", {})).privacy_blocked, true);
    assert.equal(app.eventCalls("web.page_viewed").length, 0);
  }
});

test("analytics grant retains one first-party identity across same-tab reload", async () => {
  const app = boot();
  await app.sdk.consent({ analytics: "granted" });
  await settle();
  const id = app.sdk.visitorId();
  assert.equal(app.local.getItem("salsys_vid"), id);
  assert.ok(app.session.getItem("salsys_sid"));
  assert.ok(app.eventCalls("web.session_started").length >= 1);
  const reloaded = boot({ local: app.local, session: app.session });
  assert.equal(reloaded.sdk.visitorId(), id);
  assert.equal(reloaded.sdk.sessionId(), app.sdk.sessionId());
});

test("withdrawing analytics rotates the in-memory visitor/session and removes stale storage keys", async () => {
  const app = boot();
  await app.sdk.consent({ analytics: "granted" });
  await settle();
  const old = app.sdk.identifiers();
  await app.sdk.consent({ analytics: "withdrawn" });
  assert.notEqual(app.sdk.visitorId(), old.visitor_id, "old analytics visitor must not survive withdrawal");
  assert.notEqual(app.sdk.sessionId(), old.session_id, "old analytics session must not survive withdrawal");
  for (const key of ["salsys_vid", "salsys_first_touch_v1", "salsys_event_queue_v1"]) {
    assert.equal(app.local.getItem(key), null, key + " must be removed");
  }
  for (const key of ["salsys_vid_session", "salsys_sid", "salsys_session_started_v1",
    "salsys_first_touch_session_v1", "salsys_session_touch_v1"]) {
    assert.equal(app.session.getItem(key), null, key + " must not reconnect an opted-out session");
  }
  assert.equal(app.form.field("salsys_visitor_id"), app.sdk.visitorId());
  assert.equal(app.form.field("salsys_session_id"), app.sdk.sessionId());
});

test("regrant in one tab uses a new visitor and sends a new session-start/page-view", async () => {
  const app = boot();
  await app.sdk.consent({ analytics: "granted" });
  await settle();
  const firstVisitor = app.sdk.visitorId();
  const firstSession = app.sdk.sessionId();
  await app.sdk.consent({ analytics: "denied" });
  const blocked = await app.sdk.track("web.page_viewed", { origin: "synthetic" });
  assert.equal(blocked.privacy_blocked, true);
  await app.sdk.consent({ analytics: "granted" });
  await settle();
  assert.notEqual(app.sdk.visitorId(), firstVisitor);
  assert.notEqual(app.sdk.sessionId(), firstSession);
  assert.equal(app.local.getItem("salsys_vid"), app.sdk.visitorId());
  assert.equal(app.session.getItem("salsys_sid"), app.sdk.sessionId());
  assert.equal(app.eventCalls("web.session_started").length, 2);
  assert.equal(app.eventCalls("web.page_viewed").length, 2);
  const nextStart = app.eventCalls("web.session_started")[1].body;
  assert.equal(nextStart.anonymous_visitor_id, app.sdk.visitorId());
  assert.equal(nextStart.session_key, app.sdk.sessionId());
  assert.equal(app.form.field("salsys_visitor_id"), app.sdk.visitorId());
});

test("a withdrawal request blocks optional analytics immediately while remote consent is pending", async () => {
  let completeWithdrawal;
  let withdrawalBody;
  const app = boot({
    consentResponse: (body) => {
      if (body.decisions.analytics === "withdrawn") {
        withdrawalBody = body;
        return new Promise((resolve) => { completeWithdrawal = resolve; });
      }
      return consentAck(body);
    },
  });
  await app.sdk.consent({ analytics: "granted" });
  const preWithdrawal = app.sdk.visitorId();
  const pending = app.sdk.consent({ analytics: "withdrawn" });
  const event = await app.sdk.track("web.page_viewed", { action: "synthetic-post-optout" });
  assert.equal(event.privacy_blocked, true);
  assert.notEqual(app.sdk.visitorId(), preWithdrawal);
  assert.equal(app.local.getItem("salsys_vid"), null);
  completeWithdrawal(consentAck(withdrawalBody));
  await pending;
});

test("failed withdrawal records a local opt-out and never resumes optional analytics", async () => {
  const app = boot({
    consentResponse: async (body) => {
      if (body.decisions.analytics === "denied") throw new Error("synthetic network failure");
      return consentAck(body);
    },
  });
  await app.sdk.consent({ analytics: "granted" });
  const old = app.sdk.visitorId();
  await assert.rejects(() => app.sdk.consent({ analytics: "denied" }), /synthetic network failure/);
  assert.notEqual(app.sdk.visitorId(), old);
  assert.equal(app.local.getItem("salsys_vid"), null);
  assert.equal(app.sdk.privacy().analytics_allowed_locally, false);
  assert.equal((await app.sdk.track("web.page_viewed", {})).privacy_blocked, true);
});

test("marketing-only consent does not alter the current analytics identity", async () => {
  const app = boot();
  await app.sdk.consent({ analytics: "granted" });
  const id = app.sdk.visitorId();
  const sid = app.sdk.sessionId();
  await app.sdk.consent({ marketing: "denied", advertising: "denied" });
  assert.equal(app.sdk.visitorId(), id);
  assert.equal(app.sdk.sessionId(), sid);
});

test("necessary form-submission evidence stays available while optional analytics is denied", async () => {
  const app = boot();
  await app.sdk.consent({ analytics: "granted" });
  await app.sdk.consent({ analytics: "denied" });
  const before = app.eventCalls("web.form_submitted").length;
  await app.sdk.track("web.form_submitted", { form_id: "synthetic" }, { queue: false });
  assert.equal(app.eventCalls("web.form_submitted").length, before + 1);
  assert.equal((await app.sdk.track("web.page_viewed", {})).privacy_blocked, true);
});

test("previously withdrawn identity is never reused by a same-tab reload", async () => {
  const app = boot();
  await app.sdk.consent({ analytics: "granted" });
  const old = app.sdk.visitorId();
  await app.sdk.consent({ analytics: "withdrawn" });
  const reloaded = boot({ local: app.local, session: app.session });
  assert.notEqual(reloaded.sdk.visitorId(), old);
  assert.equal(reloaded.local.getItem("salsys_vid"), null);
});

test("a pre-withdrawal event that fails after regrant never enters the new identity's retry queue", async () => {
  let rejectOld;
  const app = boot({
    eventResponse(body) {
      if (body.properties?.case === "pre-withdrawal-request") {
        return new Promise((_resolve, reject) => { rejectOld = reject; });
      }
      return { ok: true, json: async () => ({ ok: true, accepted: true }) };
    },
  });
  await app.sdk.consent({ analytics: "granted" });
  await settle();
  const oldVisitor = app.sdk.visitorId();
  const old = app.sdk.track("web.page_viewed", { case: "pre-withdrawal-request" });
  assert.equal(typeof rejectOld, "function");
  await app.sdk.consent({ analytics: "withdrawn" });
  await app.sdk.consent({ analytics: "granted" });
  assert.notEqual(app.sdk.visitorId(), oldVisitor);
  rejectOld(new Error("synthetic old network request failed"));
  await assert.rejects(old, /synthetic old network request failed/);
  await settle();
  const queue = JSON.parse(app.local.getItem("salsys_event_queue_v1") || "[]");
  assert.equal(queue.length, 0, "an old visitor event cannot be retried after new consent");
});

test("failed analytics regrant keeps the local opt-out and no persistent visitor identity", async () => {
  const app = boot({
    consentResponse: async (body) => {
      if (body.decisions.analytics === "granted" &&
          appWasWithdrawn) throw new Error("synthetic grant rejected");
      return consentAck(body);
    },
  });
  let appWasWithdrawn = false;
  await app.sdk.consent({ analytics: "granted" });
  await app.sdk.consent({ analytics: "withdrawn" });
  appWasWithdrawn = true;
  await assert.rejects(() => app.sdk.consent({ analytics: "granted" }), /synthetic grant rejected/);
  assert.equal(app.sdk.privacy().analytics_allowed_locally, false);
  assert.equal(app.local.getItem("salsys_vid"), null);
  assert.equal((await app.sdk.track("web.page_viewed", {})).privacy_blocked, true);
});

test("an explicit analytics opt-out takes priority over a default granted site mode on reload", async () => {
  const app = boot({ mode: "granted" });
  await settle(); // synthetic site-mode bootstrap
  const oldVisitor = app.sdk.visitorId();
  await app.sdk.consent({ analytics: "denied" });
  assert.equal(app.sdk.privacy().analytics_allowed_locally, false);
  const reloaded = boot({ local: app.local, session: app.session, mode: "granted" });
  await settle();
  assert.notEqual(reloaded.sdk.visitorId(), oldVisitor);
  assert.equal(reloaded.sdk.privacy().analytics_allowed_locally, false);
  assert.equal(reloaded.eventCalls("web.page_viewed").length, 0);
});

test("a contradictory remote opt-out acknowledgement cannot reenable analytics locally", async () => {
  const app = boot({
    consentResponse: async (body) => consentAck(
      body,
      body.decisions.analytics === "denied"
        ? { analytics: "granted" }
        : body.decisions,
    ),
  });
  await app.sdk.consent({ analytics: "granted" });
  await assert.rejects(
    () => app.sdk.consent({ analytics: "denied" }),
    /Privacy preference server receipt was not verified/,
  );
  assert.equal(app.sdk.privacy().analytics_allowed_locally, false);
  assert.equal(app.local.getItem("salsys_vid"), null);
});


test("two tabs immediately sever old analytics IDs when one tab withdraws consent", async () => {
  const shared = storage();
  const first = boot({ local: shared });
  await first.sdk.consent({ analytics: "granted" });
  const second = boot({ local: shared });
  await settle();
  const oldVisitor = second.sdk.visitorId();
  const oldSession = second.sdk.sessionId();
  assert.equal(first.sdk.visitorId(), oldVisitor);

  await first.sdk.consent({ analytics: "withdrawn" });
  second.emitStorage("salsys_privacy_v1", shared.getItem("salsys_privacy_v1"));
  assert.equal(second.sdk.privacy().analytics_allowed_locally, false);
  assert.equal((await second.sdk.track("web.page_viewed", {})).privacy_blocked, true);
  assert.notEqual(second.sdk.visitorId(), oldVisitor, "other tab must not retain prior visitor ID");
  assert.notEqual(second.sdk.sessionId(), oldSession, "other tab must not retain prior session ID");
  assert.equal(second.session.getItem("salsys_vid_session"), null);
  assert.equal(second.session.getItem("salsys_sid"), null);
  assert.equal(second.form.field("salsys_visitor_id"), second.sdk.visitorId());
  assert.equal(second.form.field("salsys_session_id"), second.sdk.sessionId());
});

test("two tabs wait for a post-grant identity before resuming optional analytics", async () => {
  const shared = storage();
  const first = boot({ local: shared });
  await first.sdk.consent({ analytics: "granted" });
  const second = boot({ local: shared });
  const oldVisitor = second.sdk.visitorId();
  await first.sdk.consent({ analytics: "withdrawn" });
  second.emitStorage("salsys_privacy_v1", shared.getItem("salsys_privacy_v1"));
  await first.sdk.consent({ analytics: "granted" });
  const acknowledgedVisitor = shared.getItem("salsys_vid");
  assert.ok(acknowledgedVisitor);
  // Simulate browser delivery of the grant decision BEFORE the later
  // persistent-visitor storage write from the other tab is observed.
  shared.removeItem("salsys_vid");
  second.emitStorage("salsys_privacy_v1", shared.getItem("salsys_privacy_v1"));
  assert.equal((await second.sdk.track("web.page_viewed", {})).privacy_blocked, true,
    "privacy grant state alone must not resume a tab with unbound identity");
  shared.setItem("salsys_vid", acknowledgedVisitor);
  second.emitStorage("salsys_vid", acknowledgedVisitor);
  await settle();
  assert.notEqual(second.sdk.visitorId(), oldVisitor);
  assert.equal(second.sdk.visitorId(), first.sdk.visitorId(),
    "both tabs may share the NEW first-party visitor ID after regrant");
  assert.notEqual(second.sdk.sessionId(), first.sdk.sessionId(),
    "separate tabs must use different session keys");
  assert.equal(second.sdk.privacy().analytics_allowed_locally, true);
  assert.ok(second.eventCalls("web.session_started").some(
    (event) => event.body.anonymous_visitor_id === first.sdk.visitorId()
      && event.body.session_key === second.sdk.sessionId()
  ));
});

test("cross-tab privacy storage clearing fails closed rather than resuming a default grant", async () => {
  const shared = storage();
  const first = boot({ local: shared, mode: "granted" });
  await settle();
  const second = boot({ local: shared, mode: "granted" });
  await settle();
  const before = second.sdk.visitorId();
  shared.removeItem("salsys_privacy_v1");
  second.emitStorage("salsys_privacy_v1", null);
  assert.equal(second.sdk.privacy().analytics_allowed_locally, false);
  assert.notEqual(second.sdk.visitorId(), before);
  assert.equal((await second.sdk.track("web.page_viewed", {})).privacy_blocked, true);
});

test("a tab must not resurrect an old visitor retry queue after cross-tab withdrawal/regrant", async () => {
  let rejectOld;
  const shared = storage();
  const first = boot({ local: shared });
  await first.sdk.consent({ analytics: "granted" });
  const second = boot({
    local: shared,
    eventResponse(body) {
      if (body.properties?.case === "old-other-tab-request") {
        return new Promise((_resolve, reject) => { rejectOld = reject; });
      }
      return { ok: true, json: async () => ({ ok: true, accepted: true }) };
    },
  });
  const pending = second.sdk.track("web.page_viewed", { case: "old-other-tab-request" });
  await first.sdk.consent({ analytics: "withdrawn" });
  second.emitStorage("salsys_privacy_v1", shared.getItem("salsys_privacy_v1"));
  await first.sdk.consent({ analytics: "granted" });
  second.emitStorage("salsys_privacy_v1", shared.getItem("salsys_privacy_v1"));
  second.emitStorage("salsys_vid", shared.getItem("salsys_vid"));
  rejectOld(new Error("synthetic delayed old-tab request"));
  await assert.rejects(pending, /synthetic delayed old-tab request/);
  await settle();
  assert.deepEqual(JSON.parse(shared.getItem("salsys_event_queue_v1") || "[]"), []);
});


test("missed storage events cannot reconnect a stale visitor on same-tab regrant", async () => {
  const shared = storage();
  const first = boot({ local: shared });
  await first.sdk.consent({ analytics: "granted" });
  const second = boot({ local: shared });
  const revokedVisitor = second.sdk.visitorId();
  await first.sdk.consent({ analytics: "withdrawn" });
  // This tab was frozen, so it missed the remote privacy storage event.
  assert.equal((await second.sdk.track("web.page_viewed", {})).privacy_blocked, true);
  await second.sdk.consent({ analytics: "granted" });
  assert.notEqual(second.sdk.visitorId(), revokedVisitor);
  assert.equal(second.local.getItem("salsys_vid"), second.sdk.visitorId());
});

test("restoring a frozen tab reconciles remote opt-out and later verified regrant", async () => {
  const shared = storage();
  const first = boot({ local: shared });
  await first.sdk.consent({ analytics: "granted" });
  const second = boot({ local: shared });
  const oldVisitor = second.sdk.visitorId();
  await first.sdk.consent({ analytics: "withdrawn" });
  const pageshow = second.windowListeners.pageshow?.[0];
  assert.equal(typeof pageshow, "function");
  pageshow({ persisted: true });
  assert.equal(second.sdk.privacy().analytics_allowed_locally, false);
  assert.notEqual(second.sdk.visitorId(), oldVisitor);
  await first.sdk.consent({ analytics: "granted" });
  // No 'storage' callback delivered while the tab was in the BFCache.
  pageshow({ persisted: true });
  await settle();
  assert.equal(second.sdk.visitorId(), first.sdk.visitorId());
  assert.notEqual(second.sdk.sessionId(), first.sdk.sessionId());
  assert.equal(second.sdk.privacy().analytics_allowed_locally, true);
});


test("a restored tab reload cannot overwrite the new post-withdrawal shared visitor ID", async () => {
  const shared = storage();
  const first = boot({ local: shared });
  await first.sdk.consent({ analytics: "granted" });
  const second = boot({ local: shared });
  const oldVisitor = second.sdk.visitorId();
  const oldSession = second.sdk.sessionId();
  await first.sdk.consent({ analytics: "withdrawn" });
  await first.sdk.consent({ analytics: "granted" });
  // Old sessionStorage survived while the tab was frozen; no storage event ran.
  const restored = boot({ local: shared, session: second.session });
  await settle();
  assert.notEqual(restored.sdk.visitorId(), oldVisitor);
  assert.equal(restored.sdk.visitorId(), first.sdk.visitorId());
  assert.notEqual(restored.sdk.sessionId(), oldSession);
  assert.equal(shared.getItem("salsys_vid"), first.sdk.visitorId());
  assert.ok(restored.eventCalls("web.session_started").every(
    (event) => event.body.anonymous_visitor_id === first.sdk.visitorId()
  ));
});


test("a stale pending grant cannot override another tab's later withdrawal", async () => {
  const shared = storage();
  let finishGrant;
  let grantBody;
  const first = boot({
    local: shared,
    consentResponse(body) {
      if (body.decisions.analytics === "granted") {
        grantBody = body;
        return new Promise((resolve) => { finishGrant = resolve; });
      }
      return consentAck(body);
    },
  });
  const oldGrant = first.sdk.consent({ analytics: "granted" });
  await settle();
  assert.equal(typeof finishGrant, "function");
  const second = boot({ local: shared });
  await second.sdk.consent({ analytics: "withdrawn" });
  first.emitStorage("salsys_privacy_v1", shared.getItem("salsys_privacy_v1"),
    JSON.stringify({ analytics: "granted" }));
  finishGrant(consentAck(grantBody));
  await assert.rejects(oldGrant, /Consent request superseded/);
  assert.equal(first.sdk.privacy().analytics_allowed_locally, false);
  assert.equal(shared.getItem("salsys_vid"), null);
  assert.equal((await first.sdk.track("web.page_viewed", {})).privacy_blocked, true);
});
