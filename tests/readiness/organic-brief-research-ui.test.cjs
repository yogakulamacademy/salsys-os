const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

const read = (file) => readFileSync(join(process.cwd(), file), "utf8");
const page = read("app/seo/intelligence/content-brief/page.tsx");
const parent = read("app/seo/intelligence/page.tsx");
const copy = read("components/seo/copy-research-evidence.tsx");
const loader = read("lib/seo-content-brief-research.ts");
const css = read("app/seo/intelligence/content-brief/research.module.css");

test("Content Brief card opens a real research route instead of a dead-end placeholder", () => {
  assert.match(parent, /href="\/seo\/intelligence\/content-brief"/);
  assert.match(page, /Content brief research/);
  assert.match(page, /Top observed queries/);
});

test("Reader is authenticated and topics are selected only from the active SEO workspace", () => {
  const auth = page.indexOf("await requirePrivilegedWorkspaceAccess()");
  const fetch = page.indexOf("await getContentBriefResearch(activeWorkspace.organizationId)");
  assert.ok(auth >= 0 && auth < fetch, "Authorization must precede data fetch");
  assert.match(page, /research\.contentGaps/);
  assert.match(page, /topics\.find\(\(topic\) => topic\.id === selectedId\)/);
  assert.match(page, /\^\[a-zA-Z0-9_-\]\{1,128\}\$/);
  assert.doesNotMatch(page, /\.from\(|\.rpc\(|createClient\(/);
});

test("Evidence is source-bound, bounded, sanitized, and represents absent values as unknown", () => {
  assert.match(page, /safeOrganicQuery\(value\)/);
  assert.match(page, /safeLabel\(row\.query\)/);
  assert.match(page, /\.slice\(0, 8\)/);
  assert.match(page, /\.slice\(0, 40\)/);
  assert.match(page, /value === undefined \|\| value === null/);
  assert.match(page, /return "—"/);
  assert.match(page, /full query coverage, aligned date windows/i);
  assert.match(page, /Not independently verified in this worksheet/);
  assert.match(page, /No Claude execution/);
});

test("Specialist data loader avoids full SEO fanout and fails closed on tenant drift", () => {
  assert.match(loader, /import "server-only"/);
  assert.match(loader, /getProviderVisibility\(supabase\)/);
  assert.match(loader, /visibility\.organizationId !== authorizedOrganizationId/);
  assert.match(loader, /if \(!visibility\.googleConnected\)/);
  assert.match(loader, /supabase\.rpc\("get_seo_content_intelligence"/);
  assert.match(loader, /p_organization_id: authorizedOrganizationId/);
  assert.match(loader, /gaps\.slice\(0, 200\)/);
  assert.doesNotMatch(loader, /getSeoWorkspace\(|get_seo_workspace_v2|get_seo_experiment_intelligence|get_seo_optimization_intelligence/);
  assert.doesNotMatch(loader, /service_role|from\(|insert\(|update\(|delete\(/);
  assert.doesNotMatch(page, /getSeoWorkspace\(/);
});

test("Copy action is human-initiated, local-only, and handles clipboard errors", () => {
  assert.match(copy, /"use client"/);
  assert.match(copy, /onClick=\{handleCopy\}/);
  assert.match(copy, /navigator\.clipboard\.writeText\(text\)/);
  assert.match(copy, /setState\("failed"\)/);
  assert.match(copy, /aria-live="polite"/);
  assert.doesNotMatch(copy, /fetch\(|axios|onSubmit|localStorage|sessionStorage/);
  assert.doesNotMatch(page, /runOrganicGrowthReadOnlyTool|executeOneOrganicGrowthClaudeTool|anthropic\.|publish\(/);
});

test("Research page uses native tokens and has tablet/mobile layouts", () => {
  assert.match(css, /var\(--app-brand-50\)/);
  assert.match(css, /var\(--app-text-strong\)/);
  assert.match(css, /@media\(max-width:840px\)/);
  assert.match(css, /@media\(max-width:560px\)/);
});
