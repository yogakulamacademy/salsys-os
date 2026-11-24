const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./helpers.cjs');

const ORG = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

test('commercial provider guard requires explicit eligibility for every combined OAuth product', async () => {
  const saved = {
    SALSYS_COMMERCIAL_ACCESS_ENABLED: process.env.SALSYS_COMMERCIAL_ACCESS_ENABLED,
    SALSYS_PUBLIC_SIGNUP_ENABLED: process.env.SALSYS_PUBLIC_SIGNUP_ENABLED,
  };
  let calls = [];
  let allowed = new Set(['ga4', 'gsc', 'google_ads', 'instagram', 'whatsapp', 'meta_ads']);
  let fault = false;
  const guard = load('lib/commercial/integration-access.ts', {
    'server-only': {},
    '@/lib/supabase/admin': { createAdminClient: () => ({
      rpc: async (name, args) => {
        assert.equal(name, 'signup_integration_allowed_v1');
        assert.equal(args.p_organization_id, ORG);
        calls.push(args.p_code);
        return fault ? { data: true, error: { message: 'synthetic failure' } } :
          { data: allowed.has(args.p_code), error: null };
      },
    }) },
  });
  try {
    process.env.SALSYS_COMMERCIAL_ACCESS_ENABLED = 'true';
    process.env.SALSYS_PUBLIC_SIGNUP_ENABLED = 'false';
    await guard.requireCommercialConnection(ORG, 'google');
    assert.deepEqual(calls, ['ga4', 'gsc', 'google_ads']);
    calls = [];
    allowed.delete('gsc');
    await assert.rejects(guard.requireCommercialConnection(ORG, 'google'), /not available/);
    assert.deepEqual(calls, ['ga4', 'gsc']);
    calls = [];
    await guard.requireCommercialConnection(ORG, 'meta');
    await guard.requireCommercialConnection(ORG, 'instagram');
    await guard.requireCommercialConnection(ORG, 'whatsapp');
    assert.deepEqual(calls, ['meta_ads', 'instagram', 'whatsapp']);
    fault = true;
    await assert.rejects(guard.requireCommercialConnection(ORG, 'instagram'), /not available/);
    // Pausing signup must not bypass commercial restrictions.
    fault = false;
    allowed.delete('instagram');
    await assert.rejects(guard.requireCommercialConnection(ORG, 'instagram'), /not available/);
    process.env.SALSYS_COMMERCIAL_ACCESS_ENABLED = 'false';
    process.env.SALSYS_PUBLIC_SIGNUP_ENABLED = 'true';
    calls = [];
    await assert.rejects(guard.requireCommercialConnection(ORG, 'whatsapp'), /authorization unavailable/);
    assert.deepEqual(calls, []);
    process.env.SALSYS_PUBLIC_SIGNUP_ENABLED = 'false';
    await guard.requireCommercialConnection(ORG, 'whatsapp');
    assert.deepEqual(calls, []);
  } finally {
    for (const [key,value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
