const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

function source(path) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const page = source("app/seo/intelligence/page.tsx");
const nav = source("components/marketing/marketing-navigation.tsx");
const seoHome = source("app/seo/page.tsx");
const css = source("app/seo/intelligence/intelligence.module.css");

test("Organic Intelligence is discoverable from existing growth navigation and SEO overview", () => {
  assert.match(nav, /href: '\/seo\/intelligence'/);
  assert.match(seoHome, /href="\/seo\/intelligence"/);
});

test("UI reuses tenant-authorized SEO evidence, not fake metrics or a second source of truth", () => {
  assert.match(page, /await getSeoWorkspace\(\)/);
  assert.match(page, /requirePrivilegedWorkspaceAccess/);
  assert.match(page, /workspace\.overview\.clicks/);
  assert.match(page, /workspace\.overview\.organic_qualified_leads/);
  assert.match(page, /workspace\.geoSummary\.ga4_ai_sessions/);
  assert.match(page, /safeOrganicQuery\(row\.query\)/);
  assert.match(page, /value === null \|\| value === undefined/);
  assert.match(page, /return valueNumber === null \? "—"/);
});

test("Filtering links navigate to real server-rendered evidence views", () => {
  assert.match(page, /"\/seo\/intelligence\?focus="/);
  for (const name of ["search", "content", "answers"]) {
    assert.ok(page.includes('key: "' + name + '"'));
  }
  for (const path of [
    "/seo/search-performance", "/seo/content-opportunities",
    "/seo/ai-answer-visibility", "/seo/technical",
    "/seo/open-seo", "/marketing/integrations",
  ]) {
    assert.ok(page.includes(path), "Missing real route " + path);
  }
});

test("Vendor routes remain owner/admin-only and no Claude tools can execute through UI", () => {
  assert.match(page, /activeWorkspace\.role === "owner" \|\| activeWorkspace\.role === "admin"/);
  assert.match(page, /\{canOpenSeoProjects \?/);
  assert.doesNotMatch(page, /runOrganicGrowthReadOnlyTool|executeOneOrganicGrowthClaudeTool/);
  assert.doesNotMatch(page, /fetch\(|useServerAction|formAction|onSubmit=/);
  assert.match(page, /Claude workflows not activated/);
});

test("UI labels measured AI referrals separately from unobserved AI citations", () => {
  assert.match(page, /GA4 traffic, not model citations/);
  assert.match(page, /do not establish AI answer citations/);
  assert.match(page, /Missing observations are not proof of missing rankings/);
});

test("New page uses native SalsysOS design tokens and responsive breakpoints", () => {
  assert.match(css, /var\(--app-brand-700\)/);
  assert.match(css, /var\(--app-surface\)/);
  assert.match(css, /@media\(max-width:650px\)/);
  assert.doesNotMatch(css, /yogakulam|yoga|#294A3A/i);
});
