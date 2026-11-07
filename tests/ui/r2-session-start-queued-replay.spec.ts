import { test, expect, type Page } from "@playwright/test";
import path from "node:path";

// Actual production first-party SDK, isolated localhost fixture and intercepted
// HTTP. No real visitor, CRM API, website, consent system or Supabase request.
const FIXTURE = "/__r2_session_start_replay_local";
const SINK = "/__r2_session_start_events_local";
const CONSENT = "/__r2_session_start_consent_local";

type Captured = {
  event_id: string;
  event_name: string;
  session_key: string;
  anonymous_visitor_id: string;
};
function html() {
  return '<!doctype html><html><head><title>Synthetic session-start replay</title>' +
    '<script src="/salsys-tracker.js" data-consent-mode="required"' +
    ' data-endpoint="' + SINK + '"' +
    ' data-consent-endpoint="' + CONSENT + '"' +
    ' data-auto-page="false" data-auto-spa="false" data-auto-forms="false"' +
    ' defer></script></head><body>Disposable browser fixture</body></html>';
}
async function setup(page: Page, { failFirst = false, granted = true, blockQueue = false } = {}) {
  const captured: Captured[] = [];
  if (granted) {
    await page.addInitScript(({ blockQueue }) => {
      localStorage.setItem("salsys_privacy_v1", JSON.stringify({ analytics: "granted" }));
      if (blockQueue) {
        const originalSet = Storage.prototype.setItem;
        Storage.prototype.setItem = function (key: string, value: string) {
          if (this === localStorage && key === "salsys_event_queue_v1") {
            throw new Error("synthetic-local-storage-write-denial");
          }
          return originalSet.call(this, key, value);
        };
      }
    }, { blockQueue });
  }
  await page.route("**/*", async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    if (u.hostname !== "127.0.0.1" && u.hostname !== "localhost") {
      await route.abort();
      return;
    }
    if (req.method() === "GET" && u.pathname === FIXTURE) {
      await route.fulfill({ status: 200, contentType: "text/html", body: html() });
      return;
    }
    if (req.method() === "GET" && u.pathname === "/salsys-tracker.js") {
      await route.fulfill({
        status: 200,
        contentType: "application/javascript",
        path: path.resolve(process.cwd(), "public/salsys-tracker.js"),
      });
      return;
    }
    if (req.method() === "POST" && u.pathname === CONSENT) {
      const body = req.postDataJSON() as {
        visitor_id: string; decisions: Record<string, string>; gpc?: boolean;
      };
      const effective_decisions = { ...body.decisions };
      if (body.gpc === true) effective_decisions.sale_sharing = "opted_out";
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true, visitor_id: body.visitor_id,
          effective_decisions,
          receipts: Object.entries(effective_decisions).map(([purpose, decision], i) =>
            ({ purpose, decision, receipt_id: "synthetic-receipt-" + i })),
          received_at: new Date().toISOString(),
        }),
      });
      return;
    }
    if (req.method() === "POST" && u.pathname === SINK) {
      const data = req.postDataJSON() as Captured;
      captured.push({
        event_id: String(data.event_id || ""),
        event_name: String(data.event_name || ""),
        session_key: String(data.session_key || ""),
        anonymous_visitor_id: String(data.anonymous_visitor_id || ""),
      });
      await route.fulfill({
        status: failFirst && captured.length === 1 ? 503 : 200,
        contentType: "application/json",
        body: JSON.stringify(failFirst && captured.length === 1
          ? { ok: false, error: "synthetic transient response" }
          : { ok: true, accepted: true, synthetic: true }),
      });
      return;
    }
    await route.abort(); // All unknown paths blocked; no external requests.
  });
  await page.goto(FIXTURE);
  await page.waitForFunction(() => Boolean((window as any).Salsys?.__eventIntelligenceV1));
  return captured;
}
async function queuedSessionStarts(page: Page) {
  return page.evaluate(() => {
    const q = JSON.parse(localStorage.getItem("salsys_event_queue_v1") || "[]") as Array<{event_name: string; event_id: string}>;
    return q.filter(e => e.event_name === "web.session_started");
  });
}

