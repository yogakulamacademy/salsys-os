import { expect, test, type BrowserContext, type Page } from "@playwright/test";

// Native Chromium storage events and separate tab sessionStorage, using the
// actual public SDK. All consent and event requests remain loopback-intercepted.
const HARNESS = "/__salsys_privacy_local_browser_harness";
type BrowserEvent = {
  event_name: string;
  anonymous_visitor_id: string;
  session_key: string;
  properties?: Record<string, unknown>;
};

async function instrument(context: BrowserContext, mode = "required") {
  const events: BrowserEvent[] = [];
  const receipts: { decisions: Record<string, string>; visitor_id?: string }[] = [];
  let rejectDenial = false;
  const html = [
    '<!doctype html><html lang="en"><head><meta charset="utf-8">',
    '<title>Private local consent test</title></head><body>',
    '<form id="test-form" name="test-lead" action="/local-noop">',
    '<input type="email" name="email" value="synthetic@example.test">',
    '<button type="submit">Synthetic submit</button></form>',
    '<script src="/salsys-tracker.js" data-site="test-origin.invalid"',
    ' data-consent-mode="' + mode + '" data-auto-page="true"',
    ' data-auto-forms="true" data-auto-spa="false"></script>',
    '</body></html>',
  ].join("");
  await context.route("**" + HARNESS, async (route) => {
    await route.fulfill({
      status: 200, contentType: "text/html; charset=utf-8",
      headers: { "Cache-Control": "no-store" }, body: html,
    });
  });
  await context.route("**/api/privacy/consent/v1", async (route) => {
    const body = route.request().postDataJSON() as { decisions: Record<string, string>; visitor_id?: string };
    receipts.push(body);
    if (rejectDenial && ["denied", "withdrawn", "opted_out"].includes(body.decisions.analytics)) {
      await route.fulfill({ status: 503, contentType: "application/json",
        body: JSON.stringify({ error: "Synthetic consent service unavailable" }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ effective_decisions: body.decisions }) });
  });
  await context.route("**/api/events/browser/v1", async (route) => {
    const body = route.request().postDataJSON() as BrowserEvent;
    events.push(body);
    await route.fulfill({ status: 200, contentType: "application/json",
      body: '{"ok":true,"accepted":true}' });
  });
  return { events, receipts, setRejectDenial: (value: boolean) => { rejectDenial = value; } };
}

async function openHarness(context: BrowserContext) {
  const page = await context.newPage();
  await page.goto(HARNESS);
  await page.waitForFunction(() => Boolean((window as any).Salsys?.__eventIntelligenceV1));
  return page;
}

async function identity(page: Page) {
  return page.evaluate(() => ({
    visitor: (window as any).Salsys.visitorId() as string,
    session: (window as any).Salsys.sessionId() as string,
    granted: (window as any).Salsys.privacy().analytics_allowed_locally as boolean,
    formVisitor: (document.querySelector('input[name="salsys_visitor_id"]') as HTMLInputElement | null)?.value,
    formSession: (document.querySelector('input[name="salsys_session_id"]') as HTMLInputElement | null)?.value,
    sharedVisitor: localStorage.getItem("salsys_vid"),
  }));
}

async function chooseAnalytics(page: Page, decision: "granted" | "denied" | "withdrawn") {
  return page.evaluate((value) => (window as any).Salsys.consent({ analytics: value }), decision);
}

async function blockedOptional(page: Page) {
  return page.evaluate(() => (window as any).Salsys.track("web.page_viewed", { case: "privacy-regression" }));
}

