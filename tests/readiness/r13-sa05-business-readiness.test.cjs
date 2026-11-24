const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./helpers.cjs');
const { readFileSync } = require('node:fs');

test('business readiness verifies internal session scope before any provider inventory query', async () => {
  const previous = process.env.SALSYS_PLATFORM_ADMIN_ENABLED;
  const platformId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  let guardDenied = false, access = { organizationId: platformId, role: 'admin', workspaceCodes: ['sales', 'marketing'] };
  let calls = 0, data = [{ provider: 'instagram', status: 'connected' }, { provider: 'whatsapp', status: 'revoked' }], count = 2, error = null;
  const mod = load('lib/platform-business-readiness.ts', {
    'server-only': {},
    '@/lib/platform-admin-access': { requirePlatformAdminAccess: async () => {
      if (guardDenied) throw Error('Access denied');
      return { activeWorkspace: { organizationId: platformId } };
    }},
    '@/lib/workspace-access': { getCurrentWorkspaceAccess: async () => access },
    '@/lib/supabase/admin': { createAdminClient: () => {
      calls++;
      return { from(table) {
        assert.equal(table, 'integration_connections');
        const query = {
          select(fields, opts) { assert.equal(fields, 'provider,status'); assert.deepEqual(opts, { count: 'exact' }); return query; },
          eq(field, value) { assert.equal(field, 'organization_id'); assert.equal(value, platformId); return query; },
          in(field, values) { assert.equal(field, 'provider'); assert.deepEqual(values, ['google','meta','instagram','whatsapp']); return query; },
          async limit(n) { assert.equal(n, 100); return { data, count, error }; },
        };
        return query;
      }};
    }},
  });
  try {
    process.env.SALSYS_PLATFORM_ADMIN_ENABLED = 'false';
    await assert.rejects(mod.loadPlatformBusinessReadiness(), /unavailable/);
    process.env.SALSYS_PLATFORM_ADMIN_ENABLED = 'true';
    guardDenied = true;
    await assert.rejects(mod.loadPlatformBusinessReadiness(), /Access denied/);
    guardDenied = false;
    const valid = access;
    access = { ...valid, organizationId: 'different-tenant' };
    await assert.rejects(mod.loadPlatformBusinessReadiness(), /unavailable/);
    access = { ...valid, role: 'employee' };
    await assert.rejects(mod.loadPlatformBusinessReadiness(), /unavailable/);
    access = null;
    await assert.rejects(mod.loadPlatformBusinessReadiness(), /unavailable/);
    assert.equal(calls, 0);
    access = valid;
    assert.deepEqual(await mod.loadPlatformBusinessReadiness(), {
      workspaceCodes: ['sales','marketing'],
      connections: { google: [], meta: [], instagram: ['connected'], whatsapp: ['revoked'] },
    });
    count = 3;
    assert.equal((await mod.loadPlatformBusinessReadiness()).connections, null);
    count = 2;
    error = { message: 'unavailable' };
    assert.equal((await mod.loadPlatformBusinessReadiness()).connections, null);
    error = null;
    data = [{ provider: 'instagram', status: 'unknown' }, { provider: 'whatsapp', status: 'revoked' }];
    assert.equal((await mod.loadPlatformBusinessReadiness()).connections, null);
  } finally {
    if (previous === undefined) delete process.env.SALSYS_PLATFORM_ADMIN_ENABLED;
    else process.env.SALSYS_PLATFORM_ADMIN_ENABLED = previous;
  }
});

test('business page guards before loading and hides nonpermitted workspace links', () => {
  const source = readFileSync('app/platform-admin/business/page.tsx', 'utf8');
  assert.ok(source.indexOf('await readPlanReviewState()') < source.indexOf('await loadPlatformBusinessReadiness()'));
  assert.match(source, /readiness\.workspaceCodes\.includes\(workspace\.code\)/);
  assert.match(source, /\{permitted &&/);
  assert.match(source, /Stored connection status only/);
  assert.doesNotMatch(source, /createAdminClient|\.rpc\(|\.from\(|<form/);
});
