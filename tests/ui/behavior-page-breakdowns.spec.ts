import { expect, test } from "@playwright/test";

const fixtureBase = "http://127.0.0.1:" + (process.env.UI_FIXTURE_PORT || "3108");
const organizationId = "00000000-0000-4000-8000-000000000002";

test.beforeEach(async ({ context, request }) => {
  const user = {
    id: "00000000-0000-4000-8000-000000000001",
    aud: "authenticated",
    role: "authenticated",
    email: "reviewer@example.test",
    app_metadata: { provider: "email" },
    user_metadata: {},
  };
  const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const token = [b64({ alg: "HS256", typ: "JWT" }),
    b64({ sub: user.id, role: "authenticated", aud: "authenticated", exp: expires }),
    "synthetic-local-fixture"].join(".");
  const session = {
    access_token: token,
    refresh_token: "synthetic-local-refresh",
    expires_at: expires,
    expires_in: 3600,
    token_type: "bearer",
    user,
  };
  await context.addCookies([{
    name: "sb-127-auth-token",
    value: "base64-" + b64(session),
    domain: "127.0.0.1", path: "/", sameSite: "Lax",
  }]);
  const setup = await request.get(fixtureBase + "/__behavior_scenario?state=ready");
  expect(setup.ok()).toBe(true);
});

test("Page breakdown shows only safe public routes with a real visitor threshold", async ({ page, request }) => {
  await page.goto("/marketing?view=behavior");
  const breakdown = page.getByRole("region", { name: "Event page breakdown" });
  await expect(breakdown.getByRole("heading", { name: "Events by page" })).toBeVisible();
  await expect(breakdown.getByText("/courses/200-hour-ytt.php")).toBeVisible();
  await expect(breakdown.getByText("/enroll.php")).toBeVisible();
  await expect(breakdown.getByText("Other or withheld events", { exact: true })).toBeVisible();
  await expect(breakdown.getByText("17", { exact: true })).toBeVisible();
  await expect(breakdown.getByText("at least 3 distinct tracked visitor IDs", { exact: false })).toBeVisible();

  const calls = await (await request.get(fixtureBase + "/__behavior_breakdown_calls")).json();
  expect(calls.length).toBeGreaterThan(0);
  expect(calls.every((item: any) => item.organization_id === organizationId
    && item.days === 14 && item.event === "web.page_viewed")).toBe(true);

  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth))
      .toBeLessThanOrEqual(width + 2);
  }
});

