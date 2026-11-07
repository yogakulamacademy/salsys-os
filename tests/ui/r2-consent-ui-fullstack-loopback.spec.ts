import { expect, test, type Page } from "@playwright/test";
import path from "node:path";

// Cross-draft integration: PR #530 consent identity SDK + real consent UI. All requests are intercepted
// and only the local Playwright fixture and repository JS files are served.
// NO production website, consent API, event receiver, tenant or customer data.
const HARNESS = "/__r2_consent_ui_fullstack_local";
const EVENTS = "/__r2_consent_ui_events_sink_local";
const RECEIPTS = "/__r2_consent_ui_receipts_sink_local";

type DecisionSet = Record<string, string>;
type ObservedEvent = { name: string; consentMode: string | undefined };
type PersistedPurposeReceipt = { purpose: string; decision: string; receipt_id: string };
type ObservedReceipt = {
  decisions: DecisionSet;
  requestVisitor: string;
  response: {
    ok: true;
    visitor_id: string;
    effective_decisions: DecisionSet;
    receipts: PersistedPurposeReceipt[];
  };
};
type Capture = { events: ObservedEvent[]; receipts: ObservedReceipt[] };

const JS_FILES = new Set([
  "/salsys-intelligence.js",
  "/salsys-intelligence-core-v1.6.0.js",
  "/salsys-tracker.js",
  "/salsys-intelligence-submit-fallback.js",
  "/salsys-consent.js",
]);

function html() {
  return [
    '<!doctype html><html lang="en"><head><meta charset="utf-8">',
    '<title>Disposable consent acceptance fixture</title>',
    '<script src="/salsys-intelligence.js"',
    ' data-endpoint="' + EVENTS + '"',
    ' data-consent-endpoint="' + RECEIPTS + '"',
    ' data-consent-mode="required"',
    ' data-form-mode="lead-only" data-salsys-lead-capture="off"',
    ' defer></script>',
    '<script src="/salsys-consent.js"',
    ' data-consent-banner="auto" data-consent-settings="floating"',
    ' defer></script>',
    '</head><body><main>Local synthetic course page, no student or lead data.</main></body></html>',
  ].join("");
}

async function openFixture(page: Page) {
  const captured: Capture = { events: [], receipts: [] };
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost") {
      await route.abort();
      return;
    }
    if (url.pathname === HARNESS && request.method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "text/html; charset=utf-8",
        headers: { "Cache-Control": "no-store" },
        body: html(),
      });
      return;
    }
    if (JS_FILES.has(url.pathname) && request.method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/javascript",
        path: path.resolve(process.cwd(), "public", url.pathname.slice(1)),
      });
      return;
    }
    if (url.pathname === EVENTS && request.method() === "POST") {
      const body = request.postDataJSON() as {
        event_name?: string;
        metadata?: { consent_mode?: string };
      };
      captured.events.push({
        name: String(body.event_name || ""),
        consentMode: body.metadata?.consent_mode,
      });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, accepted: true, synthetic: true }),
      });
      return;
    }
    if (url.pathname === RECEIPTS && request.method() === "POST") {
      const body = request.postDataJSON() as {
        visitor_id?: string;
        decisions?: DecisionSet;
        gpc?: boolean;
      };
      if (!body.visitor_id || !body.decisions || Object.keys(body.decisions).length === 0) {
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({ ok: false, error: "Invalid synthetic consent request" }),
        });
        return;
      }
      // Mirror the shape of app/api/privacy/consent/v1/route.ts, including
      // receipt evidence required by draft PR #530. This is NOT a real receipt.
      const effective_decisions = { ...body.decisions };
      if (body.gpc === true) effective_decisions.sale_sharing = "opted_out";
      const receipts = Object.entries(effective_decisions).map(([purpose, decision], index) => ({
        purpose,
        decision,
        receipt_id: "synthetic-local-receipt-" + captured.receipts.length + "-" + index,
      }));
      const response = {
        ok: true as const,
        visitor_id: body.visitor_id,
        site_id: "synthetic-local",
        site_id_verified: true,
        gpc: body.gpc === true,
        notice_version: "synthetic-local",
        receipts,
        effective_decisions,
        received_at: new Date().toISOString(),
      };
      captured.receipts.push({
        decisions: { ...body.decisions },
        requestVisitor: body.visitor_id,
        response,
      });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(response),
      });
      return;
    }
    await route.abort(); // Fail closed for unexpected local or external traffic.
  });

  await page.goto(HARNESS);
  await page.waitForFunction(() =>
    Boolean(
      (window as any).SalsysIntelligence?.__universalTrackingIntelligenceV1 &&
      (window as any).SalsysConsent?.__universalConsentUiV1
    ),
  );
  return captured;
}

async function allowed(page: Page) {
  return page.evaluate(() =>
    (window as any).SalsysIntelligence.privacy().analytics_allowed_locally as boolean,
  );
}

