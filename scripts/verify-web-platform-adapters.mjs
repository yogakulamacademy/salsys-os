import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';

const root = process.cwd();

function fail(message) {
  console.error(`\n[web-platform-adapters] FAIL: ${message}`);
  process.exit(1);
}

function read(relativePath) {
  const absolute = path.join(root, relativePath);
  if (!fs.existsSync(absolute)) fail(`Missing required file: ${relativePath}`);
  return fs.readFileSync(absolute, 'utf8');
}

const customPixelPath = 'integrations/shopify/salsys-custom-pixel.js';
const appPixelPath = 'integrations/shopify/web-pixel-extension/src/index.js';
const extensionConfigPath = 'integrations/shopify/web-pixel-extension/shopify.extension.toml.example';
const installGuidePath = 'docs/web-platform-installation-v1.md';
const healthMigrationPath = 'supabase/migrations/20261020124500_tracking_client_source_health_v1.sql';

const customPixel = read(customPixelPath);
const appPixel = read(appPixelPath);
const extensionConfig = read(extensionConfigPath);
const guide = read(installGuidePath);
const healthMigration = read(healthMigrationPath);

for (const token of [
  'WordPress',
  'Webflow',
  'Framer',
  'Shopify',
  'Custom-coded websites',
  'data-salsys-lead-form',
  'salsys-intelligence.js',
  'salsys-consent.js',
]) {
  if (!guide.includes(token)) fail(`Installation guide is missing ${token}.`);
}

for (const token of [
  "checkout_completed: 'web.checkout_completed_observed'",
  "payment_info_submitted: 'web.payment_info_submitted'",
  '/api/events/client/v1',
  '/api/privacy/consent/client/v1',
  'X-Salsys-Source-Key',
  'analyticsProcessingAllowed',
  "visitorConsentCollected",
  'browser.sessionStorage',
  "authority: 'non_authoritative_storefront_telemetry'",
]) {
  if (!customPixel.includes(token)) fail(`Shopify custom pixel is missing ${token}.`);
}

for (const forbidden of [
  'payment.succeeded',
  'payment.refunded',
  'enrollment.confirmed',
  'Authorization: Bearer',
]) {
  if (customPixel.includes(forbidden) || appPixel.includes(forbidden)) {
    fail(`Shopify client adapters must not contain authoritative client event/credential ${forbidden}.`);
  }
}

for (const token of [
  "import {register} from '@shopify/web-pixels-extension'",
  'settings.sourceKey',
  'customerPrivacy.subscribe',
  'analytics.subscribe',
  'shopify_app_pixel',
]) {
  if (!appPixel.includes(token)) fail(`Shopify app pixel adapter is missing ${token}.`);
}

for (const token of [
  'type = "web_pixel_extension"',
  'runtime_context = "strict"',
  'analytics = true',
  'marketing = false',
  'sale_of_data = "disabled"',
  '[settings.fields.sourceKey]',
]) {
  if (!extensionConfig.includes(token)) fail(`Shopify extension config is missing ${token}.`);
}

for (const token of [
  'v_tracking_client_source_health_v1',
  "s.source_type = 'client'",
  "s.auth_mode = 'publishable'",
  'latest_sdk_name',
  'privacy_receipts_7d',
  'dead_letters_7d',
  "then 'healthy'",
  'to service_role',
]) {
  if (!healthMigration.includes(token)) fail(`Client source health migration is missing ${token}.`);
}

// Execute the custom-pixel adapter in a minimal Shopify-like sandbox. This proves
// the consent receipt is bound to the same anonymous visitor used by the event
// before the optional event is sent.
const subscriptions = new Map();
let privacyCallback = null;
const requests = [];
const sessionStorage = new Map();

const executablePixel = customPixel.replace(
  "'REPLACE_WITH_PUBLISHABLE_SOURCE_KEY'",
  "'src_test_publishable'",
);

const sandbox = {
  init: {
    customerPrivacy: {
      analyticsProcessingAllowed: true,
      marketingAllowed: false,
      preferencesProcessingAllowed: false,
      saleOfDataAllowed: false,
    },
  },
  analytics: {
    subscribe(name, callback) {
      subscriptions.set(name, callback);
    },
  },
  customerPrivacy: {
    subscribe(name, callback) {
      if (name === 'visitorConsentCollected') privacyCallback = callback;
    },
  },
  browser: {
    sessionStorage: {
      async getItem(key) {
        return sessionStorage.get(key) ?? null;
      },
      async setItem(key, value) {
        sessionStorage.set(key, value);
      },
    },
  },
  fetch: async (url, options) => {
    requests.push({ url: String(url), options });
    return { ok: true, status: 200 };
  },
  URL,
  Date,
  Math,
  JSON,
  Number,
  Object,
  console,
};

vm.runInNewContext(executablePixel, sandbox, { filename: customPixelPath });

if (typeof privacyCallback !== 'function') fail('Shopify adapter did not subscribe to privacy changes.');
if (!subscriptions.has('page_viewed')) fail('Shopify adapter did not subscribe to page_viewed.');
if (!subscriptions.has('checkout_completed')) fail('Shopify adapter did not subscribe to checkout_completed.');

await subscriptions.get('page_viewed')({
  id: 'evt-001',
  name: 'page_viewed',
  seq: 1,
  timestamp: '2026-10-20T07:00:00.000Z',
  clientId: 'client-001',
  context: {
    document: {
      title: 'Demo Store',
      referrer: 'https://www.google.com/',
      location: {
        href: 'https://shop.example/products/demo?utm_source=google&utm_medium=cpc&gclid=test-gclid',
      },
    },
  },
  data: {},
});

await new Promise((resolve) => setTimeout(resolve, 0));

if (requests.length !== 2) {
  fail(`Expected consent + event request for first Shopify event, got ${requests.length}.`);
}

const consentRequest = requests.find((request) => request.url.endsWith('/api/privacy/consent/client/v1'));
const eventRequest = requests.find((request) => request.url.endsWith('/api/events/client/v1'));
if (!consentRequest || !eventRequest) fail('Shopify adapter did not send both consent and event requests.');

const consentBody = JSON.parse(consentRequest.options.body);
const eventBody = JSON.parse(eventRequest.options.body);

if (consentBody.visitor_id !== 'shopify_client-001') {
  fail(`Consent receipt used unexpected visitor ID ${consentBody.visitor_id}.`);
}
if (eventBody.anonymous_visitor_id !== consentBody.visitor_id) {
  fail('Shopify event visitor ID must exactly match the consent-receipt visitor ID.');
}
if (eventBody.event_name !== 'web.page_viewed') {
  fail(`Shopify page_viewed mapped to ${eventBody.event_name}.`);
}
if (eventBody.properties?.sessionTouch?.gclid !== 'test-gclid') {
  fail('Shopify adapter did not preserve allowed attribution click IDs.');
}
if (eventBody.metadata?.authority !== 'non_authoritative_storefront_telemetry') {
  fail('Shopify adapter did not mark storefront telemetry as non-authoritative.');
}

console.log('[web-platform-adapters] PASS: web platform installation and Shopify adapter contracts verified.');
