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
      body: JSON.stringify({
        ok: true,
        visitor_id: body.visitor_id,
        effective_decisions: body.decisions,
        receipts: Object.entries(body.decisions).map(([purpose, decision], index) => ({
          purpose, decision, receipt_id: "synthetic-receipt-" + index,
        })),
      }) });
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


test("native Chromium: actual form submission keeps necessary identity separate across consent epochs", async ({ context }) => {
  // Submit the real DOM form via a browser click. A tiny simulated application
  // handler forwards the browser-generated FormData as URL-encoded POST to an
  // intercepted loopback endpoint. No lead, email, or CRM record is created.
  const api = await instrument(context, "required");
  const submissions: { visitor: string | null; session: string | null }[] = [];
  await context.route("**/local-noop", async (route) => {
    if (route.request().method() !== "POST") {
      await route.fulfill({ status: 405, body: "Only synthetic POST accepted" });
      return;
    }
    const fields = new URLSearchParams(route.request().postData() || "");
    submissions.push({
      visitor: fields.get("salsys_visitor_id"),
      session: fields.get("salsys_session_id"),
    });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: '{"ok":true,"synthetic":true}',
    });
  });

  const page = await openHarness(context);
  await page.evaluate(() => {
    const form = document.getElementById("test-form") as HTMLFormElement;
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const encoded = new URLSearchParams();
      new FormData(form).forEach((value, key) => {
        if (typeof value === "string") encoded.append(key, value);
      });
      void fetch("/local-noop", {
        method: "POST", body: encoded, credentials: "omit",
      });
    });
  });

  const submit = async (expectedCount: number) => {
    // This invokes the SDK's actual capture-phase submit listener and causes
    // a synthetic POST of the form, not a direct SDK.track() test call.
    await page.locator("#test-form button[type=submit]").click();
    await expect.poll(() => submissions.length).toBe(expectedCount);
    await expect.poll(() => api.events.filter(
      (event) => event.event_name === "web.form_submitted").length).toBe(expectedCount);
    return {
      fields: submissions[expectedCount - 1],
      evidence: api.events.filter(
        (event) => event.event_name === "web.form_submitted")[expectedCount - 1],
    };
  };

  await chooseAnalytics(page, "granted");
  const original = await identity(page);
  const first = await submit(1);
  expect(original.granted).toBe(true);
  expect(first.fields).toEqual({ visitor: original.visitor, session: original.session });
  expect(first.evidence.anonymous_visitor_id).toBe(original.visitor);
  expect(first.evidence.session_key).toBe(original.session);

  await chooseAnalytics(page, "withdrawn");
  const withdrawn = await identity(page);
  expect(withdrawn.granted).toBe(false);
  expect(withdrawn.visitor).not.toBe(original.visitor);
  expect(withdrawn.session).not.toBe(original.session);
  expect(withdrawn.sharedVisitor).toBe(null);
  const optionalCount = api.events.filter(
    (event) => event.event_name === "web.page_viewed").length;
  const second = await submit(2);
  expect(second.fields).toEqual({ visitor: withdrawn.visitor, session: withdrawn.session });
  expect(second.evidence.anonymous_visitor_id).toBe(withdrawn.visitor);
  expect(second.evidence.session_key).toBe(withdrawn.session);
  expect(api.events.filter(
    (event) => event.event_name === "web.page_viewed").length).toBe(optionalCount);
  expect((await blockedOptional(page)).privacy_blocked).toBe(true);

  await chooseAnalytics(page, "granted");
  const afterRegrant = await identity(page);
  expect(afterRegrant.granted).toBe(true);
  expect(afterRegrant.visitor).toBe(withdrawn.visitor);
  expect(afterRegrant.visitor).not.toBe(original.visitor);
  expect(afterRegrant.session).toBe(withdrawn.session);
  const third = await submit(3);
  expect(third.fields).toEqual({
    visitor: afterRegrant.visitor, session: afterRegrant.session,
  });
  expect(third.evidence.anonymous_visitor_id).toBe(afterRegrant.visitor);
  expect(third.evidence.session_key).toBe(afterRegrant.session);
  expect(submissions.slice(1).every(
    (post) => post.visitor !== original.visitor && post.session !== original.session,
  )).toBe(true);
  expect(api.receipts.map((receipt) => receipt.decisions.analytics)).toEqual([
    "granted", "withdrawn", "granted",
  ]);
  // Optional analytics must never contain a synthetic form email in properties.
  expect(api.events.some((event) =>
    JSON.stringify(event.properties ?? {}).includes("synthetic@example.test"))).toBe(false);
});