// Keep the loopback sink compatible with the real consent endpoint and the
// stricter receipt validation being separately reviewed in draft PR #530.
function assertStructuredConsentReceipt(row: ObservedReceipt) {
  expect(row.response.ok).toBe(true);
  expect(row.response.visitor_id).toBe(row.requestVisitor);
  for (const [purpose, decision] of Object.entries(row.decisions)) {
    expect(row.response.effective_decisions[purpose]).toBe(decision);
  }
  const effective = Object.entries(row.response.effective_decisions);
  expect(row.response.receipts).toHaveLength(effective.length);
  for (const [purpose, decision] of effective) {
    const matching = row.response.receipts.filter((receipt) =>
      receipt.purpose === purpose && receipt.decision === decision &&
      typeof receipt.receipt_id === "string" && receipt.receipt_id.length > 0);
    expect(matching).toHaveLength(1);
  }
}

test("R2 consent integration: first visit and reload without a choice emit no optional events or consent grants", async ({ page }) => {
  const captured = await openFixture(page);
  await expect(page.getByRole("dialog", { name: "Privacy choices" })).toBeVisible();
  expect(await allowed(page)).toBe(false);

  await page.evaluate(() => {
    history.pushState({}, "", "?selected_course=synthetic");
    history.replaceState({}, "", "#synthetic-section");
  });
  await page.waitForTimeout(150);
  expect(captured.events).toEqual([]);
  expect(captured.receipts).toEqual([]);

  await page.reload();
  await expect(page.getByRole("dialog", { name: "Privacy choices" })).toBeVisible();
  expect(await allowed(page)).toBe(false);
  await page.waitForTimeout(120);
  expect(captured.events).toEqual([]);
  expect(captured.receipts).toEqual([]);
});

test("R2 consent integration: Reject all persists across reload and never enables optional events", async ({ page }) => {
  const captured = await openFixture(page);
  await page.getByRole("dialog", { name: "Privacy choices" })
    .getByRole("button", { name: "Reject all" }).click();

  await expect.poll(() => captured.receipts.length).toBe(1);
  assertStructuredConsentReceipt(captured.receipts[0]);
  expect(captured.receipts[0].decisions).toMatchObject({
    analytics: "denied",
    marketing: "denied",
    advertising: "denied",
    personalization: "denied",
    sale_sharing: "opted_out",
  });
  expect(await allowed(page)).toBe(false);
  expect(captured.events).toEqual([]);
  // The sink captures the HTTP request before the SDK stores the response.
  // Wait for the actual UI's saved-choice state before navigating away.
  await expect(page.getByRole("button", { name: "Open privacy settings" }))
    .toBeVisible();

  await page.reload();
  await expect(page.getByRole("button", { name: "Open privacy settings" }))
    .toBeVisible();
  await expect(page.getByRole("dialog", { name: "Privacy choices" }))
    .toBeHidden();
  expect(await allowed(page)).toBe(false);
  await page.evaluate(() => history.pushState({}, "", "?reloaded=1"));
  await page.waitForTimeout(150);
  expect(captured.events).toEqual([]);
  expect(captured.receipts).toHaveLength(1);
});

test("R2 consent integration: Accept then customize Analytics off blocks future events and survives reload", async ({ page }) => {
  const captured = await openFixture(page);
  expect(captured.events).toHaveLength(0);
  await page.getByRole("dialog", { name: "Privacy choices" })
    .getByRole("button", { name: "Accept all" }).click();

  await expect.poll(() => captured.receipts.length).toBe(1);
  assertStructuredConsentReceipt(captured.receipts[0]);
  expect(captured.receipts[0].decisions.analytics).toBe("granted");
  await expect.poll(() => captured.events
    .filter((event) => event.name === "web.session_started" ||
      event.name === "web.page_viewed").length).toBe(2);
  expect(captured.events.every((event) => event.consentMode === "required")).toBe(true);
  expect(await allowed(page)).toBe(true);

  await page.getByRole("button", { name: "Open privacy settings" }).click();
  await page.getByRole("switch", { name: "Analytics" }).uncheck();
  await page.getByRole("dialog", { name: "Privacy settings" })
    .getByRole("button", { name: "Save choices" }).click();

  await expect.poll(() => captured.receipts.length).toBe(2);
  assertStructuredConsentReceipt(captured.receipts[1]);
  expect(captured.receipts[1].decisions.analytics).toBe("denied");
  // The intercepted request is captured before the browser applies the
  // successful consent response; wait for the real SDK state transition.
  await expect.poll(() => allowed(page)).toBe(false);

  const before = captured.events.length;
  const result = await page.evaluate(() =>
    (window as any).SalsysIntelligence.track("web.page_viewed", {
      category: "local_synthetic_after_withdrawal",
    }),
  );
  expect(result.privacy_blocked).toBe(true);
  await page.evaluate(() => history.pushState({}, "", "?after_withdrawal=1"));
  await page.waitForTimeout(150);
  expect(captured.events).toHaveLength(before);

  await page.reload();
  await expect(page.getByRole("button", { name: "Open privacy settings" }))
    .toBeVisible();
  expect(await allowed(page)).toBe(false);
  await page.waitForTimeout(120);
  expect(captured.events).toHaveLength(before);
  expect(captured.receipts).toHaveLength(2);
});
