const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./helpers.cjs');

test('subscription reporting fails closed and returns only scoped exact recorded counts', async () => {
  const previous = process.env.SALSYS_PLATFORM_ADMIN_ENABLED;
  const platformId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  let denied = false, adminCalls = 0, guardCalls = 0, failure = false, inconsistent = false;
  const queries = [];
  const module = load('lib/platform-subscription-summary.ts', {
    'server-only': {},
    '@/lib/platform-admin-access': {
      requirePlatformAdminAccess: async () => {
        guardCalls++;
        if (denied) throw new Error('Access denied');
        return { activeWorkspace: { organizationId: platformId } };
      },
    },
    '@/lib/supabase/admin': {
      createAdminClient: () => {
        adminCalls++;
        return { from(table) {
          assert.equal(table, 'saas_organization_subscriptions');
          const filters = [];
          const q = {
            select(columns, options) {
              assert.equal(columns, 'id');
              assert.deepEqual(options, { count: 'exact', head: true });
              return q;
            },
            neq(column, value) {
              assert.equal(column, 'organization_id');
              assert.equal(value, platformId);
              filters.push(['neq', column, value]); return q;
            },
            eq(column, value) {
              assert.equal(column, 'status');
              filters.push(['eq', column, value]); return q;
            },
            lte(column, value) {
              assert.ok(['trial_ends_at', 'current_period_ends_at'].includes(column));
              assert.ok(Number.isFinite(Date.parse(value)));
              filters.push(['lte', column, value]); return q;
            },
            then(resolve) {
              queries.push(filters);
              const state = filters.find(f => f[0] === 'eq')?.[2];
              const deadline = filters.some(f => f[0] === 'lte');
              const counts = { trialing: 2, active: 3, past_due: 1, canceled: 1, expired: 1 };
              const count = deadline ? 1 : state ? counts[state] : inconsistent ? 9 : 8;
              resolve({ count: failure ? null : count, error: failure ? { message: 'failed' } : null });
            },
          };
          return q;
        }};
      },
    },
  });
  try {
    process.env.SALSYS_PLATFORM_ADMIN_ENABLED = 'false';
    await assert.rejects(module.loadPlatformSubscriptionSummary(), /unavailable/);
    assert.equal(guardCalls, 0);
    assert.equal(adminCalls, 0);
    process.env.SALSYS_PLATFORM_ADMIN_ENABLED = 'true';
    denied = true;
    await assert.rejects(module.loadPlatformSubscriptionSummary(), /Access denied/);
    assert.equal(adminCalls, 0);
    denied = false;
    const summary = await module.loadPlatformSubscriptionSummary();
    assert.deepEqual(summary.recorded, { trialing: 2, active: 3, past_due: 1, canceled: 1, expired: 1 });
    assert.equal(summary.total, 8);
    assert.equal(summary.trialDeadlinePassed, 1);
    assert.equal(summary.activePeriodEnded, 1);
    assert.equal(queries.length, 8);
    assert.ok(queries.every(q => q.some(f => f[0] === 'neq')));
    assert.ok(queries.filter(q => q.some(f => f[0] === 'lte')).every(q => q.find(f => f[0] === 'lte')[2] === summary.observedAt));
    failure = true;
    await assert.rejects(module.loadPlatformSubscriptionSummary(), /unavailable/);
    failure = false;
    inconsistent = true;
    await assert.rejects(module.loadPlatformSubscriptionSummary(), /inconsistent/);
  } finally {
    if (previous === undefined) delete process.env.SALSYS_PLATFORM_ADMIN_ENABLED;
    else process.env.SALSYS_PLATFORM_ADMIN_ENABLED = previous;
  }
});
