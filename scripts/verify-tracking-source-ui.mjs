import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

function fail(message) {
  console.error(`\n[tracking-source-ui] FAIL: ${message}`);
  process.exit(1);
}

function read(relativePath) {
  const absolute = path.join(root, relativePath);
  if (!fs.existsSync(absolute)) fail(`Missing required file: ${relativePath}`);
  return fs.readFileSync(absolute, 'utf8');
}

const page = read('app/tracking/sources/page.tsx');
const creator = read('components/tracking-source-creator.tsx');
const data = read('lib/tracking-platform-data.ts');
const sourceApi = read('app/api/tracking/sources/route.ts');

for (const platform of ['custom_web', 'wordpress', 'webflow', 'framer', 'shopify', 'android', 'ios']) {
  if (!page.includes(`key: '${platform}'`) && !creator.includes(`value: '${platform}'`)) {
    fail(`Tracking source UI is missing ${platform}.`);
  }
}

for (const needle of [
  'v_tracking_client_source_health_v1',
  "getWorkspaceContextForUser",
  "createAdminClient",
  ".eq('organization_id', workspace.organizationId)",
]) {
  if (!data.includes(needle)) fail(`Tracking platform data boundary is missing ${needle}.`);
}

for (const needle of [
  "fetch('/api/tracking/sources'",
  'privacyNoticeVersion',
  'Create ${selected.label} source',
  'publishable source key',
  'server secret',
]) {
  if (!creator.includes(needle)) fail(`Tracking source creator is missing ${needle}.`);
}

if (creator.includes('organizationId') || creator.includes('organization_id')) {
  fail('Tracking source creator must not send a client-selected organization identifier.');
}

for (const needle of [
  "const CLIENT_PLATFORMS = new Set(['android', 'ios', 'shopify', 'web'])",
  "const WEBSITE_PLATFORMS = new Set([",
  "authMode = isWebsite ? 'origin' : isPublishableClient ? 'publishable' : 'secret'",
  'privacyNoticeVersion',
  "secret: null",
]) {
  if (!sourceApi.includes(needle)) fail(`Tracking source API compatibility contract is missing ${needle}.`);
}

console.log('[tracking-source-ui] PASS: universal tracking source management UI contract verified.');