test("R2 failed session start replays the original event ID after reload rather than generating a second ID", async ({ page }) => {
  const events = await setup(page, { failFirst: true });
  await expect.poll(() => events.length).toBe(1);
  await expect.poll(async () => (await queuedSessionStarts(page)).length).toBe(1);
  const original = events[0];
  expect(original.event_name).toBe("web.session_started");
  expect(original.event_id).toMatch(/^evt_/);
  const queued = await queuedSessionStarts(page);
  expect(queued[0].event_id).toBe(original.event_id);

  await page.reload();
  await expect.poll(() => events.length).toBe(2);
  await expect.poll(async () => (await queuedSessionStarts(page)).length).toBe(0);
  await page.waitForTimeout(150);
  expect(events).toHaveLength(2);
  expect(events[1]).toEqual(original); // Same id, session and browser visitor.
  expect(await page.evaluate(() => sessionStorage.getItem("salsys_session_started_v1")))
    .toBe(original.session_key);
});

test("R2 denied by default must not send session-start or create queued optional analytics", async ({ page }) => {
  const events = await setup(page, { granted: false });
  await page.waitForTimeout(150);
  await page.reload();
  await page.waitForTimeout(150);
  expect(events).toEqual([]);
  expect(await queuedSessionStarts(page)).toHaveLength(0);
  expect(await page.evaluate(() => (window as any).Salsys.privacy().analytics_allowed_locally)).toBe(false);
});

test("R2 failed event with unavailable queue storage cannot leave a false successful replay marker", async ({ page }) => {
  const events = await setup(page, { failFirst: true, blockQueue: true });
  await expect.poll(() => events.length).toBe(1);
  await expect.poll(async () => page.evaluate(() => sessionStorage.getItem("salsys_session_started_v1"))).toBe(null);
  await page.reload();
  await expect.poll(() => events.length).toBe(2);
  expect(events[0].session_key).toBe(events[1].session_key);
  expect(events[0].event_id).not.toBe(events[1].event_id); // No retained envelope exists to replay.
  expect(await queuedSessionStarts(page)).toHaveLength(0);
});

test("R2 a queued failed session start is erased on analytics withdrawal and is never replayed after regrant", async ({ page }) => {
  const events = await setup(page, { failFirst: true });
  await expect.poll(() => events.length).toBe(1);
  await expect.poll(async () => (await queuedSessionStarts(page)).length).toBe(1);
  const original = events[0];

  const deniedReceipt = await page.evaluate(() =>
    (window as any).Salsys.consent({ analytics: "withdrawn" }));
  expect(deniedReceipt.ok).toBe(true);
  expect(await page.evaluate(() => (window as any).Salsys.privacy().analytics_allowed_locally)).toBe(false);
  expect(await queuedSessionStarts(page)).toHaveLength(0);
  expect(await page.evaluate(() => sessionStorage.getItem("salsys_session_started_v1"))).toBe(null);

  // A reload while denied must not restore the old event/visitor identity.
  await page.reload();
  await page.waitForTimeout(120);
  expect(events).toHaveLength(1);
  expect(await queuedSessionStarts(page)).toHaveLength(0);

  const grantReceipt = await page.evaluate(() =>
    (window as any).Salsys.consent({ analytics: "granted" }));
  expect(grantReceipt.ok).toBe(true);
  await expect.poll(() => events.length).toBe(2);
  await page.waitForTimeout(120);
  expect(events).toHaveLength(2);
  expect(events[1].event_name).toBe("web.session_started");
  expect(events[1].event_id).not.toBe(original.event_id);
  expect(events[1].anonymous_visitor_id).not.toBe(original.anonymous_visitor_id);
  expect(events[1].session_key).not.toBe(original.session_key);
  expect(await queuedSessionStarts(page)).toHaveLength(0);
});
