'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');

const page = readFileSync(path.resolve(__dirname,
  '../../app/settings/commercial-preview/page.tsx'), 'utf8');
const proposal = JSON.parse(readFileSync(path.resolve(__dirname,
  '../../docs/commercial/r13-p1-pricing-proposal-v1.json'), 'utf8'));

test('R13-P1 preview route is server-authorized, noindex, and never exposes payment actions', () => {
  assert.match(page, /export const dynamic = 'force-dynamic'/);
  assert.match(page, /robots:\s*\{\s*index:\s*false,\s*follow:\s*false/);
  assert.match(page, /await requireCommercialPlatformReviewPreview\(\)/);
  assert.match(page, /actor\.scope !== 'platform_plan_review'/);
  assert.match(page, /actor\.readonlyOnly !== true/);
  assert.match(page, /actor\.canCharge !== false/);
  assert.match(page, /actor\.canChangeSubscriptions !== false/);
  assert.match(page, /actor\.canActivateCapabilities !== false/);
  assert.match(page, /INTERNAL DESIGN PREVIEW/);
  assert.match(page, /No live plan catalog, approval actions/);
  assert.doesNotMatch(page, /createAdminClient|SUPABASE_SERVICE_ROLE_KEY|service_role|\.rpc\(|fetch\s*\(|axios\.|\.from\s*\(/);
  assert.doesNotMatch(page, /<form\b|<button\b|type=['"]submit['"]|href=['"]\/(?:checkout|subscribe|signup|register|pricing)/i);
});

test('R13-P1 admin preview prices and limit proposals match the independent contract', () => {
  const sorted = ['free','basic','growth','pro'];
  for (const [index, key] of sorted.entries()) {
    const tier = proposal.tiers.find(t => t.code === key);
    assert.ok(tier, key);
    const price = new Intl.NumberFormat('en-IN', {
      style:'currency', currency:'INR', maximumFractionDigits:0
    }).format(tier.monthly_inr);
    assert.ok(page.includes('monthly: \'' + price + '\''), 'Price drift for ' + key);
    assert.ok(page.includes('code: \'' + key + '\''), 'Tier missing: ' + key);
    const displayLimit = new Intl.NumberFormat('en-IN').format(tier.provisional_limits.lead_records);
    assert.ok(page.includes('leadLimit: \'' + displayLimit + '\''), 'Lead limit drift: ' + key);
    assert.ok(page.includes('users: \'' + tier.provisional_limits.named_users + '\''), 'User limit drift: ' + key);
    assert.ok(page.includes(tier.setup_fee_inr.optional ? 'Optional assistance' : 'Managed setup'), 'Setup policy absent');
    assert.equal(proposal.tiers[index].code, key);
  }
  assert.equal(proposal.tiers.filter(t => t.featured).length, 1);
  assert.match(page, /recommended: true/);
});

test('R13-P1 admin preview makes no real plan approval or tenant reads possible', () => {
  assert.match(page, /Not approved · Limits not enforced/);
  assert.match(page, /not inferred from successful synthetic tests/);
  assert.match(page, /The R2 staging hold/);
  assert.doesNotMatch(page, /onClick\s*=|server action|formAction|use server|use client/i);
});
