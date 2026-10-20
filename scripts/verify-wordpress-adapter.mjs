import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

function fail(message) {
  console.error(`\n[wordpress-adapter] FAIL: ${message}`);
  process.exit(1);
}

function read(relativePath) {
  const absolute = path.join(root, relativePath);
  if (!fs.existsSync(absolute)) fail(`Missing required file: ${relativePath}`);
  return fs.readFileSync(absolute, 'utf8');
}

const pluginPath = 'integrations/wordpress/salsys-tracking/salsys-tracking.php';
const readmePath = 'integrations/wordpress/salsys-tracking/README.md';
const sourceRoutePath = 'app/api/tracking/sources/route.ts';

const plugin = read(pluginPath);
const readme = read(readmePath);
const sourceRoute = read(sourceRoutePath);

for (const [needle, label] of [
  ['Plugin Name: Salsys Tracking', 'WordPress plugin header'],
  ['salsys-intelligence.js', 'canonical browser SDK loader'],
  ['salsys-consent.js', 'consent UI loader'],
  ["'data-consent-mode'", 'consent-mode attribute'],
  ["'data-form-mode'", 'lead-only form mode'],
  ['data-salsys-lead-form', 'neutral lead-form marker'],
  ['MutationObserver', 'dynamic form-builder compatibility'],
  ['manage_options', 'WordPress admin capability boundary'],
  ['register_setting', 'WordPress settings registration'],
  ['show_consent_ui', 'single-CMP compatibility'],
  ['lead_form_selectors', 'controlled form selector configuration'],
]) {
  if (!plugin.includes(needle)) fail(`WordPress plugin is missing ${label} (${needle}).`);
}

for (const forbidden of [
  'Authorization: Bearer',
  'X-Website-Secret',
  'SUPABASE_SECRET_KEY',
  'service_role',
  'payment.succeeded',
  'enrollment.confirmed',
]) {
  if (plugin.includes(forbidden)) {
    fail(`WordPress browser adapter must not contain trusted credential/authority token ${forbidden}.`);
  }
}

for (const [needle, label] of [
  ["['website', 'client', 'api', 'webhook', 'system']", 'website source provisioning'],
  ["const isWebsite = sourceType === 'website'", 'website source branch'],
  ["const authMode = isWebsite ? 'origin'", 'origin-bound website auth'],
  ["allowedEventPrefixes = ['web.']", 'web-only website event prefix'],
  ['normalizeHostname', 'hostname normalization'],
  ['privacy notice version', 'website privacy notice requirement'],
  ["credential_class: isWebsite", 'website source provenance'],
  ["origin_bound: true", 'origin-bound credential response'],
]) {
  if (!sourceRoute.includes(needle)) fail(`Tracking source API is missing ${label} (${needle}).`);
}

for (const token of [
  'WordPress',
  'Website',
  'auth mode `origin`',
  '`web.`',
  'data-salsys-lead-form',
  'Elementor Forms',
  'Contact Form 7',
  'WPForms',
  'Gravity Forms',
  'Fluent Forms',
  'exact-session identify path',
]) {
  if (!readme.includes(token)) fail(`WordPress adapter README is missing ${token}.`);
}

if (!plugin.includes("consent_mode' => 'required'")) {
  fail('WordPress adapter must default to required analytics consent.');
}
if (!plugin.includes("'formMode' => 'lead-only'")) {
  fail('WordPress adapter must default to lead-only form tracking.');
}
if (!plugin.includes('if (window.__SalsysWordPressV1) return;')) {
  fail('WordPress adapter must guard against duplicate bootstrap execution.');
}
if (!plugin.includes('hasScript(src)')) {
  fail('WordPress adapter must guard against duplicate Salsys script URLs.');
}

console.log('[wordpress-adapter] PASS: WordPress adapter and origin-bound website provisioning verified.');