test("native Chromium: two tabs revoke old identities, then regrant with new shared visitor and separate sessions", async ({ context }) => {
  const api = await instrument(context);
  const first = await openHarness(context);
  await chooseAnalytics(first, "granted");
  const original = await identity(first);
  expect(original.granted).toBe(true);
  expect(original.sharedVisitor).toBe(original.visitor);
  expect(original.formVisitor).toBe(original.visitor);
  expect(original.formSession).toBe(original.session);

  const second = await openHarness(context);
  const sameEpoch = await identity(second);
  expect(sameEpoch.visitor).toBe(original.visitor);
  expect(sameEpoch.session).not.toBe(original.session);
  expect(sameEpoch.granted).toBe(true);

  await chooseAnalytics(first, "withdrawn");
  await expect.poll(async () => (await identity(second)).granted).toBe(false);
  const revokedFirst = await identity(first);
  const revokedSecond = await identity(second);
  expect(revokedFirst.visitor).not.toBe(original.visitor);
  expect(revokedSecond.visitor).not.toBe(original.visitor);
  expect(revokedSecond.session).not.toBe(sameEpoch.session);
  expect(revokedSecond.formVisitor).toBe(revokedSecond.visitor);
  expect(revokedSecond.formSession).toBe(revokedSecond.session);
  expect(revokedFirst.sharedVisitor).toBe(null);
  expect((await blockedOptional(second)).privacy_blocked).toBe(true);
  const eventsAtWithdrawal = api.events.length;

  await chooseAnalytics(first, "granted");
  await expect.poll(async () => (await identity(second)).granted).toBe(true);
  const newFirst = await identity(first);
  const newSecond = await identity(second);
  expect(newFirst.visitor).not.toBe(original.visitor);
  expect(newSecond.visitor).toBe(newFirst.visitor);
  expect(newSecond.session).not.toBe(newFirst.session);
  expect(newSecond.session).not.toBe(sameEpoch.session);
  expect(newSecond.formVisitor).toBe(newFirst.visitor);
  expect(newSecond.formSession).toBe(newSecond.session);
  await expect.poll(() => api.events.some((event) =>
    event.event_name === "web.session_started" &&
    event.anonymous_visitor_id === newSecond.visitor &&
    event.session_key === newSecond.session)).toBe(true);
  expect(api.events.slice(eventsAtWithdrawal).some((event) =>
    event.anonymous_visitor_id === original.visitor)).toBe(false);
  expect(api.receipts.some((receipt) => receipt.decisions.analytics === "withdrawn")).toBe(true);
});

test("native Chromium: reload after remote withdrawal and regrant does not resurrect stale sessionStorage", async ({ context }) => {
  await instrument(context);
  const first = await openHarness(context);
  await chooseAnalytics(first, "granted");
  const second = await openHarness(context);
  const before = await identity(second);
  await chooseAnalytics(first, "withdrawn");
  await expect.poll(async () => (await identity(second)).granted).toBe(false);
  await chooseAnalytics(first, "granted");
  const current = await identity(first);
  await second.reload();
  await second.waitForFunction(() => Boolean((window as any).Salsys?.__eventIntelligenceV1));
  const restored = await identity(second);
  expect(restored.visitor).toBe(current.visitor);
  expect(restored.visitor).not.toBe(before.visitor);
  expect(restored.session).not.toBe(before.session);
  expect(restored.session).not.toBe(current.session);
  expect(restored.formVisitor).toBe(current.visitor);
  expect(restored.granted).toBe(true);
});

test("native Chromium: failed opt-out receipt blocks optional analytics but preserves necessary form evidence", async ({ context }) => {
  const api = await instrument(context);
  const page = await openHarness(context);
  await chooseAnalytics(page, "granted");
  const initial = await identity(page);
  api.setRejectDenial(true);
  await expect(chooseAnalytics(page, "denied")).rejects.toThrow();
  const denied = await identity(page);
  expect(denied.granted).toBe(false);
  expect(denied.visitor).not.toBe(initial.visitor);
  expect(denied.sharedVisitor).toBe(null);
  expect((await blockedOptional(page)).privacy_blocked).toBe(true);
  const start = api.events.filter((entry) => entry.event_name === "web.form_submitted").length;
  await page.evaluate(() => (window as any).Salsys.track("web.form_submitted",
    { form_id: "local-synthetic" }, { queue: false }));
  await expect.poll(() => api.events.filter((entry) => entry.event_name === "web.form_submitted").length)
    .toBe(start + 1);
  expect(api.events.at(-1)?.event_name).toBe("web.form_submitted");
  expect(api.events.at(-1)?.anonymous_visitor_id).toBe(denied.visitor);
});