for (const invalidAck of [
  { name: "missing success flag", variant: "missing-ok" },
  { name: "wrong visitor acknowledgement", variant: "wrong-visitor" },
  { name: "missing persisted receipt", variant: "missing-receipt" },
  { name: "contradictory analytics decision", variant: "contradictory" },
  { name: "unexpected effective purpose", variant: "unexpected-purpose" },
  { name: "unrequested advertising grant with receipt", variant: "unrequested-grant" },
  { name: "extra unrequested advertising receipt outside effective decisions", variant: "extra-receipt" },
  { name: "extra unrequested denied analytics receipt outside effective decisions", variant: "extra-denied-receipt" },
] as const) {
  test("native Chromium: 200 consent response with " + invalidAck.name +
    " cannot unlock optional tracking", async ({ context }) => {
    const api = await instrument(context);
    await context.route("**/api/privacy/consent/v1", async (route) => {
      const request = route.request().postDataJSON() as {
        visitor_id: string; decisions: Record<string, string>;
      };
      const response: {
        ok?: boolean; visitor_id: string;
        effective_decisions: Record<string, string>;
        receipts: { purpose: string; decision: string; receipt_id: string }[];
      } = {
        ok: true, visitor_id: request.visitor_id,
        effective_decisions: { ...request.decisions },
        receipts: Object.entries(request.decisions).map(([purpose, decision]) => ({
          purpose, decision, receipt_id: "synthetic-confirmed-receipt",
        })),
      };
      if (invalidAck.variant === "missing-ok") delete response.ok;
      if (invalidAck.variant === "wrong-visitor") response.visitor_id = "v_other-visitor";
      if (invalidAck.variant === "missing-receipt") response.receipts = [];
      if (invalidAck.variant === "contradictory") response.effective_decisions.analytics = "denied";
      if (invalidAck.variant === "unexpected-purpose") {
        response.effective_decisions.unrecognized = "granted";
      }
      if (invalidAck.variant === "unrequested-grant") {
        response.effective_decisions.advertising = "granted";
        response.receipts.push({
          purpose: "advertising", decision: "granted",
          receipt_id: "synthetic-unrequested-grant",
        });
      }
      if (invalidAck.variant === "extra-receipt") {
        // Summary says only analytics was persisted, while receipt list
        // claims an additional unrequested advertising GRANT.
        response.receipts.push({
          purpose: "advertising", decision: "granted",
          receipt_id: "synthetic-hidden-advertising-grant",
        });
      }
      if (invalidAck.variant === "extra-denied-receipt") {
        response.receipts.push({
          purpose: "analytics", decision: "denied",
          receipt_id: "synthetic-conflicting-denial",
        });
      }
      await route.fulfill({
        status: 200, contentType: "application/json", body: JSON.stringify(response),
      });
    });
    const page = await openHarness(context);
    await expect(chooseAnalytics(page, "granted")).rejects.toThrow(
      "Privacy preference server receipt was not verified",
    );
    const after = await identity(page);
    expect(after.granted).toBe(false);
    expect(after.sharedVisitor).toBe(null);
    expect((await blockedOptional(page)).privacy_blocked).toBe(true);
    expect(api.events.some((event) => event.event_name === "web.page_viewed")).toBe(false);
    expect(await page.evaluate(() => localStorage.getItem("salsys_privacy_v1"))).toBe(null);
  });
}

test("native Chromium: malformed 200 withdrawal acknowledgement keeps local privacy block and rotated identity",
  async ({ context }) => {
    const api = await instrument(context);
    const page = await openHarness(context);
    await chooseAnalytics(page, "granted");
    const original = await identity(page);
    expect(original.granted).toBe(true);

    await context.route("**/api/privacy/consent/v1", async (route) => {
      await route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify({ ok: true, effective_decisions: { analytics: "withdrawn" } }),
      });
    });
    await expect(chooseAnalytics(page, "withdrawn")).rejects.toThrow(
      "Privacy preference server receipt was not verified",
    );
    const after = await identity(page);
    expect(after.visitor).not.toBe(original.visitor);
    expect(after.session).not.toBe(original.session);
    expect(after.sharedVisitor).toBe(null);
    expect(after.granted).toBe(false);
    expect((await blockedOptional(page)).privacy_blocked).toBe(true);
    const count = api.events.length;
    await page.evaluate(() => (window as any).Salsys.track("web.form_submitted",
      { form_id: "malformed-receipt-test" }, { queue: false }));
    await expect.poll(() => api.events.length).toBe(count + 1);
    expect(api.events.at(-1)?.anonymous_visitor_id).toBe(after.visitor);
  });


test("native Chromium: server-added GPC sale-sharing opt-out is accepted only with a receipt",
  async ({ context }) => {
    const api = await instrument(context);
    await context.route("**/api/privacy/consent/v1", async (route) => {
      const input = route.request().postDataJSON() as {
        visitor_id: string; decisions: Record<string, string>;
      };
      await route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          visitor_id: input.visitor_id,
          effective_decisions: {
            ...input.decisions,
            sale_sharing: "opted_out",
          },
          receipts: [
            ...Object.entries(input.decisions).map(([purpose, decision], index) => ({
              purpose, decision, receipt_id: "synthetic-" + index,
            })),
            {
              purpose: "sale_sharing", decision: "opted_out",
              receipt_id: "synthetic-gpc-receipt",
            },
          ],
        }),
      });
    });
    const page = await openHarness(context);
    await chooseAnalytics(page, "granted");
    const state = await identity(page);
    expect(state.granted).toBe(true);
    expect(state.sharedVisitor).toBe(state.visitor);
    expect(await page.evaluate(() => JSON.parse(
      localStorage.getItem("salsys_privacy_v1") || "{}",
    ).sale_sharing)).toBe("opted_out");
    await expect.poll(() => api.events.some((event) =>
      event.event_name === "web.session_started" &&
      event.anonymous_visitor_id === state.visitor)).toBe(true);
  });
