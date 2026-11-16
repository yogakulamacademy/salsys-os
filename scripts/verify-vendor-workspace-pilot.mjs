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
assert.match(notice, /if \(!preview\.previewEnabled\) return null/);
assert.match(notice, /rel="noopener noreferrer"/);
assert.match(notice, /not yet connected/);
assert.match(seo, /workspace\.role === "owner" \|\| workspace\.role === "admin"/);
assert.match(whatsapp, /workspace\.role === "owner" \|\| workspace\.role === "admin"/);
assert.match(seo, /\{children\}/);
assert.match(whatsapp, /\{children\}/);
assert.match(oldSeo, /getSeoWorkspace/);
assert.match(oldWhatsApp, /getWhatsAppSenderReadiness/);
assert.match(sender, /executePreparedWhatsAppProviderSend/);
assert.match(migration, /NOT end-to-end/);
assert.match(migration, /WhatsApp shadow mode/);

// These preview components must not deliver messages, fetch external vendor
// servers, install webhooks, or write into the SalsysOS database.
for (const [path, source] of [
  ["vendor configuration", config],
  ["operator notice", notice],
]) {
  assert.doesNotMatch(source, /\bfetch\s*\(/, `${path} must not fetch URLs`);
  assert.doesNotMatch(source, /\bPOST\s*\(/, `${path} must not send HTTP requests`);
  assert.doesNotMatch(source, /\.from\s*\(/, `${path} must not access CRM tables`);
}
console.log("[vendor-workspaces] PASS: off-by-default, admin-only, link-only pilot; legacy features preserved");
