import { expect, test, type Page } from "@playwright/test";
import path from "node:path";

// R2-P2 investigation harness. The real browser SDK runs on a synthetic local
// document. ALL requests are intercepted; no production site, API, database,
// consent-receipt service, or customer tracking source can be reached.
const PAGE_PATH = "/__r2_p2_spa_pageview_repro_local";
const SINK_PATH = "/__r2_p2_spa_pageview_sink_local";

type CapturedEvent = {
  eventName: string;
  pagePath: string | undefined;
  navigationType: string | undefined;
};

function fixtureHtml(options: { consent: boolean; autoSpa: boolean }) {
  return `<!doctype html><html lang="en"><head>
    <meta charset="utf-8"><title>Synthetic Salsys navigation fixture</title>
    <script>
      if (${options.consent ? "true" : "false"}) {
        localStorage.setItem("salsys_privacy_v1", JSON.stringify({
          analytics: "granted"
        }));
      }
    </script>
    <script src="/salsys-tracker.js"
      data-endpoint="${SINK_PATH}"
      data-auto-spa="${options.autoSpa ? "true" : "false"}"
      data-auto-forms="false"
      data-consent-mode="required"></script>
  </head><body><main>Synthetic page — no customer data</main></body></html>`;
}

async function startFixture(
  page: Page,
  options: { consent?: boolean; autoSpa?: boolean } = {},
) {
  const received: CapturedEvent[] = [];
  const consent = options.consent === true;
  const autoSpa = options.autoSpa !== false;
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    // Fail closed for any unanticipated resource or non-loopback request.
    if (url.hostname !== "127.0.0.1") {
      await route.abort();
      return;
    }
    if (url.pathname === PAGE_PATH) {
      await route.fulfill({
        status: 200,
        contentType: "text/html; charset=utf-8",
        headers: { "Cache-Control": "no-store" },
        body: fixtureHtml({ consent, autoSpa }),
      });
      return;
    }
    if (url.pathname === "/salsys-tracker.js") {
      await route.fulfill({
        status: 200,
        contentType: "application/javascript",
        path: path.resolve(process.cwd(), "public/salsys-tracker.js"),
      });
      return;
    }
    if (url.pathname === SINK_PATH && route.request().method() === "POST") {
      const event = route.request().postDataJSON() as {
        event_name?: string;
        properties?: { pagePath?: string; navigation_type?: string };
      };
      received.push({
        eventName: event.event_name || "",
        pagePath: event.properties?.pagePath,
        navigationType: event.properties?.navigation_type,
      });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, accepted: true, synthetic: true }),
      });
      return;
    }
    await route.abort();
  });
  await page.goto(PAGE_PATH);
  await page.waitForFunction(() =>
    Boolean((window as any).Salsys?.__eventIntelligenceV1),
  );
  return received;
}

const pageViews = (events: CapturedEvent[]) =>
  events.filter((event) => event.eventName === "web.page_viewed");

test("R2-P2 diagnostic: URL-only SPA history changes emit same-path page views under existing SDK", async ({ page }) => {
  const recorded = await startFixture(page, { consent: true });
  await expect.poll(() => pageViews(recorded).length).toBe(1);
  expect(pageViews(recorded)[0].pagePath).toBe(PAGE_PATH);

  await page.evaluate(() => history.pushState({}, "", "?tab=course"));
  await expect.poll(() => pageViews(recorded).length).toBe(2);
  expect(pageViews(recorded)[1]).toMatchObject({
    pagePath: PAGE_PATH,
    navigationType: "spa",
  });

  await page.evaluate(() => history.replaceState({}, "", "?tab=fees"));
  await expect.poll(() => pageViews(recorded).length).toBe(3);
  expect(pageViews(recorded)[2]).toMatchObject({
    pagePath: PAGE_PATH,
    navigationType: "spa",
  });

  await page.evaluate(() => history.pushState({}, "", "#details"));
  await expect.poll(() => pageViews(recorded).length).toBe(4);
  expect(pageViews(recorded)[3]).toMatchObject({
    pagePath: PAGE_PATH,
    navigationType: "spa",
  });

  // The same URL is not a new navigation under the existing SDK.
  await page.evaluate(() => history.replaceState({}, "", location.href));
  await page.waitForTimeout(120);
  expect(pageViews(recorded)).toHaveLength(4);

  await page.evaluate(() => history.pushState({}, "", "/__r2_p2_spa_other_page"));
  await expect.poll(() => pageViews(recorded).length).toBe(5);
  expect(pageViews(recorded)[4]).toMatchObject({
    pagePath: "/__r2_p2_spa_other_page",
    navigationType: "spa",
  });
});

test("R2-P2 diagnostic: disabling auto-SPA prevents history-triggered page views", async ({ page }) => {
  const recorded = await startFixture(page, { consent: true, autoSpa: false });
  await expect.poll(() => pageViews(recorded).length).toBe(1);
  await page.evaluate(() => {
    history.pushState({}, "", "?tab=course");
    history.replaceState({}, "", "?tab=fees");
    history.pushState({}, "", "#details");
  });
  await page.waitForTimeout(120);
  expect(pageViews(recorded)).toHaveLength(1);
});

test("R2-P2 privacy: no consent means no initial or history-triggered page-view event", async ({ page }) => {
  const recorded = await startFixture(page, { consent: false });
  await page.evaluate(() => {
    history.pushState({}, "", "?tab=course");
    history.replaceState({}, "", "#details");
  });
  await page.waitForTimeout(120);
  expect(pageViews(recorded)).toHaveLength(0);
  expect(recorded).toHaveLength(0);
});
