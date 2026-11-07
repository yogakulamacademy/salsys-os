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

test("Keyboard navigation marks the active Marketing view and preserves existing Funnel and Analytics", async ({ page }) => {
  const nav = page.getByRole("navigation", { name: "Marketing workspace views" });
  const behavior = nav.getByRole("link", { name: "Behavior", exact: true });
  const funnel = nav.getByRole("link", { name: "Funnel", exact: true });
  const analytics = nav.getByRole("link", { name: "Analytics", exact: true });

  await page.goto("/marketing?view=behavior");
  await expect(behavior).toHaveAttribute("aria-current", "page");
  await expect(analytics).not.toHaveAttribute("aria-current", "page");
  await analytics.focus();
  await expect(analytics).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/view=analytics/);
  await expect(analytics).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("heading", { name: "Behavior explorer" })).toHaveCount(0);

  await funnel.focus();
  await expect(funnel).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/view=funnel/);
  await expect(funnel).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("heading", { name: "Funnel", exact: true })).toBeVisible();

  await behavior.focus();
  await expect(behavior).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/view=behavior/);
  await expect(behavior).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("heading", { name: "Ordered funnel" })).toBeVisible();

  // Native controls must be usable from the keyboard, without a mouse.
  const range = page.getByRole("combobox", { name: "Analytics date range" });
  await range.focus();
  await range.press("End");
  await expect(range).toHaveValue("30");
  const run = page.getByRole("button", { name: "Run funnel" });
  await run.focus();
  await expect(run).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/view=behavior.*days=30/);
  await expect(behavior).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("heading", { name: "Ordered funnel" })).toBeVisible();
});

