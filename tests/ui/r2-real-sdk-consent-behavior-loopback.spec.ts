import { expect, test, type Page } from "@playwright/test";
import path from "node:path";

// Zero-new-infrastructure R2 acceptance rehearsal: actual published tracking
// loader, SDK core, consent UI and optional collector in a local Chromium page.
// All network traffic is intercepted: no customer site, external origins,
// Supabase, production API, CRM contact or real consent receipt is accessed.
const HARNESS = "/__r2_full_real_sdk_behavior_consent_local";
const EVENTS = "/__r2_full_sdk_events_local";
const RECEIPTS = "/__r2_full_sdk_receipts_local";
const JS_FILES = new Set([
  "/salsys-intelligence.js",
  "/salsys-intelligence-core-v1.6.0.js",
  "/salsys-intelligence-submit-fallback.js",
  "/salsys-tracker.js",
  "/salsys-consent.js",
  "/salsys-behavior-v1.js",
]);
const OPTIONAL = new Set([
  "web.cta_viewed", "web.pricing_viewed", "web.brochure_clicked",
  "web.faq_expanded", "web.scroll_depth_reached",
  "web.form_validation_failed", "web.form_acknowledged",
]);
type EventRow = {
  name: string; properties: Record<string, unknown>; consentMode: string;
  eventId: string; visitor: string; session: string;
};
type ReceiptRow = { decisions: Record<string, string>; gpc: boolean };
type Capture = { events: EventRow[]; receipts: ReceiptRow[]; remoteRequests: number };

function html() {
  return [
    '<!doctype html><html lang="en"><head><meta charset="utf-8">',
    '<title>R2 actual SDK + consent + behavior loopback</title>',
    '<style>body{margin:0;font-family:sans-serif}main{padding:12px}',
    '#cta{display:block;width:230px;height:85px}',
    '#pricing{display:block;width:230px;height:105px}',
    '#space{height:3600px}</style>',
    '<script src="/salsys-intelligence.js"',
    ' data-endpoint="' + EVENTS + '"',
    ' data-consent-endpoint="' + RECEIPTS + '"',
    ' data-consent-mode="required"',
    ' data-form-mode="lead-only" data-salsys-lead-capture="off"',
    ' data-salsys-behavior-tracking="true" defer></script>',
    '<script src="/salsys-consent.js"',
    ' data-consent-banner="auto" data-consent-settings="floating"',
    ' defer></script></head><body><main>',
    '<a id="cta" data-salsys-cta-id="apply_ytt" href="#safe">Enroll</a>',
    '<section id="pricing" data-salsys-pricing-id="course_fees">Course pricing</section>',
    '<button id="brochure" data-salsys-brochure-id="course_guide">Brochure</button>',
    '<details id="faq" data-salsys-faq-id="certification"><summary>FAQ</summary>Details</details>',
    '<input type="email" value="synthetic@example.test" aria-label="Test input">',
    '<div id="space" aria-hidden="true"></div>',
    '</main></body></html>',
  ].join("");
}

async function open(page: Page) {
  const capture: Capture = { events: [], receipts: [], remoteRequests: 0 };
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost") {
      capture.remoteRequests++;
      await route.abort();
      return;
    }
    if (request.method() === "GET" && url.pathname === HARNESS) {
      await route.fulfill({ status: 200, contentType: "text/html; charset=utf-8",
        headers: { "Cache-Control": "no-store" }, body: html() });
      return;
    }
    if (request.method() === "GET" && JS_FILES.has(url.pathname)) {
      await route.fulfill({ status: 200, contentType: "application/javascript",
        path: path.resolve(process.cwd(), "public", url.pathname.slice(1)) });
      return;
    }
    if (request.method() === "POST" && url.pathname === EVENTS) {
      const body = request.postDataJSON() as {
        event_id?: string; event_name?: string;
        anonymous_visitor_id?: string; session_key?: string;
        properties?: Record<string, unknown>;
        metadata?: { consent_mode?: string };
      };
      capture.events.push({
        name: String(body.event_name || ""),
        properties: body.properties || {},
        consentMode: String(body.metadata?.consent_mode || ""),
        eventId: String(body.event_id || ""),
        visitor: String(body.anonymous_visitor_id || ""),
        session: String(body.session_key || ""),
      });
      await route.fulfill({ status: 200, contentType: "application/json",
        body: JSON.stringify({ ok: true, accepted: true, synthetic: true }) });
      return;
    }
    if (request.method() === "POST" && url.pathname === RECEIPTS) {
      const body = request.postDataJSON() as {
        visitor_id?: string; decisions?: Record<string, string>; gpc?: boolean;
      };
      if (!body.visitor_id || !body.decisions || !Object.keys(body.decisions).length) {
        await route.fulfill({ status: 400, contentType: "application/json",
          body: JSON.stringify({ ok: false }) });
        return;
      }
      const effective = { ...body.decisions };
      if (body.gpc === true) effective.sale_sharing = "opted_out";
      capture.receipts.push({ decisions: effective, gpc: body.gpc === true });
      await route.fulfill({ status: 200, contentType: "application/json",
        body: JSON.stringify({
          ok: true, visitor_id: body.visitor_id,
          site_id: "synthetic-local", site_id_verified: true,
          gpc: body.gpc === true, notice_version: "synthetic-local",
          effective_decisions: effective,
          receipts: Object.entries(effective).map(([purpose, decision], i) => ({
            purpose, decision, receipt_id: "synthetic-receipt-" + capture.receipts.length + "-" + i,
          })),
          received_at: new Date().toISOString(),
        }) });
      return;
    }
    await route.abort(); // Only explicit local URLs are allowed.
  });
  await page.goto(HARNESS);
  await page.waitForFunction(() =>
    Boolean((window as any).SalsysIntelligence?.__universalTrackingIntelligenceV1 &&
      (window as any).SalsysConsent?.__universalConsentUiV1 &&
      (window as any).__salsysBehaviorV1Installed === true),
  );
  return capture;
}

