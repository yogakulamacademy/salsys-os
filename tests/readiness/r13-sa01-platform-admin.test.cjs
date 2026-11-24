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

test('dedicated shell applies only to exact approved platform routes', () => {
  const shell = read('components/root-shell.tsx');
  assert.match(shell, /pathname === '\/platform-admin'/);
  assert.doesNotMatch(shell, /pathname\.startsWith\('\/platform-admin/);
  assert.match(shell, /<ProductCapabilityNavigationGate>/);
  assert.match(shell, /<AppShell>/);
});

test('commercial pages share the frame only after their existing access checks', () => {
  const plans = read('app/settings/commercial-plans/page.tsx');
  const pilot = read('app/settings/commercial-plans/pilot/page.tsx');
  for (const [source, guard, section] of [[plans, 'await readPlanReviewState()', 'plans'], [pilot, 'await loadManualPilot()', 'pilot']]) {
    assert.ok(source.indexOf(guard) >= 0 && source.indexOf(guard) < source.indexOf('<PlatformAdminFrame section="' + section + '">'));
    assert.match(source, /catch\s*\{\s*notFound\(\)/);
  }
  const root = read('components/root-shell.tsx');
  assert.match(root, /platformAdminEnabled &&/);
  assert.match(root, /pathname === '\/settings\/commercial-plans'/);
  assert.match(root, /pathname === '\/settings\/commercial-plans\/pilot'/);
  assert.match(read('app/layout.tsx'), /platformAdminEnabled=\{process\.env\.SALSYS_PLATFORM_ADMIN_ENABLED === 'true'\}/);
  assert.match(read('components/platform-admin-frame.tsx'), /if \(process\.env\.SALSYS_PLATFORM_ADMIN_ENABLED !== 'true'\) return/);
});

test('workspace settings switch is backed by commercial authorization, not only tenant name', () => {
  const source = read('app/settings/overview/page.tsx');
  assert.match(source, /const platformOverview = platformAdmin && process\.env\.SALSYS_PLATFORM_ADMIN_ENABLED === 'true'\s*&& Boolean\(await readPlanReviewState\(\)\.catch\(\(\) => null\)\)/);
  assert.match(source, /\{platformOverview \? <Link href="\/platform-admin"/);
});
