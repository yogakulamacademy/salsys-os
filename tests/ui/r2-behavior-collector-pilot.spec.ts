import { expect, test, type Page } from "@playwright/test";
import path from "node:path";

// R2-P1: browser-only pilot rehearsal. The page and tracking SDK are disposable
// loopback fixtures; nothing reaches customer sites, event APIs or Supabase.
// The *actual* optional collector JavaScript is served by the local Next app.
const HARNESS = "/__r2_behavior_pilot_local_harness";
type PilotEvent = { name: string; properties: Record<string, unknown> };

function harnessHtml(initialConsent: boolean) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
    <title>Synthetic optional behavior pilot</title>
    <style>body{margin:0;font-family:sans-serif}main{padding:16px}
      #cta{display:block;width:240px;height:80px}
      #pricing{display:block;width:240px;height:100px}
      #spacer{height:4200px}</style>
    <script>
      window.__pilotAllowed = ${initialConsent ? "true" : "false"};
      window.__pilotEvents = [];
      window.SalsysIntelligence = {
        __universalTrackingIntelligenceV1: true,
        privacy: function () {
          return { analytics_allowed_locally: window.__pilotAllowed === true };
        },
        track: function (name, properties) {
          window.__pilotEvents.push({ name: name, properties: properties });
          return Promise.resolve({ ok: true, synthetic: true });
        }
      };
    </script></head><body><main>
    <a id="cta" href="#safe" data-salsys-cta-id="enroll_now">Enroll</a>
    <section id="pricing" data-salsys-pricing-id="course_pricing">Pricing</section>
    <button id="brochure" data-salsys-brochure-id="course_guide">Brochure</button>
    <button id="invalid-brochure" data-salsys-brochure-id="person@example.test">Unsafe marker</button>
    <details id="faq" data-salsys-faq-id="certification"><summary>FAQ</summary>Answer</details>
    <form><input type="email" name="email" value="synthetic@example.test"></form>
    <div id="spacer" aria-hidden="true"></div>
    </main><script src="/salsys-behavior-v1.js"></script></body></html>`;
}

async function openHarness(page: Page, initialConsent = false) {
  await page.setViewportSize({ width: 900, height: 700 });
  // Serve the real collector bytes directly from the checked-out repository,
  // rather than assuming the app's public-asset route is available on a
  // synthetic document outside the application router.
  await page.route("**/salsys-behavior-v1.js", (route) =>
    route.fulfill({
      path: path.resolve(process.cwd(), "public/salsys-behavior-v1.js"),
      contentType: "application/javascript",
      status: 200,
    }),
  );
  await page.route("**" + HARNESS, (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html; charset=utf-8",
      headers: { "Cache-Control": "no-store" },
      body: harnessHtml(initialConsent),
    }),
  );
  await page.goto(HARNESS);
  try {
    await page.waitForFunction(
      () => (window as any).__salsysBehaviorV1Installed === true,
      null, { timeout: 8_000 },
    );
  } catch {
    const diagnostics = await page.evaluate(() => ({
      sdkPresent: Boolean((window as any).SalsysIntelligence),
      sdkVersionOk: (window as any).SalsysIntelligence?.__universalTrackingIntelligenceV1,
      scriptLoaded: Boolean(document.querySelector('script[src="/salsys-behavior-v1.js"]')),
      collectorInstalled: Boolean((window as any).__salsysBehaviorV1Installed),
    }));
    throw new Error("Local collector did not initialize: " + JSON.stringify(diagnostics));
  }
  // Let the collector's bounded initial IntersectionObserver scan run.
  await page.waitForTimeout(130);
}

const events = (page: Page) =>
  page.evaluate(() => (window as any).__pilotEvents as PilotEvent[]);

async function choose(page: Page, allowed: boolean) {
  await page.evaluate((value) => {
    (window as any).__pilotAllowed = value;
    window.dispatchEvent(new Event("salsys:consent-changed"));
  }, allowed);
}

async function moveToDepth(page: Page, percent: number) {
  await page.evaluate((target) => {
    const root = document.documentElement;
    const height = Math.max(root.scrollHeight, document.body.scrollHeight);
    const scrollY = Math.min(height - window.innerHeight,
      Math.max(0, Math.ceil(height * target / 100 - window.innerHeight)));
    window.scrollTo(0, scrollY);
    window.dispatchEvent(new Event("scroll"));
  }, percent);
}

test("R2-P1 Chromium: visible CTA requires live analytics consent and half intersection", async ({ page }) => {
  await openHarness(page);
  expect((await events(page))).toHaveLength(0);
  await choose(page, true);
  await expect.poll(async () => (await events(page)).filter(
    (event) => event.name === "web.cta_viewed").length).toBe(1);
  const first = (await events(page)).find((event) => event.name === "web.cta_viewed");
  expect(first).toEqual({ name: "web.cta_viewed", properties: { cta_id: "enroll_now" } });

  // A user withdrawal must stop future optional telemetry immediately.
  await choose(page, false);
  const count = (await events(page)).length;
  await page.getByRole("button", { name: "Brochure", exact: true }).click();
  await moveToDepth(page, 70);
  await page.waitForTimeout(130);
  expect((await events(page))).toHaveLength(count);
  // No extra page view or brochure click is fabricated on revocation.
  expect((await events(page)).some((event) =>
    event.name === "web.brochure_clicked")).toBe(false);
});

test("R2-P1 Chromium: allowlisted FAQ, brochure and form outcomes never send field values", async ({ page }) => {
  await openHarness(page, true);
  await page.getByRole("button", { name: "Brochure", exact: true }).click();
  await page.getByRole("button", { name: "Unsafe marker" }).click();
  await page.locator("#faq summary").click();
  await page.evaluate(() => {
    document.dispatchEvent(new CustomEvent("salsys:form-validation-failed", {
      detail: {
        form_id: "apply", category: "format",
        raw_input: "synthetic@example.test",
        stack: "never-export-website-error",
      },
    }));
    document.dispatchEvent(new CustomEvent("salsys:form-acknowledged", {
      detail: { form_id: "apply", response_body: "SECRET_RESPONSE_BODY" },
    }));
  });
  await expect.poll(async () => (await events(page)).filter(
    (event) => [
      "web.brochure_clicked", "web.faq_expanded",
      "web.form_validation_failed", "web.form_acknowledged",
    ].includes(event.name)).length).toBe(4);

  const rows = (await events(page)).filter((event) =>
    ["web.brochure_clicked", "web.faq_expanded", "web.form_validation_failed",
      "web.form_acknowledged"].includes(event.name));
  // A native <details> toggle can be delivered after synchronous CustomEvents.
  // Check the complete event set, not incidental browser event ordering.
  expect(rows.sort((a, b) => a.name.localeCompare(b.name))).toEqual([
    { name: "web.brochure_clicked", properties: { brochure_id: "course_guide" } },
    { name: "web.faq_expanded", properties: { faq_id: "certification" } },
    { name: "web.form_acknowledged", properties: { form_id: "apply" } },
    { name: "web.form_validation_failed",
      properties: { form_id: "apply", error_category: "format" } },
  ]);
  expect(JSON.stringify(await events(page))).not.toMatch(
    /synthetic@example\.test|SECRET_RESPONSE_BODY|never-export-website-error/,
  );
});

test("R2-P1 Chromium: no pre-consent scroll backfill; 75/90 percent cross once", async ({ page }) => {
  await openHarness(page);
  await moveToDepth(page, 60);
  expect((await events(page))).toHaveLength(0);
  await choose(page, true);
  // Consent is granted at 60%; the old 25% and 50% crossings are censored.
  await moveToDepth(page, 84);
  await moveToDepth(page, 98);
  await expect.poll(async () => (await events(page))
    .filter((event) => event.name === "web.scroll_depth_reached")
    .map((event) => event.properties.threshold_percent)).toEqual([75, 90]);
  // Crossing 25/50 for the first time *after* consent is legitimate new
  // activity, not retroactive collection. Earlier 75/90 crossings are not
  // duplicated on the same page because the collector deduplicates by step.
  await moveToDepth(page, 15);
  await moveToDepth(page, 99);
  expect((await events(page)).filter((event) =>
    event.name === "web.scroll_depth_reached").map(
      (event) => event.properties.threshold_percent,
    )).toEqual([75, 90, 25, 50]);
});

test("R2-P1 Chromium: SPA change allows a fresh page-scoped CTA impression", async ({ page }) => {
  await openHarness(page, true);
  await expect.poll(async () => (await events(page)).filter(
    (event) => event.name === "web.cta_viewed").length).toBe(1);
  await page.evaluate(() => {
    history.pushState({}, "", "/__r2_behavior_pilot_other_route");
    window.dispatchEvent(new Event("salsys:page-change"));
  });
  await expect.poll(async () => (await events(page)).filter(
    (event) => event.name === "web.cta_viewed").length).toBe(2);
  // Multiple callbacks on the same new route must not duplicate impressions.
  await page.locator("#cta").scrollIntoViewIfNeeded();
  await page.waitForTimeout(130);
  expect((await events(page)).filter((event) =>
    event.name === "web.cta_viewed")).toHaveLength(2);
});

test("R2-P1 Chromium: SPA can reclaim a full 200-element visibility observer set after replacing a view", async ({ page }) => {
  await openHarness(page, true);
  // Spy on the browser's real IntersectionObserver to prove the initial
  // observation cap was reached before the SPA replaces its marker grid.
  await page.evaluate(() => {
    const proto = IntersectionObserver.prototype;
    const observe = proto.observe;
    const unobserve = proto.unobserve;
    const currentlyObserved = new Set<Element>();
    (window as any).__observedByPilot = currentlyObserved;
    proto.observe = function (element: Element) {
      currentlyObserved.add(element);
      return observe.call(this, element);
    };
    proto.unobserve = function (element: Element) {
      currentlyObserved.delete(element);
      return unobserve.call(this, element);
    };
  });

  await page.evaluate(() => {
    const holder = document.createElement("section");
    holder.id = "spa-old-controls";
    // Append after the long spacer so these controls are initially offscreen.
    for (let i = 0; i < 210; i++) {
      const item = document.createElement("button");
      item.setAttribute("data-salsys-cta-id", "old_marker_" + i);
      item.textContent = "Old marker";
      holder.appendChild(item);
    }
    document.body.appendChild(holder);
  });

  await expect.poll(async () => page.evaluate(
    () => (window as any).__observedByPilot?.size ?? -1,
  )).toBe(198); // Plus two controls observed before the test spy was installed.

  await page.evaluate(() => {
    document.getElementById("spa-old-controls")?.remove();
    const current = document.createElement("button");
    current.id = "spa-new-control";
    current.textContent = "Current view CTA";
    current.setAttribute("data-salsys-cta-id", "fresh_view_cta");
    document.querySelector("#pricing")?.before(current);
    window.dispatchEvent(new Event("salsys:page-change"));
  });
  await page.locator("#spa-new-control").scrollIntoViewIfNeeded();

  await expect.poll(async () => (await events(page))
    .filter((event) => event.name === "web.cta_viewed" &&
      event.properties.cta_id === "fresh_view_cta").length).toBe(1);
  await expect.poll(async () => page.evaluate(
    () => (window as any).__observedByPilot?.size ?? -1,
  )).toBeLessThanOrEqual(3);
});

test("R2-P1 Chromium: native details opened pre-consent cannot be backfilled by a later grant", async ({ page }) => {
  await openHarness(page, false);
  await page.evaluate(() => {
    const summary = document.querySelector<HTMLElement>("#faq summary");
    if (!summary) throw new Error("Synthetic details summary missing");
    summary.click();
    // Both the collector's deferred click handler and native toggle may be
    // delivered after the simulated consent state has changed.
    (window as any).__pilotAllowed = true;
    window.dispatchEvent(new Event("salsys:consent-changed"));
  });
  await page.waitForTimeout(100);
  expect((await events(page)).filter((row) => row.name === "web.faq_expanded")).toHaveLength(0);

  // A new authorized close and re-open does count as one new interaction.
  await page.locator("#faq summary").click();
  await page.locator("#faq summary").click();
  await expect.poll(async () => (await events(page))
    .filter((row) => row.name === "web.faq_expanded").length).toBe(1);
  expect((await events(page)).filter((row) => row.name === "web.faq_expanded")).toEqual([
    { name: "web.faq_expanded", properties: { faq_id: "certification" } },
  ]);
});

test("R2-P1 Chromium: queued FAQ callback is invalid after consent changes and same-path SPA replacement", async ({ page }) => {
  await openHarness(page, true);
  await page.evaluate(() => {
    const old = document.createElement("button");
    old.setAttribute("data-salsys-faq-id", "old_queued_faq");
    old.setAttribute("aria-expanded", "true");
    document.body.appendChild(old);
    old.click();
    (window as any).__pilotAllowed = false;
    window.dispatchEvent(new Event("salsys:consent-changed"));
    (window as any).__pilotAllowed = true;
    window.dispatchEvent(new Event("salsys:consent-changed"));
    old.remove();

    const replaced = document.createElement("button");
    replaced.setAttribute("data-salsys-faq-id", "stale_same_route");
    replaced.setAttribute("aria-expanded", "true");
    document.body.appendChild(replaced);
    replaced.click();
    window.dispatchEvent(new Event("salsys:page-change"));
    replaced.remove();
  });
  await page.waitForTimeout(100);
  expect((await events(page)).filter((row) => row.name === "web.faq_expanded")).toHaveLength(0);

  await page.evaluate(() => {
    const current = document.createElement("button");
    current.setAttribute("data-salsys-faq-id", "current_route_faq");
    current.setAttribute("aria-expanded", "true");
    document.body.appendChild(current);
    current.click();
  });
  await expect.poll(async () => (await events(page))
    .filter((row) => row.name === "web.faq_expanded").length).toBe(1);
  expect((await events(page)).find((row) => row.name === "web.faq_expanded")).toEqual({
    name: "web.faq_expanded", properties: { faq_id: "current_route_faq" },
  });
});
