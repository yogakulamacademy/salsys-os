const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');

const control = readFileSync('components/instagram-echo-verification.tsx', 'utf8');
const audit = readFileSync('lib/message-sync-audit.ts', 'utf8');
const page = readFileSync('app/system-health/message-sync/page.tsx', 'utf8');
const existing = readFileSync('app/api/instagram/history-sync/route.ts', 'utf8');
const subscription = readFileSync('lib/integrations/instagram-history-reconciliation.ts', 'utf8');

test('Meta subscription inspection is only an on-demand read-only action', () => {
  assert.match(control, /mode: 'echo_status', apply: false/);
  assert.match(control, /credentials: 'same-origin'/);
  assert.match(control, /cache: 'no-store'/);
  assert.match(control, /Provider status unavailable/);
  assert.match(control, /A controlled live message test is still required/);
  assert.doesNotMatch(control, /sync\(true\)|apply: true|instagramHistorySyncEnabled|sendInstagramMessage|INSTAGRAM_OUTBOUND_ECHO_ENABLED|INSTAGRAM_HISTORY_SYNC_ENABLED/);
  assert.match(existing, /request\.headers\.get\('origin'\) !== request\.nextUrl\.origin/);
  assert.match(existing, /\['owner', 'admin'\]/);
  assert.match(existing, /\.eq\('organization_id', organizationId\)/);
  assert.match(existing, /body\.mode === 'echo_status'/);
  assert.match(subscription, /\/me\/subscribed_apps/);
  assert.match(subscription, /method: 'GET'/);
});

test('separate subscriptions are evidence, not a provider message delivery claim', () => {
  assert.match(control, /fields\.includes\('message_echoes'\)/);
  assert.match(control, /fields\.includes\('messages'\)/);
  assert.match(control, /payload\.subscribed !== fields\.includes\('message_echoes'\)/);
  assert.match(control, /do not prove signed webhook delivery/);
  assert.match(control, /fields\.length > 40/);
});

test('active workspace ownership checks precede privileged account inventory', () => {
  assert.match(audit, /await session\.auth\.getUser\(\)/);
  assert.match(audit, /\['owner', 'admin'\]\.includes\(active\.role\)/);
  const authorization = audit.indexOf('if (!active ||');
  const client = audit.indexOf('const admin = createAdminClient()');
  const inventory = audit.indexOf(".from('integration_connections')");
  assert.ok(authorization >= 0 && client > authorization && inventory > client);
  assert.match(audit, /\.eq\('organization_id', active\.organizationId\)/);
  assert.match(audit, /\.eq\('provider', 'instagram'\)/);
  assert.match(audit, /\.eq\('status', 'connected'\)/);
  assert.match(audit, /\.select\('id'\)/);
  assert.match(audit, /\.limit\(10\)/);
  assert.match(page, /InstagramEchoVerification connections={instagramConnections}/);
  assert.doesNotMatch(audit, /access_token_ciphertext|external_account_id|token_expires_at/);
});
