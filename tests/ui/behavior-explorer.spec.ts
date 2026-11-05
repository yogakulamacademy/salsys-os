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

test("Behavior tab reads tenant-scoped aggregates and filters unsafe visitor paths", async ({ page, request }) => {
  await page.goto("/marketing?view=behavior");
  await expect(page.getByRole("heading", { name: "Behavior explorer" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ordered funnel" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Popular navigation paths" })).toBeVisible();
  await expect(page.getByText("/courses/200-hour-ytt.php", { exact: true })).toBeVisible();
  await expect(page.getByText("/enroll.php", { exact: true })).toBeVisible();
  await expect(page.getByText("/private?email=student@example.test", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Tenant-scoped aggregates")).toBeVisible();

  const reads = await (await request.get(fixtureBase + "/__behavior_calls")).json();
  expect(reads.length).toBeGreaterThanOrEqual(1);
  for (const call of reads) {
    expect(call.organization_id).toBe(organizationId);
    expect(call.days).toBe(14);
    expect(call.steps).toEqual(["web.page_viewed", "web.form_started", "web.form_submitted"]);
  }

  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 2);
  }
  await page.setViewportSize({ width: 390, height: 900 });
  await page.screenshot({ animations: "disabled", path: "test-results/r2-behavior-mobile.png" });
});

test("Funnel controls update ordered steps and date range without website writes", async ({ page, request }) => {
  await page.goto("/marketing?view=behavior");
  await page.getByRole("combobox", { name: "Funnel step 3" }).selectOption("web.cta_clicked");
  await page.getByRole("combobox", { name: "Analytics date range" }).selectOption("30");
  await page.getByRole("button", { name: "Run funnel" }).click();
  await expect(page).toHaveURL(/view=behavior.*days=30/);
  await expect(page.getByRole("heading", { name: "Ordered funnel" })).toBeVisible();
  await expect(page.getByText("3. CTA clicked", { exact: true })).toBeVisible();

  const reads = await (await request.get(fixtureBase + "/__behavior_calls")).json();
  expect(reads.some((call: any) =>
    call.organization_id === organizationId &&
    call.days === 30 &&
    Array.isArray(call.steps) &&
    call.steps.join(",") === "web.page_viewed,web.form_started,web.cta_clicked",
  )).toBe(true);
});

test("Invalid URL parameters fall back to a safe approved funnel and window", async ({ page, request }) => {
  await page.goto("/marketing?view=behavior&days=999&steps=web.page_viewed,web.page_viewed");
  await expect(page.getByRole("heading", { name: "Ordered funnel" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Analytics date range" })).toHaveValue("14");
  await expect(page.getByRole("combobox", { name: "Funnel step 1" })).toHaveValue("web.page_viewed");
  await expect(page.getByRole("combobox", { name: "Funnel step 2" })).toHaveValue("web.form_started");
  const reads = await (await request.get(fixtureBase + "/__behavior_calls")).json();
  expect(reads.every((call: any) => call.days === 14 &&
    JSON.stringify(call.steps) === JSON.stringify(["web.page_viewed", "web.form_started", "web.form_submitted"]))).toBe(true);
});

test("A denied read does not reveal tenant paths or stale funnel results", async ({ page, request }) => {
  const setup = await request.get(fixtureBase + "/__behavior_scenario?state=denied");
  expect(setup.ok()).toBe(true);
  await page.goto("/marketing?view=behavior");
  await expect(page.getByRole("heading", { name: "Behavior analytics unavailable" })).toBeVisible();
  await expect(page.getByText("/courses/200-hour-ytt.php", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Run funnel" })).toBeVisible();
});

test("Legitimate zero data shows zero stages and a privacy-safe path empty state", async ({ page, request }) => {
  const setup = await request.get(fixtureBase + "/__behavior_scenario?state=empty");
  expect(setup.ok()).toBe(true);
  await page.goto("/marketing?view=behavior");
  await expect(page.getByRole("heading", { name: "Ordered funnel" })).toBeVisible();
  await expect(page.getByText("No path has enough evidence yet. Try a longer date range.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Behavior analytics unavailable" })).toHaveCount(0);
});


test("Backend errors fail closed without leaking tenant or upstream error details", async ({ page, request }) => {
  const setup = await request.get(fixtureBase + "/__behavior_scenario?state=error");
  expect(setup.ok()).toBe(true);
  await page.goto("/marketing?view=behavior");
  await expect(page.getByRole("heading", { name: "Behavior analytics unavailable" })).toBeVisible();
  await expect(page.getByText("/courses/200-hour-ytt.php", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Read-only fixture error", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Run funnel" })).toBeVisible();
});

test("Funnel builder enforces five distinct stages and never changes the original Funnel view", async ({ page }) => {
  await page.goto("/marketing?view=behavior");
  await page.getByRole("button", { name: "Add step" }).click();
  await expect(page.getByRole("combobox", { name: "Funnel step 4" })).toBeVisible();
  await page.getByRole("button", { name: "Add step" }).click();
  await expect(page.getByRole("combobox", { name: "Funnel step 5" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add step" })).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "Funnel step 4" }).getByRole("option", { name: "Page viewed" })).toBeDisabled();
  await page.getByRole("button", { name: "Remove step 5" }).click();
  await expect(page.getByRole("combobox", { name: "Funnel step 5" })).toHaveCount(0);

  await page.getByRole("link", { name: "Funnel", exact: true }).click();
  await expect(page).toHaveURL(/view=funnel/);
  await expect(page.getByRole("heading", { name: "Funnel", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Behavior explorer" })).toHaveCount(0);
});