test("Page selector changes only its report and preserves applied funnel steps", async ({ page, request }) => {
  await page.goto("/marketing?view=behavior&days=7&steps=web.page_viewed,web.form_started,web.form_submitted");
  await page.getByRole("combobox", { name: "Page breakdown event" }).selectOption("web.form_started");
  await page.getByRole("button", { name: "View pages" }).click();
  await expect(page).toHaveURL(/breakdown=web.form_started/);
  await expect(page.getByRole("combobox", { name: "Page breakdown event" })).toHaveValue("web.form_started");
  await expect(page.getByRole("heading", { name: "Ordered funnel" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Event activity" })).toBeVisible();
  const calls = await (await request.get(fixtureBase + "/__behavior_breakdown_calls")).json();
  expect(calls.some((item: any) => item.organization_id === organizationId
    && item.days === 7 && item.event === "web.form_started")).toBe(true);
});

test("Invalid breakdown parameter falls back to registered page-view event", async ({ page, request }) => {
  await page.goto("/marketing?view=behavior&breakdown=web.customer_email");
  await expect(page.getByRole("combobox", { name: "Page breakdown event" })).toHaveValue("web.page_viewed");
  const calls = await (await request.get(fixtureBase + "/__behavior_breakdown_calls")).json();
  expect(calls.every((item: any) => item.event === "web.page_viewed")).toBe(true);
});

test("No event data and small-cohort evidence have separate honest empty states", async ({ page, request }) => {
  await request.get(fixtureBase + "/__behavior_scenario?state=empty");
  await page.goto("/marketing?view=behavior");
  await expect(page.getByText("No events were observed in this period.")).toBeVisible();

  await request.get(fixtureBase + "/__behavior_scenario?state=small");
  await page.reload();
  await expect(page.getByText("No public page reached the minimum visitor threshold in this period.")).toBeVisible();
  await expect(page.getByRole("region", { name: "Event page breakdown" }).getByText("/courses/200-hour-ytt.php", { exact: true })).toHaveCount(0);
});

test("Denied or failed breakdown remains isolated from live funnel and hides raw errors", async ({ page, request }) => {
  await request.get(fixtureBase + "/__behavior_scenario?state=error");
  await page.goto("/marketing?view=behavior");
  const breakdown = page.getByRole("region", { name: "Event page breakdown" });
  await expect(breakdown.getByRole("status")).toBeVisible();
  await expect(breakdown.getByText("Synthetic sensitive error")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Behavior explorer" })).toBeVisible();

  await request.get(fixtureBase + "/__behavior_scenario?state=denied");
  await page.reload();
  await expect(breakdown.getByRole("status")).toBeVisible();
  await expect(breakdown.getByText("/enroll.php", { exact: true })).toHaveCount(0);
});


test.describe("Hydration-independent page breakdown navigation", () => {
  // Next's async Server Component streaming needs inline browser scripts to reveal
  // the report. Block only downloadable client bundles: this exercises the native
  // HTML form before React hydration without hiding the streamed report itself.
  test("native GET form applies selected event without client hydration bundles", async ({ page, request }) => {
    let blockedClientScripts = 0;
    await page.route("**/_next/static/**", async (route) => {
      if (route.request().resourceType() === "script") {
        blockedClientScripts += 1;
        await route.abort();
      } else {
        await route.continue();
      }
    });

    const steps = "web.page_viewed,web.form_started,web.form_submitted";
    await page.goto("/marketing?view=behavior&days=7&steps=" + steps);
    expect(blockedClientScripts).toBeGreaterThan(0);

    const breakdown = page.getByRole("region", { name: "Event page breakdown" });
    const form = breakdown.locator("form");
    await expect(form).toHaveAttribute("method", "get");
    await expect(form).toHaveAttribute("action", "/marketing");

    const select = breakdown.getByRole("combobox", { name: "Page breakdown event" });
    await select.selectOption("web.form_started");
    await expect(select).toHaveValue("web.form_started");
    await form.getByRole("button", { name: "View pages" }).click();

    await expect(page).toHaveURL(/breakdown=web.form_started/);
    const params = new URL(page.url()).searchParams;
    expect(params.get("view")).toBe("behavior");
    expect(params.get("days")).toBe("7");
    expect(params.get("steps")).toBe(steps);
    expect(params.get("breakdown")).toBe("web.form_started");

    await expect(breakdown.getByRole("combobox", { name: "Page breakdown event" }))
      .toHaveValue("web.form_started");
    const calls = await (await request.get(fixtureBase + "/__behavior_breakdown_calls")).json();
    expect(calls.some((item: any) => item.organization_id === organizationId
      && item.days === 7 && item.event === "web.form_started")).toBe(true);
  });
});

test("Page-view explanations distinguish SPA URL-only events from full page loads", async ({ page }) => {
  await page.goto("/marketing?view=behavior");
  const breakdown = page.getByRole("region", { name: "Event page breakdown" });

  await expect(page.getByText(
    /Page-view event counts can include same-page SPA URL changes/,
  )).toBeVisible();
  await expect(breakdown.getByText(
    /Page-view events can include same-page SPA URL changes/,
  )).toBeVisible();
  // Observed report values and public paths are unchanged by explanatory copy.
  await expect(breakdown.getByText("/courses/200-hour-ytt.php")).toBeVisible();
  await expect(breakdown.getByRole("table")).toBeVisible();

  await breakdown.getByRole("combobox", { name: "Page breakdown event" })
    .selectOption("web.form_started");
  await breakdown.getByRole("button", { name: "View pages" }).click();
  await expect(page).toHaveURL(/breakdown=web.form_started/);
  await expect(breakdown.getByText(
    /Page-view events can include same-page SPA URL changes/,
  )).toHaveCount(0);
});

test("Behavior pages explain that tracked visitor IDs are not people or devices", async ({ page }) => {
  await page.goto("/marketing?view=behavior");
  const paths = page.getByRole("region", { name: "Popular navigation paths" });
  const breakdown = page.getByRole("region", { name: "Event page breakdown" });
  await expect(paths.getByText(/Tracked visitor IDs generally represent browser identities, not verified people or physical devices\./)).toBeVisible();
  await expect(breakdown.getByText(/A tracked visitor ID may change with browsers or resets; it is not a verified person or device\./)).toBeVisible();
  // Existing tenant source counts and paths still render; this is label-only.
  await expect(breakdown.getByRole("table")).toBeVisible();
});
