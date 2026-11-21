import { expect, test } from "@playwright/test";

// Completely synthetic loopback workspace. No real Supabase, provider API, or
// customer data. The fixture defaults to Google disconnected for all other UI
// suites; each test explicitly selects and resets its scenario.
const fixtureBase = "http://127.0.0.1:" + Number(process.env.UI_FIXTURE_PORT ?? 3108);
const orgId = "00000000-0000-4000-8000-000000000002";

test.beforeEach(async ({ context, request }) => {
  const user = {
    id: "00000000-0000-4000-8000-000000000001",
    aud: "authenticated",
    role: "authenticated",
    email: "synthetic-organic-qa@example.test",
    app_metadata: { provider: "email" },
    user_metadata: {},
  };
  const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const access_token = [
    b64({ alg: "HS256", typ: "JWT" }),
    b64({ sub: user.id, role: "authenticated", aud: "authenticated", exp: expires }),
    "synthetic-local-fixture",
  ].join(".");
  const session = {
    access_token, refresh_token: "synthetic-local-refresh",
    expires_at: expires, expires_in: 3600, token_type: "bearer", user,
  };
  await context.addCookies([{
    name: "sb-127-auth-token",
    value: "base64-" + b64(session),
    domain: "127.0.0.1", path: "/", sameSite: "Lax",
  }]);
  const response = await request.get(fixtureBase + "/__seo_scenario?state=connected");
  expect(response.ok()).toBe(true);
});

test.afterEach(async ({ request }) => {
  await request.get(fixtureBase + "/__seo_scenario?state=disconnected");
});

test("Content research selects actual bounded topic evidence and filters contact-like queries", async ({ page, request, context }) => {
  await page.goto("/seo/intelligence/content-brief");
  await expect(page.getByRole("heading", { name: "Content brief research", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "International student onboarding", exact: true })).toBeVisible();
  await expect(page.getByText("international student onboarding guide", { exact: true })).toBeVisible();
  await expect(page.getByText("private-student@example.test", { exact: false })).toHaveCount(0);
  await expect(page.getByText("Not independently verified in this worksheet", { exact: false }).first()).toBeVisible();
  const calls = await (await request.get(fixtureBase + "/__seo_calls")).json();
  expect(calls).toEqual([{ organization_id: orgId }]);
  await page.screenshot({ path: "test-results/organic-brief-research-desktop.png", animations: "disabled" });

  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByRole("button", { name: "Copy evidence outline" }).click();
  await expect(page.getByText("Copied locally — review before reuse.")).toBeVisible();
  const outline = await page.evaluate(async () => navigator.clipboard.readText());
  expect(outline).toContain("CONTENT RESEARCH EVIDENCE (NOT AN AI-GENERATED BRIEF)");
  expect(outline).toContain("international student onboarding guide");
  expect(outline).not.toContain("private-student@example.test");

  for (const width of [768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await expect(page.getByRole("heading", { name: "Content brief research", exact: true })).toBeVisible();
  }
  await page.screenshot({ path: "test-results/organic-brief-research-mobile.png", animations: "disabled" });

  await page.getByRole("link", { name: /Privacy and consent documentation/ }).click();
  await expect(page).toHaveURL(/topic=topic-2/);
  await expect(page.getByRole("heading", { name: "Privacy and consent documentation" })).toBeVisible();
  await expect(page.getByText("No safe query-level evidence was returned", { exact: false })).toBeVisible();
  await expect(page.getByRole("heading", { name: "International student onboarding" })).toHaveCount(0);
});

test("Unknown topic ID cannot request arbitrary organization records", async ({ page, request }) => {
  await page.goto("/seo/intelligence/content-brief?topic=unknown-organization-id");
  await expect(page.getByRole("heading", { name: "Topic not available in the loaded list" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy evidence outline" })).toHaveCount(0);
  const calls = await (await request.get(fixtureBase + "/__seo_calls")).json();
  expect(calls).toEqual([{ organization_id: orgId }]);
});

test("Disconnected and failed source states show honest empty results", async ({ page, request }) => {
  await request.get(fixtureBase + "/__seo_scenario?state=disconnected");
  await page.goto("/seo/intelligence/content-brief");
  await expect(page.getByText("Google search data is not connected", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy evidence outline" })).toHaveCount(0);
  expect(await (await request.get(fixtureBase + "/__seo_calls")).json()).toEqual([]);

  await request.get(fixtureBase + "/__seo_scenario?state=error");
  await page.goto("/seo/intelligence/content-brief");
  await expect(page.getByText("Content research evidence could not be loaded", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy evidence outline" })).toHaveCount(0);
});
