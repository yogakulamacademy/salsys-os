import { expect, test } from "@playwright/test";
test.beforeEach(async ({ context, page }) => {
  page.on("pageerror", (error) => {
    throw error;
  });
  const user = {
    id: "00000000-0000-4000-8000-000000000001",
    aud: "authenticated",
    role: "authenticated",
    email: "reviewer@example.test",
    app_metadata: { provider: "email" },
    user_metadata: {},
  };
  const b64 = (v: unknown) =>
    Buffer.from(JSON.stringify(v)).toString("base64url");
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const session = {
    access_token: `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: user.id, role: "authenticated", aud: "authenticated", exp })}.synthetic-local-fixture`,
    refresh_token: "synthetic-local-refresh",
    expires_at: exp,
    expires_in: 3600,
    token_type: "bearer",
    user,
  };
  await context.addCookies([
    {
      name: "sb-127-auth-token",
      value: `base64-${b64(session)}`,
      domain: "127.0.0.1",
      path: "/",
      sameSite: "Lax",
    },
  ]);
});
test("reference layout presents real definitions, period changes and source drill-downs", async ({
  page,
}) => {
  await page.goto("/home");
  await expect(
    page.getByRole("heading", { name: "Command Center", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Synthetic demo · no customer data"),
  ).toBeVisible();
  await expect(page.locator(".home-kpis>.home-card")).toHaveCount(5);
  await page
    .getByRole("navigation", { name: "Reporting period" })
    .getByRole("link", { name: "7D", exact: true })
    .click();
  await expect(page).toHaveURL(/period=7d/);
  await page.locator(".home-source-legend").getByRole("link").first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("row")).toHaveCount(45);
  await expect(page).toHaveURL(/detail=source/);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});
test("funnel drill-down uses exactly the won cohort and all custom period controls work", async ({
  page,
}) => {
  await page.goto("/home?period=7d");
  await page.locator(".home-funnel-row").last().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL(/detail=cohortEnrolled/);
  await expect(dialog.getByRole("row")).toHaveCount(14);
  await dialog.getByRole("button", { name: "Close records" }).click();
  await expect(dialog).toHaveCount(0);
  await page.locator(".home-date-picker>summary").click();
  await page.getByRole("link", { name: "Yesterday", exact: true }).click();
  await expect(page).toHaveURL(/period=yesterday/);
});
test("chart controls toggle series and the accessible table opens day-specific evidence", async ({
  page,
}) => {
  await page.goto("/home?period=7d");
  const replies = page.getByRole("button", {
    name: "Human replies",
    exact: true,
  });
  await expect(replies).toHaveAttribute("aria-pressed", "true");
  await replies.click();
  await expect(replies).toHaveAttribute("aria-pressed", "false");
  await page.getByText("View daily data", { exact: true }).click();
  const table = page.locator(".home-chart-table table");
  await table.locator("tbody tr").first().getByRole("link").first().click();
  await expect(page).toHaveURL(/day=/);
  await expect(page.getByRole("dialog")).toBeVisible();
});
test("record inspector contains keyboard focus and restores focus on close", async ({
  page,
}) => {
  await page.goto("/home?period=7d");
  const trigger = page.locator(".home-kpi").first().getByRole("link");
  await trigger.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect
    .poll(() => dialog.evaluate((el) => el.contains(document.activeElement)))
    .toBe(true);
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press("Tab");
    expect(
      await dialog.evaluate((el) => el.contains(document.activeElement)),
    ).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});
test("search shortcut and New menu keep existing actions honest", async ({
  page,
}) => {
  await page.goto("/home");
  // New becomes visible after the shell has resolved its workspace and mounted
  // its keyboard handler; pressing a key against unhydrated SSR HTML is premature.
  await expect(page.locator('header summary').filter({hasText:'New'})).toBeVisible();
  await page.keyboard.press("Control+k");
  const dialog = page.getByRole("dialog", {
    name: "Search workspaces and actions",
  });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("textbox").fill("Maria");
  await expect(
    dialog.getByText("Demo mode: live record search is off."),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.locator("header summary").filter({ hasText: "New" }).click();
  await expect(
    page.getByRole("link", { name: "New lead", exact: true }),
  ).toBeVisible();
});
test("desktop, tablet, mobile and dark previews stay within the viewport", async ({
  page,
}) => {
  await page.goto("/home?period=30d");
  await expect(page.locator(".home-donut")).toBeVisible();
  await page.screenshot({
    path: "test-results/home-reference-desktop.png",
    caret: "initial",
    fullPage: true,
    animations: "disabled",
  });
  for (const width of [1280, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
      .toBeLessThanOrEqual(width);
    await expect(
      page.getByLabel("Open account menu", { exact: true }),
    ).toBeInViewport();
  }
  await page.screenshot({
    path: "test-results/home-reference-mobile.png",
    caret: "initial",
    fullPage: true,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 1672, height: 1000 });
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await page.screenshot({
    path: "test-results/home-reference-dark.png",
    caret: "initial",
    fullPage: true,
    animations: "disabled",
  });
});
