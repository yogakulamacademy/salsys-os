#!/usr/bin/env node
/**
 * Repository contract check for the read-only vendor workspace pilot.
 * The live integration gates are deliberately NOT activated by this script.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const file = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const config = file("lib/integrations/vendor-workspaces.ts");
const notice = file("components/vendor-workspace-notice.tsx");
const health = file("lib/integrations/vendor-workspace-health.ts");
const diagnosticsPage = file("app/settings/vendor-workspaces/page.tsx");
const openSeoMcp = file("lib/integrations/openseo-mcp-projects.ts");
const openSeoTransport = file("lib/integrations/openseo-mcp-transport.ts");
const openSeoRankPage = file("app/seo/open-seo/rank-trackers/page.tsx");
const openSeoPage = file("app/seo/open-seo/page.tsx");
const openSeoParser = file("lib/integrations/openseo-mcp-response.ts");
const seo = file("app/seo/layout.tsx");
const whatsapp = file("app/automation/whatsapp/layout.tsx");
const env = file(".env.example");
const migration = file("docs/open-source-seo-whatsapp-adoption.md");
const oldSeo = file("app/seo/page.tsx");
const oldWhatsApp = file("app/automation/whatsapp/page.tsx");
const sender = file("lib/integrations/whatsapp-provider-send.ts");

for (const marker of [
  'import "server-only"',
  'SALSYS_VENDOR_WORKSPACE_PREVIEW === "true"',
  'SALSYS_OPENSEO_URL',
  'SALSYS_DESKCOMM_URL',
  'parsed.protocol === "https:"',
  'parsed.username',
  'parsed.password',
  'parsed.search',
  'parsed.hash',
  'env.NODE_ENV !== "production"',
]) {
  assert.ok(config.includes(marker), `Vendor preview config missing: ${marker}`);
}

assert.match(env, /SALSYS_VENDOR_WORKSPACE_PREVIEW=false/);
assert.ok(env.includes("SALSYS_OPENSEO_SALSYS_ORG_ID="));
assert.ok(env.includes("SALSYS_OPENSEO_API_KEY="));
assert.ok(openSeoMcp.includes('"list_projects"'));
assert.ok(openSeoMcp.includes('"get_rank_tracker"'));
assert.ok(openSeoTransport.includes('mappedTenant !== organizationId'));
assert.ok(openSeoTransport.includes('method: "tools/call"'));
assert.ok(openSeoTransport.includes('redirect: "manual"'));
assert.ok(openSeoTransport.includes('AbortSignal.timeout(8000)'));
assert.ok(openSeoPage.includes("await requireAdminWorkspaceAccess()"));
assert.ok(openSeoParser.includes("structured.projects"));
assert.ok(openSeoRankPage.includes("await requireAdminWorkspaceAccess()"));
assert.ok(openSeoTransport.includes('tool !== "list_projects" && tool !== "get_rank_tracker"'));
assert.ok(!openSeoTransport.includes("executePreparedWhatsAppProviderSend"));
assert.ok(!openSeoMcp.includes("executePreparedWhatsAppProviderSend"));
assert.match(notice, /if \(!preview\.previewEnabled\) return null/);
assert.match(notice, /rel="noopener noreferrer"/);
assert.match(notice, /not yet connected/);
assert.ok(notice.includes('href="/settings/vendor-workspaces"'));
assert.ok(diagnosticsPage.includes("await requireAdminWorkspaceAccess()"));
assert.ok(health.includes('if (!preview.previewEnabled)'));
assert.ok(health.includes('method: "GET"'));
assert.ok(health.includes('redirect: "manual"'));
assert.ok(health.includes('AbortSignal.timeout(4000)'));
assert.ok(health.includes('"/api/health"'));
assert.ok(health.includes('"/api/v1/health"'));
assert.ok(!health.includes('method: "POST"') && !health.includes("Authorization:") && !health.includes("Bearer "));
assert.match(seo, /workspace\.role === "owner" \|\| workspace\.role === "admin"/);
assert.match(whatsapp, /workspace\.role === "owner" \|\| workspace\.role === "admin"/);
assert.match(seo, /\{children\}/);
assert.match(whatsapp, /\{children\}/);
assert.match(oldSeo, /getSeoWorkspace/);
assert.match(oldWhatsApp, /getWhatsAppSenderReadiness/);
assert.match(sender, /executePreparedWhatsAppProviderSend/);
assert.match(migration, /NOT end-to-end/);
assert.match(migration, /WhatsApp shadow mode/);

// These preview configuration and notice components must not deliver messages,
// install webhooks, or write into the SalsysOS database. The separately
// authorized health probe may make only a bounded credential-free GET.
for (const [path, source] of [
  ["vendor configuration", config],
  ["operator notice", notice],
]) {
  assert.doesNotMatch(source, /\bfetch\s*\(/, `${path} must not fetch URLs`);
  assert.doesNotMatch(source, /\bPOST\s*\(/, `${path} must not send HTTP requests`);
  assert.doesNotMatch(source, /\.from\s*\(/, `${path} must not access CRM tables`);
}
console.log("[vendor-workspaces] PASS: off-by-default, admin-only, read-only pilot + bounded health probe; legacy features preserved");