for (const deniedStorage of ["local", "session"] as const) {
  test(`native Chromium: ${deniedStorage} browser storage API denied does not resurrect prior consent identity`,
    async ({ context }) => {
      // Real Chromium page with explicitly denied Storage methods. The SDK's
      // safeGet/safeSet/safeRemove wrappers must fail closed and keep the
      // necessary form evidence independent of optional analytics consent.
      await context.addInitScript((kind) => {
        const unavailable = () => new DOMException("Synthetic storage denied", "SecurityError");
        const blocked = (storage: Storage) => kind === "local"
          ? storage === window.localStorage
          : storage === window.sessionStorage;
        const get = Storage.prototype.getItem;
        const set = Storage.prototype.setItem;
        const remove = Storage.prototype.removeItem;
        Storage.prototype.getItem = function (key: string) {
          if (blocked(this)) throw unavailable();
          return get.call(this, key);
        };
        Storage.prototype.setItem = function (key: string, value: string) {
          if (blocked(this)) throw unavailable();
          return set.call(this, key, value);
        };
        Storage.prototype.removeItem = function (key: string) {
          if (blocked(this)) throw unavailable();
          return remove.call(this, key);
        };
      }, deniedStorage);

      const api = await instrument(context);
      const page = await openHarness(context);
      const snapshot = () => page.evaluate(() => ({
        visitor: (window as any).Salsys.visitorId() as string,
        session: (window as any).Salsys.sessionId() as string,
        allowed: (window as any).Salsys.privacy().analytics_allowed_locally as boolean,
        formVisitor: (document.querySelector('input[name="salsys_visitor_id"]') as HTMLInputElement | null)?.value,
        formSession: (document.querySelector('input[name="salsys_session_id"]') as HTMLInputElement | null)?.value,
        sharedVisitor: (() => {
          try { return localStorage.getItem("salsys_vid"); } catch { return null; }
        })(),
      }));

      await chooseAnalytics(page, "granted");
      const initial = await snapshot();
      expect(initial.formVisitor).toBe(initial.visitor);
      expect(initial.formSession).toBe(initial.session);
      if (deniedStorage === "local") {
        // A network acknowledgement without persistent local privacy state
        // must not accidentally unlock optional analytics.
        expect(initial.allowed).toBe(false);
        expect(initial.sharedVisitor).toBe(null);
        expect((await blockedOptional(page)).privacy_blocked).toBe(true);
      } else {
        expect(initial.allowed).toBe(true);
        expect(initial.sharedVisitor).toBe(initial.visitor);
      }

      await chooseAnalytics(page, "withdrawn");
      const withdrawn = await snapshot();
      expect(withdrawn.allowed).toBe(false);
      expect(withdrawn.visitor).not.toBe(initial.visitor);
      expect(withdrawn.session).not.toBe(initial.session);
      expect(withdrawn.sharedVisitor).toBe(null);
      expect(withdrawn.formVisitor).toBe(withdrawn.visitor);
      expect(withdrawn.formSession).toBe(withdrawn.session);
      expect((await blockedOptional(page)).privacy_blocked).toBe(true);

      await chooseAnalytics(page, "granted");
      const regranted = await snapshot();
      expect(regranted.visitor).toBe(withdrawn.visitor);
      expect(regranted.visitor).not.toBe(initial.visitor);
      expect(regranted.session).not.toBe(initial.session);
      expect(regranted.formVisitor).toBe(regranted.visitor);
      expect(regranted.formSession).toBe(regranted.session);
      if (deniedStorage === "local") {
        expect(regranted.allowed).toBe(false);
        expect(regranted.sharedVisitor).toBe(null);
        expect((await blockedOptional(page)).privacy_blocked).toBe(true);
        expect(api.events.some((entry) => entry.event_name === "web.page_viewed")).toBe(false);
      } else {
        expect(regranted.allowed).toBe(true);
        expect(regranted.sharedVisitor).toBe(regranted.visitor);
      }

      // An explicitly necessary form event still works under storage denial;
      // it must use the post-withdrawal visitor and session.
      await page.evaluate(() => (window as any).Salsys.track("web.form_submitted",
        { form_id: "storage-denied-synthetic" }, { queue: false }));
      await expect.poll(() => api.events.some((entry) =>
        entry.event_name === "web.form_submitted" &&
        entry.anonymous_visitor_id === regranted.visitor &&
        entry.session_key === regranted.session)).toBe(true);
      expect(api.receipts.map((r) => r.decisions.analytics)).toEqual([
        "granted", "withdrawn", "granted",
      ]);
    });
}
