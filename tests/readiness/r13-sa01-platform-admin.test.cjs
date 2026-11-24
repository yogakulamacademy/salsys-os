const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (name) => fs.readFileSync(path.join(__dirname, '../..', name), 'utf8');

test('platform overview is disabled by default and guarded before rendering', () => {
  const source = read('app/platform-admin/page.tsx');
  const flag = source.indexOf("if (process.env.SALSYS_PLATFORM_ADMIN_ENABLED !== 'true') notFound()");
  const authorization = source.indexOf('await readPlanReviewState()');
  const denial = source.indexOf('if (!state) notFound()');
  const readiness = source.indexOf('await loadManualLaunchReadiness()');
  const render = source.indexOf('return (');
  assert.ok(flag >= 0 && authorization > flag && denial > authorization && readiness > denial && render > readiness);
  assert.match(source, /dynamic = 'force-dynamic'/);
  assert.match(source, /index: false/);
  assert.match(read('.env.example'), /^SALSYS_PLATFORM_ADMIN_ENABLED=false$/m);
});

test('overview does not independently query customer records or perform mutations', () => {
  const source = read('app/platform-admin/page.tsx');
  assert.doesNotMatch(source, /createAdminClient|\.rpc\(|\.from\(|<form|use server|dangerouslySetInnerHTML/);
  assert.match(source, /readiness \? readiness\.pilot_used/);
  assert.match(source, /'Unavailable'/);
});

test('dedicated shell applies only to the exact overview route', () => {
  const shell = read('components/root-shell.tsx');
  assert.match(shell, /pathname === '\/platform-admin'/);
  assert.doesNotMatch(shell, /pathname\.startsWith\('\/platform-admin/);
  assert.match(shell, /<ProductCapabilityNavigationGate>/);
  assert.match(shell, /<AppShell>/);
});