function optionals(capture: Capture) {
  return capture.events.filter((row) => OPTIONAL.has(row.name));
}

test("real SDK: no choice and Reject all forbid optional events even after reload", async ({ page }) => {
  const capture = await open(page);
  await expect(page.getByRole("dialog", { name: "Privacy choices" })).toBeVisible();
  await page.getByRole("button", { name: "Brochure", exact: true }).click();
  await page.locator("#faq summary").click();
  await page.waitForTimeout(140);
  expect(capture.events).toHaveLength(0);

  await page.getByRole("dialog", { name: "Privacy choices" })
    .getByRole("button", { name: "Reject all" }).click();
  await expect.poll(() => capture.receipts.length).toBe(1);
  await expect(page.getByRole("button", { name: "Open privacy settings" })).toBeVisible();
  expect(capture.receipts[0].decisions.analytics).toBe("denied");
  expect(capture.events).toHaveLength(0);
  await page.reload();
  await page.waitForTimeout(200);
  expect(capture.events).toHaveLength(0);
  expect(capture.remoteRequests).toBe(0);
});

test("real SDK: grant records safe behavior; withdrawal blocks new optional actions", async ({ page }) => {
  const capture = await open(page);
  await page.getByRole("dialog", { name: "Privacy choices" })
    .getByRole("button", { name: "Accept all" }).click();
  await expect.poll(() => capture.receipts.length).toBe(1);
  await expect.poll(() => optionals(capture).filter(
    (row) => row.name === "web.cta_viewed").length).toBe(1);
  await expect.poll(() => optionals(capture).filter(
    (row) => row.name === "web.pricing_viewed").length).toBe(1);
  await page.getByRole("button", { name: "Brochure", exact: true }).click();
  await page.locator("#faq summary").click();
  await expect.poll(() => optionals(capture).filter(
    (row) => row.name === "web.brochure_clicked" || row.name === "web.faq_expanded").length).toBe(2);
  await page.evaluate(() => {
    document.dispatchEvent(new CustomEvent("salsys:form-acknowledged", {
      detail: { form_id: "apply_ytt", secret: "DO_NOT_SEND_SYNTHETIC_SECRET" },
    }));
  });
  await expect.poll(() => optionals(capture).filter(
    (row) => row.name === "web.form_acknowledged").length).toBe(1);

  expect(optionals(capture).every((row) =>
    row.eventId.length > 0 && row.visitor.length > 0 && row.session.length > 0 &&
    row.consentMode === "required")).toBe(true);
  expect(JSON.stringify(optionals(capture))).not.toMatch(
    /synthetic@example\.test|DO_NOT_SEND_SYNTHETIC_SECRET/,
  );
  const idSet = new Set(optionals(capture).map((row) => row.eventId));
  expect(idSet.size).toBe(optionals(capture).length);

  await page.getByRole("button", { name: "Open privacy settings" }).click();
  await page.getByRole("switch", { name: "Analytics" }).uncheck();
  await page.getByRole("dialog", { name: "Privacy settings" })
    .getByRole("button", { name: "Save choices" }).click();
  await expect.poll(() => capture.receipts.length).toBe(2);
  await expect.poll(() => page.evaluate(() =>
    (window as any).SalsysIntelligence.privacy().analytics_allowed_locally)).toBe(false);
  const before = optionals(capture).length;
  await page.getByRole("button", { name: "Brochure", exact: true }).click();
  await page.evaluate(() => {
    document.dispatchEvent(new CustomEvent("salsys:form-acknowledged", {
      detail: { form_id: "post_withdrawal" },
    }));
  });
  await page.waitForTimeout(200);
  expect(optionals(capture)).toHaveLength(before);
  expect(capture.remoteRequests).toBe(0);
});

test("real SDK: GPC travels through actual consent action and opts out of sharing", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "globalPrivacyControl", {
      configurable: true, value: true,
    });
  });
  const capture = await open(page);
  // The real tracker first records a GPC-only opt-out, before any analytics
  // choice. That automatic protective receipt must not count as a grant.
  await expect.poll(() => capture.receipts.some((row) =>
    row.gpc && row.decisions.sale_sharing === "opted_out" &&
    !Object.prototype.hasOwnProperty.call(row.decisions, "analytics"))).toBe(true);
  expect(capture.events).toHaveLength(0);
  await page.getByRole("dialog", { name: "Privacy choices" })
    .getByRole("button", { name: "Accept all" }).click();
  await expect.poll(() => capture.receipts.some((row) =>
    row.decisions.analytics === "granted" &&
    row.decisions.sale_sharing === "opted_out")).toBe(true);
  expect(capture.receipts.every((row) =>
    row.gpc && row.decisions.sale_sharing === "opted_out")).toBe(true);
  expect(capture.remoteRequests).toBe(0);
});
