import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

const helperPath = path.join(
  root,
  'lib/security/bounded-json-body.ts',
);

const routes = [
  ['GA4', 'app/api/analytics/ga4/sync/route.ts'],
  ['GSC', 'app/api/analytics/gsc/sync/route.ts'],
  ['Google Ads', 'app/api/analytics/google-ads/sync/route.ts'],
  ['Meta Ads', 'app/api/analytics/meta-ads/sync/route.ts'],
];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function fail(message) {
  throw new Error(`Analytics sync body-limit verification failed: ${message}`);
}

const helper = fs.readFileSync(helperPath, 'utf8');

for (const required of [
  'request.body.getReader()',
  "error: 'Payload too large.'",
  'status: 413',
  "error: 'Invalid JSON payload.'",
  'status: 400',
]) {
  if (!helper.includes(required)) {
    fail(`bounded JSON helper is missing ${required}`);
  }
}

for (const [label, relativePath] of routes) {
  const source = read(relativePath);

  if (!source.includes("@/lib/security/bounded-json-body")) {
    fail(`${label} route does not import the bounded JSON helper`);
  }

  if (!source.includes('ANALYTICS_SYNC_BODY_MAX_BYTES')) {
    fail(`${label} route is missing its explicit analytics body ceiling`);
  }

  if (!source.includes('16 * 1024')) {
    fail(`${label} route is not pinned to the 16 KB body ceiling`);
  }

  if (source.includes('request.json()')) {
    fail(`${label} route still fully buffers request.json()`);
  }

  const postIndex = source.indexOf('export async function POST');
  if (postIndex < 0) {
    fail(`${label} route is missing POST`);
  }

  const post = source.slice(postIndex);
  const authIndex = post.indexOf('isAuthorized(');
  const bodyIndex = post.indexOf('readBoundedJson');

  if (authIndex < 0 || bodyIndex < 0) {
    fail(`${label} POST is missing authorization or bounded body parsing`);
  }

  if (authIndex > bodyIndex) {
    fail(`${label} POST reads the body before authorization`);
  }
}

console.log('Analytics sync body-limit contracts verified.');
