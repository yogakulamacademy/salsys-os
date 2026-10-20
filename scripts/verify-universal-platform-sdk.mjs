import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

function fail(message) {
  console.error(`\n[universal-platform-sdk] FAIL: ${message}`);
  process.exit(1);
}

function read(relativePath) {
  const absolute = path.join(root, relativePath);
  if (!fs.existsSync(absolute)) fail(`Missing required file: ${relativePath}`);
  return fs.readFileSync(absolute, 'utf8');
}

const requiredFiles = [
  'lib/tracking/publishable-client.ts',
  'app/api/events/client/v1/route.ts',
  'app/api/privacy/consent/client/v1/route.ts',
  'sdk/android/settings.gradle.kts',
  'sdk/android/build.gradle.kts',
  'sdk/android/src/main/AndroidManifest.xml',
  'sdk/android/src/main/java/com/salsys/sdk/Salsys.kt',
  'sdk/ios/Package.swift',
  'sdk/ios/Sources/Salsys/Salsys.swift',
  'docs/universal-platform-sdk-v1.md',
  'supabase/migrations/20261020123000_universal_publishable_client_v1.sql',
];

for (const file of requiredFiles) read(file);

const migration = read('supabase/migrations/20261020123000_universal_publishable_client_v1.sql');
for (const [needle, label] of [
  ["'client'::text", 'client source type'],
  ["'publishable'::text", 'publishable auth mode'],
  ["'app'", 'app event family'],
  ["'app.session_started'", 'app session event contract'],
  ["'app.screen_viewed'", 'app screen event contract'],
  ["like 'app.%' then 'analytics'", 'app privacy-purpose mapping'],
]) {
  if (!migration.includes(needle)) fail(`Migration is missing ${label} (${needle}).`);
}

const runtime = read('lib/tracking/publishable-client.ts');
for (const [needle, label] of [
  ['resolvePublishableClientSource', 'publishable source resolver'],
  [".eq('auth_mode', 'publishable')", 'publishable auth boundary'],
  ['publishableClientEventAllowed', 'client event allowlist'],
  ["normalized.startsWith('app.')", 'app telemetry boundary'],
  ["normalized.startsWith('web.')", 'web telemetry boundary'],
  ['PUBLIC_CLIENT_PII_KEYS', 'PII redaction boundary'],
]) {
  if (!runtime.includes(needle)) fail(`Publishable client runtime is missing ${label} (${needle}).`);
}

for (const forbiddenAuthority of ['payment.', 'enrollment.', 'booking.', 'lead.', 'message.', 'conversation.']) {
  if (runtime.includes(`normalized.startsWith('${forbiddenAuthority}')`)) {
    fail(`Publishable client runtime must not allow authoritative ${forbiddenAuthority} events.`);
  }
}

const eventRoute = read('app/api/events/client/v1/route.ts');
for (const [needle, label] of [
  ['privacy_gate_tracking_event_v1', 'privacy gate before persistence'],
  ['sanitizePublishableClientTrackingEvent', 'publishable-client PII sanitizer'],
  ['publishableClientEventAllowed', 'event allowlist enforcement'],
  ['ingest_tracking_event_v1', 'canonical event ingestion'],
  ["authority: 'non_authoritative_client_telemetry'", 'non-authoritative provenance'],
  ["metadata.sdk.name and metadata.sdk.version are required", 'SDK identity requirement'],
]) {
  if (!eventRoute.includes(needle)) fail(`Client event route is missing ${label} (${needle}).`);
}

const consentRoute = read('app/api/privacy/consent/client/v1/route.ts');
for (const purpose of ['analytics', 'marketing', 'advertising', 'sale_sharing', 'personalization']) {
  if (!consentRoute.includes(`'${purpose}'`)) fail(`Client consent route must support ${purpose}.`);
}
for (const needle of ['record_privacy_preference_v1', 'privacyNoticeVersion', 'x-salsys-source-key']) {
  if (!consentRoute.toLowerCase().includes(needle.toLowerCase())) {
    fail(`Client consent route is missing ${needle}.`);
  }
}

const sourceRoute = read('app/api/tracking/sources/route.ts');
for (const [needle, label] of [
  ["['website', 'client', 'api', 'webhook', 'system']", 'website/client/server source provisioning'],
  ["isPublishableClient ? 'publishable' : 'secret'", 'publishable/server credential split'],
  ["secret: null", 'no secret returned for publishable clients'],
  ['privacyNoticeVersion', 'privacy notice requirement'],
]) {
  if (!sourceRoute.includes(needle)) fail(`Tracking source API is missing ${label} (${needle}).`);
}

if (!sourceRoute.includes("const authMode = isWebsite ? 'origin'")) {
  fail('Tracking source API must preserve the origin-bound website auth path.');
}

const androidBuild = read('sdk/android/build.gradle.kts');
for (const needle of ['com.android.library', 'org.jetbrains.kotlin.android', 'namespace = "com.salsys.sdk"']) {
  if (!androidBuild.includes(needle)) fail(`Android packaging is missing ${needle}.`);
}

const androidManifest = read('sdk/android/src/main/AndroidManifest.xml');
if (!androidManifest.includes('android.permission.INTERNET')) {
  fail('Android SDK manifest must declare INTERNET permission.');
}

const android = read('sdk/android/src/main/java/com/salsys/sdk/Salsys.kt');
for (const needle of [
  'salsys-android',
  '/api/events/client/v1',
  '/api/privacy/consent/client/v1',
  'X-Salsys-Source-Key',
  'Android publishable SDK accepts app.* telemetry only',
  'KEY_QUEUE',
]) {
  if (!android.includes(needle)) fail(`Android SDK is missing ${needle}.`);
}
if (android.includes('Authorization: Bearer') || android.includes('Bearer ')) {
  fail('Android SDK must not embed bearer/server credentials.');
}

const swiftPackage = read('sdk/ios/Package.swift');
for (const needle of ['name: "Salsys"', '.iOS(.v15)', 'Sources/Salsys']) {
  if (!swiftPackage.includes(needle)) fail(`Swift Package is missing ${needle}.`);
}

const ios = read('sdk/ios/Sources/Salsys/Salsys.swift');
for (const needle of [
  'salsys-ios',
  '/api/events/client/v1',
  '/api/privacy/consent/client/v1',
  'X-Salsys-Source-Key',
  'iOS publishable SDK accepts app.* telemetry only',
  'eventQueueKey',
  'JSONSerialization.isValidJSONObject',
]) {
  if (!ios.includes(needle)) fail(`iOS SDK is missing ${needle}.`);
}
if (ios.includes('Authorization: Bearer') || ios.includes('Bearer ')) {
  fail('iOS SDK must not embed bearer/server credentials.');
}

const middleware = read('middleware.ts');
for (const publicPath of ['/api/events/client/v1', '/api/privacy/consent/client/v1']) {
  if (!middleware.includes(`"${publicPath}"`)) fail(`Middleware must expose ${publicPath}.`);
}

console.log('[universal-platform-sdk] PASS: publishable cross-platform SDK boundary verified.');