test("Behavior tab reads tenant-scoped aggregates and filters unsafe visitor paths", async ({ page, request }) => {
  await page.goto("/marketing?view=behavior");
  await expect(page.getByRole("heading", { name: "Behavior explorer" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ordered funnel" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Popular navigation paths" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Popular navigation paths" }).getByText("/courses/200-hour-ytt.php", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Popular navigation paths" }).getByText("/enroll.php", { exact: true })).toBeVisible();
  await expect(page.getByText("/private?email=student@example.test", { exact: true })).toHaveCount(0);
  await expect(page.getByText("/account/billing.php", { exact: true })).toHaveCount(0);
  await expect(page.getByText("/students/dashboard", { exact: true })).toHaveCount(0);
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

test("Event activity reads tenant-scoped UTC trends alongside the existing funnel", async ({ page, request }) => {
  await page.goto("/marketing?view=behavior");
  await expect(page.getByRole("heading", { name: "Ordered funnel" })).toBeVisible();
  const trends = page.getByRole("region", { name: "Event activity trends" });
  await expect(trends.getByRole("heading", { name: "Event activity" })).toBeVisible();
  await expect(trends.getByRole("article", { name: "Page viewed event trend" })).toBeVisible();
  await expect(trends.getByRole("article", { name: "Form started event trend" })).toBeVisible();
  await expect(trends.getByRole("article", { name: "Form submitted event trend" })).toBeVisible();
  await expect(trends.getByText("The current UTC day is still incomplete.")).toBeVisible();

  const calls = await (await request.get(fixtureBase + "/__behavior_trend_calls")).json();
  expect(calls.length).toBeGreaterThan(0);
  expect(calls.every((call: any) => call.organization_id === organizationId
    && call.days === 14
    && JSON.stringify(call.events) === JSON.stringify([
      "web.page_viewed","web.form_started","web.form_submitted"
    ]))).toBe(true);
  for (const width of [390,768,1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth))
      .toBeLessThanOrEqual(width + 2);
  }
});

test("Changing the funnel steps updates independent trends but not the visitor path panel", async ({ page, request }) => {
  await page.goto("/marketing?view=behavior");
  await page.getByRole("combobox", { name: "Funnel step 3" }).selectOption("web.cta_clicked");
  await page.getByRole("combobox", { name: "Analytics date range" }).selectOption("30");
  await page.getByRole("button", { name: "Run funnel" }).click();
  await expect(page).toHaveURL(/view=behavior.*days=30/);
  await expect(page.getByRole("article", { name: "CTA clicked event trend" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Popular navigation paths" })).toBeVisible();
  const calls = await (await request.get(fixtureBase + "/__behavior_trend_calls")).json();
  expect(calls.some((call: any) => call.organization_id === organizationId
    && call.days === 30
    && Array.isArray(call.events)
    && call.events.join(",") === "web.page_viewed,web.form_started,web.cta_clicked")).toBe(true);
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
  await expect(page.getByRole("region", { name: "Event activity trends" }).getByRole("status")).toBeVisible();
});

test("Legitimate zero data shows zero stages and a privacy-safe path empty state", async ({ page, request }) => {
  const setup = await request.get(fixtureBase + "/__behavior_scenario?state=empty");
  expect(setup.ok()).toBe(true);
  await page.goto("/marketing?view=behavior");
  await expect(page.getByRole("heading", { name: "Ordered funnel" })).toBeVisible();
  await expect(page.getByText("No path has enough evidence yet. Try a longer date range.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Behavior analytics unavailable" })).toHaveCount(0);
  await expect(page.getByRole("article", { name: "Page viewed event trend" })).toBeVisible();
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

  await page.getByRole("navigation", { name: "Marketing workspace views" }).getByRole("link", { name: "Funnel", exact: true }).click();
  await expect(page).toHaveURL(/view=funnel/);
  await expect(page.getByRole("heading", { name: "Funnel", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Behavior explorer" })).toHaveCount(0);
});

test("Switching synthetic tenants refreshes all behavior reports without retaining prior tenant evidence", async ({ page, request }) => {
  const secondaryOrganizationId = "00000000-0000-4000-8000-000000000012";
  const primaryPath = "/courses/200-hour-ytt.php";
  const secondaryPath = "/courses/second-tenant.php";
  const paths = page.getByRole("region", { name: "Popular navigation paths" });
  const breakdown = page.getByRole("region", { name: "Event page breakdown" });

  // Separate synthetic datasets are selected only on the local loopback fixture.
  // This is not a login as, nor an impersonation of, a real second tenant.
  try {
    await page.goto("/marketing?view=behavior&days=7");
    await expect(paths.getByText(primaryPath, { exact: true })).toBeVisible();
    await expect(breakdown.getByText(primaryPath, { exact: true })).toBeVisible();
    await expect(paths.getByText(secondaryPath, { exact: true })).toHaveCount(0);

    const switched = await request.get(fixtureBase + "/__behavior_scenario?state=ready&tenant=secondary");
    expect(switched.ok()).toBe(true);
    await page.reload();

    await expect(paths.getByText(secondaryPath, { exact: true })).toBeVisible();
    await expect(breakdown.getByText(secondaryPath, { exact: true })).toBeVisible();
    await expect(paths.getByText(primaryPath, { exact: true })).toHaveCount(0);
    await expect(breakdown.getByText(primaryPath, { exact: true })).toHaveCount(0);

    for (const endpoint of ["/__behavior_calls", "/__behavior_trend_calls", "/__behavior_breakdown_calls"]) {
      const calls = await (await request.get(fixtureBase + endpoint)).json();
      expect(calls.length, endpoint).toBeGreaterThan(0);
      expect(calls.every((call: any) => call.organization_id === secondaryOrganizationId), endpoint).toBe(true);
    }

    // Simulated loss of authority must not leave previously rendered paths behind.
    const denied = await request.get(fixtureBase + "/__behavior_scenario?state=denied&tenant=secondary");
    expect(denied.ok()).toBe(true);
    await page.reload();
    await expect(page.getByRole("heading", { name: "Behavior analytics unavailable" })).toBeVisible();
    await expect(paths.getByText(secondaryPath, { exact: true })).toHaveCount(0);
    await expect(breakdown.getByText(secondaryPath, { exact: true })).toHaveCount(0);
  } finally {
    await request.get(fixtureBase + "/__behavior_scenario?state=ready&tenant=primary");
  }
});

test("Synthetic behavior RPCs reject foreign tenant IDs for funnel, trends and breakdown", async ({ request }) => {
  const secondaryOrganizationId = "00000000-0000-4000-8000-000000000012";
  const endpoints = [
    ["/rest/v1/rpc/get_native_behavior_workspace_v1",
      { p_organization_id: secondaryOrganizationId, p_days: 14,
        p_steps: ["web.page_viewed", "web.form_started", "web.form_submitted"] }],
    ["/rest/v1/rpc/get_native_behavior_event_trends_v1",
      { p_organization_id: secondaryOrganizationId, p_days: 14, p_events: ["web.page_viewed"] }],
    ["/rest/v1/rpc/get_native_behavior_page_breakdown_v1",
      { p_organization_id: secondaryOrganizationId, p_days: 14, p_event: "web.page_viewed" }],
  ] as const;

  for (const [endpoint, body] of endpoints) {
    const response = await request.post(fixtureBase + endpoint, { data: body });
    expect(response.status(), endpoint).toBe(403);
    const result = await response.json();
    expect(result.code).toBe("42501");
    expect(JSON.stringify(result)).not.toContain("/courses/");
  }
});

test("Partial behavior reporting failures keep independent panels usable without leaking backend errors", async ({ page, request }) => {
  const publicPath = "/courses/200-hour-ytt.php";
  const scenarios = ["funnel-error", "trends-error", "breakdown-error"] as const;
  const funnelPaths = page.getByRole("region", { name: "Popular navigation paths" });
  const trends = page.getByRole("region", { name: "Event activity trends" });
  const breakdown = page.getByRole("region", { name: "Event page breakdown" });

  try {
    for (const state of scenarios) {
      const setup = await request.get(fixtureBase + "/__behavior_scenario?state=" + state);
      expect(setup.ok(), state).toBe(true);
      await page.goto("/marketing?view=behavior");

      if (state === "funnel-error") {
        await expect(page.getByRole("heading", { name: "Behavior analytics unavailable" })).toBeVisible();
        await expect(funnelPaths.getByText(publicPath, { exact: true })).toHaveCount(0);
      } else {
        await expect(page.getByRole("heading", { name: "Ordered funnel" })).toBeVisible();
        await expect(funnelPaths.getByText(publicPath, { exact: true })).toBeVisible();
      }

      if (state === "trends-error") {
        await expect(trends.getByRole("status")).toBeVisible();
        await expect(trends.getByRole("article", { name: "Page viewed event trend" })).toHaveCount(0);
      } else {
        await expect(trends.getByRole("article", { name: "Page viewed event trend" })).toBeVisible();
      }

      if (state === "breakdown-error") {
        await expect(breakdown.getByRole("status")).toBeVisible();
        await expect(breakdown.getByText(publicPath, { exact: true })).toHaveCount(0);
      } else {
        await expect(breakdown.getByText(publicPath, { exact: true })).toBeVisible();
      }

      // The fixture deliberately sends unique backend failure messages; none
      // may appear in any visible report, even when the other panels succeed.
      for (const message of [
        "Read-only fixture error", "Synthetic trends unavailable", "Synthetic sensitive error",
      ]) {
        await expect(page.getByText(message, { exact: true })).toHaveCount(0);
      }

      for (const endpoint of [
        "/__behavior_calls", "/__behavior_trend_calls", "/__behavior_breakdown_calls",
      ]) {
        const calls = await (await request.get(fixtureBase + endpoint)).json();
        expect(calls.length, state + endpoint).toBeGreaterThan(0);
        expect(calls.every((call: { organization_id: string }) =>
          call.organization_id === organizationId), state + endpoint).toBe(true);
      }
    }
  } finally {
    await request.get(fixtureBase + "/__behavior_scenario?state=ready&tenant=primary");
  }
});

test("Malformed aggregate counts do not impersonate observed zeroes in independent reports", async ({ page, request }) => {
  const publicPath = "/courses/200-hour-ytt.php";
  const scenarios = ["malformed-funnel-count", "malformed-trends-count", "malformed-breakdown-count"] as const;
  const paths = page.getByRole("region", { name: "Popular navigation paths" });
  const trends = page.getByRole("region", { name: "Event activity trends" });
  const breakdown = page.getByRole("region", { name: "Event page breakdown" });

  try {
    for (const state of scenarios) {
      const setup = await request.get(fixtureBase + "/__behavior_scenario?state=" + state);
      expect(setup.ok(), state).toBe(true);
      await page.goto("/marketing?view=behavior");

      if (state === "malformed-funnel-count") {
        await expect(page.getByRole("heading", { name: "Behavior analytics unavailable" })).toBeVisible();
        await expect(paths.getByText(publicPath, { exact: true })).toHaveCount(0);
        await expect(page.getByRole("heading", { name: "Ordered funnel" })).toHaveCount(0);
      } else {
        await expect(page.getByRole("heading", { name: "Ordered funnel" })).toBeVisible();
        await expect(paths.getByText(publicPath, { exact: true })).toBeVisible();
      }

      if (state === "malformed-trends-count") {
        await expect(trends.getByRole("status")).toBeVisible();
        await expect(trends.getByRole("article", { name: "Page viewed event trend" })).toHaveCount(0);
      } else {
        await expect(trends.getByRole("article", { name: "Page viewed event trend" })).toBeVisible();
      }

      if (state === "malformed-breakdown-count") {
        await expect(breakdown.getByRole("status")).toBeVisible();
        await expect(breakdown.getByText(publicPath, { exact: true })).toHaveCount(0);
      } else {
        await expect(breakdown.getByText(publicPath, { exact: true })).toBeVisible();
      }

      for (const endpoint of [
        "/__behavior_calls", "/__behavior_trend_calls", "/__behavior_breakdown_calls",
      ]) {
        const calls = await (await request.get(fixtureBase + endpoint)).json();
        expect(calls.length, state + endpoint).toBeGreaterThan(0);
        expect(calls.every((call: { organization_id: string }) =>
          call.organization_id === organizationId), state + endpoint).toBe(true);
      }
    }
  } finally {
    await request.get(fixtureBase + "/__behavior_scenario?state=ready&tenant=primary");
  }
});

test("Out-of-range or stale UTC trend dates fail closed without erasing the other reports", async ({ page, request }) => {
  const publicPath = "/courses/200-hour-ytt.php";
  const scenarios = ["trends-shifted-calendar", "trends-stale-window"] as const;
  const trendPanel = page.getByRole("region", { name: "Event activity trends" });
  const pathsPanel = page.getByRole("region", { name: "Popular navigation paths" });
  const pagePanel = page.getByRole("region", { name: "Event page breakdown" });
  try {
    for (const state of scenarios) {
      const setup = await request.get(fixtureBase + "/__behavior_scenario?state=" + state);
      expect(setup.ok(), state).toBe(true);
      await page.goto("/marketing?view=behavior");
      await expect(trendPanel.getByRole("status")).toBeVisible();
      await expect(trendPanel.getByRole("article", { name: "Page viewed event trend" })).toHaveCount(0);
      await expect(page.getByRole("heading", { name: "Ordered funnel" })).toBeVisible();
      await expect(pathsPanel.getByText(publicPath, { exact: true })).toBeVisible();
      await expect(pagePanel.getByText(publicPath, { exact: true })).toBeVisible();
      const trendCalls = await (await request.get(fixtureBase + "/__behavior_trend_calls")).json();
      expect(trendCalls.length, state).toBeGreaterThan(0);
      expect(trendCalls.every((call: { organization_id: string }) =>
        call.organization_id === organizationId), state).toBe(true);
    }
  } finally {
    await request.get(fixtureBase + "/__behavior_scenario?state=ready&tenant=primary");
  }
});

test("Owner can explicitly copy aggregate Event activity review figures, never tenant or path data", async ({ page, request, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const copy = page.getByRole("button", { name: "Copy Event activity review figures" });
  const trends = page.getByRole("region", { name: "Event activity trends" });

  try {
    await page.goto("/marketing?view=behavior");
    await expect(trends.getByRole("article", { name: "Page viewed event trend" })).toBeVisible();
    await expect(copy).toBeVisible();
    await copy.click();
    await expect(trends.getByRole("status").getByText("Aggregate figures copied")).toBeVisible();

    const first = await page.evaluate(() => navigator.clipboard.readText());
    expect(first).toContain("Status: dashboard observation, NOT acceptance or SQL reconciliation");
    expect(first).toContain("UTC calendar window: 14 days");
    expect(first).toMatch(/web\.page_viewed: events=\d+; identified_sessions=\d+/);
    expect(first).toMatch(/web\.form_started: events=\d+; identified_sessions=\d+/);
    expect(first).toMatch(/web\.form_submitted: events=\d+; identified_sessions=\d+/);
    for (const secret of [organizationId, "00000000-0000-4000-8000-000000000001",
      "/courses/200-hour-ytt.php", "/private", "session_key", "tracking_source_id"]) {
      expect(first).not.toContain(secret);
    }

    await page.getByRole("combobox", { name: "Analytics date range" }).selectOption("30");
    await page.getByRole("button", { name: "Run funnel" }).click();
    await expect(page).toHaveURL(/days=30/);
    await expect(trends.getByText("Last 30 UTC calendar days")).toBeVisible();
    await copy.click();
    const second = await page.evaluate(() => navigator.clipboard.readText());
    expect(second).toContain("UTC calendar window: 30 days");
    expect(second).not.toContain("UTC calendar window: 14 days");

    const denied = await request.get(fixtureBase + "/__behavior_scenario?state=denied");
    expect(denied.ok()).toBe(true);
    await page.reload();
    await expect(copy).toHaveCount(0);
    await expect(trends.getByRole("status")).toBeVisible();
  } finally {
    await request.get(fixtureBase + "/__behavior_scenario?state=ready&tenant=primary");
  }
});


test("Authorized synthetic funnel copy contains only bounded aggregates, refreshes across windows and tenants, and disappears on denial", async ({ page, request, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const copy = page.getByRole("button", { name: "Copy ordered funnel review figures" });

  try {
    await page.goto("/marketing?view=behavior");
    await expect(copy).toBeVisible();
    await copy.click();
    await expect(page.getByRole("status").getByText("Funnel figures copied")).toBeVisible();
    const primary = await page.evaluate(() => navigator.clipboard.readText());
    expect(primary).toContain("Status: dashboard observation, NOT owner/admin acceptance or SQL reconciliation");
    expect(primary).toContain("Rolling observation window: 14 days (not UTC calendar-day Event Activity)");
    expect(primary).toContain("Step 1: web.page_viewed; ordered_sessions=12");
    expect(primary).toContain("Step 2: web.form_started; ordered_sessions=8");
    expect(primary).toContain("Step 3: web.form_submitted; ordered_sessions=4");
    expect(primary).toContain("Observed page-view sessions denominator: 12");
    for (const forbidden of [
      organizationId, "00000000-0000-4000-8000-000000000001",
      "/courses/200-hour-ytt.php", "/enroll.php", "session_key",
      "tracking_source_id", "anonymous_visitor_id",
    ]) expect(primary).not.toContain(forbidden);

    await page.getByRole("combobox", { name: "Analytics date range" }).selectOption("30");
    await page.getByRole("button", { name: "Run funnel" }).click();
    await expect(page).toHaveURL(/days=30/);
    await expect(copy).toBeVisible();
    await copy.click();
    const thirty = await page.evaluate(() => navigator.clipboard.readText());
    expect(thirty).toContain("Rolling observation window: 30 days");
    expect(thirty).not.toContain("Rolling observation window: 14 days");

    const switched = await request.get(fixtureBase + "/__behavior_scenario?state=ready&tenant=secondary");
    expect(switched.ok()).toBe(true);
    await page.reload();
    await expect(copy).toBeVisible();
    await copy.click();
    const secondary = await page.evaluate(() => navigator.clipboard.readText());
    expect(secondary).toContain("Step 1: web.page_viewed; ordered_sessions=7");
    expect(secondary).toContain("Step 2: web.form_started; ordered_sessions=5");
    expect(secondary).toContain("Step 3: web.form_submitted; ordered_sessions=3");
    expect(secondary).not.toContain("ordered_sessions=12");
    expect(secondary).not.toContain("/courses/second-tenant.php");

    const denied = await request.get(fixtureBase + "/__behavior_scenario?state=denied&tenant=secondary");
    expect(denied.ok()).toBe(true);
    await page.reload();
    await expect(copy).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Behavior analytics unavailable" })).toBeVisible();
  } finally {
    await request.get(fixtureBase + "/__behavior_scenario?state=ready&tenant=primary");
  }
});
