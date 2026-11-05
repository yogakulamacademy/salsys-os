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
function boot({
  local = storage(),
  session = storage(),
  mode = "required",
  consentResponse = null,
  trackedForm = form(),
} = {}) {
  const calls = [];
  const docListeners = {};
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
    addEventListener() {},
  };
  async function fetch(url, opts) {
    const body = JSON.parse(opts.body);
    calls.push({ url: String(url), body });
    if (String(url).includes("/privacy/consent/")) {
      return typeof consentResponse === "function"
        ? consentResponse(body)
        : { ok: true, json: async () => ({ effective_decisions: body.decisions }) };
    }
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
  return { sdk: window.Salsys, local, session, form: trackedForm, calls, eventCalls, window, docListeners };
}
async function settle() { await new Promise((resolve) => setImmediate(resolve)); }

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
  const app = boot({
    consentResponse: (body) => {
      if (body.decisions.analytics === "withdrawn") {
        return new Promise((resolve) => { completeWithdrawal = resolve; });
      }
      return { ok: true, json: async () => ({ effective_decisions: body.decisions }) };
    },
  });
  await app.sdk.consent({ analytics: "granted" });
  const preWithdrawal = app.sdk.visitorId();
  const pending = app.sdk.consent({ analytics: "withdrawn" });
  const event = await app.sdk.track("web.page_viewed", { action: "synthetic-post-optout" });
  assert.equal(event.privacy_blocked, true);
  assert.notEqual(app.sdk.visitorId(), preWithdrawal);
  assert.equal(app.local.getItem("salsys_vid"), null);
  completeWithdrawal({ ok: true, json: async () => ({ effective_decisions: { analytics: "withdrawn" } }) });
  await pending;
});

test("failed withdrawal records a local opt-out and never resumes optional analytics", async () => {
  const app = boot({
    consentResponse: async (body) => {
      if (body.decisions.analytics === "denied") throw new Error("synthetic network failure");
      return { ok: true, json: async () => ({ effective_decisions: body.decisions }) };
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
