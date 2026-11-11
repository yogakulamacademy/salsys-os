'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');

const proposal = JSON.parse(readFileSync(path.resolve(__dirname,
  '../../docs/commercial/r13-p1-pricing-proposal-v1.json'), 'utf8'));

test('R13-P1 commercial proposal is never interpreted as live plans', () => {
  assert.equal(proposal.status, 'PROPOSED_NOT_COMMERCIALLY_APPROVED');
  assert.equal(proposal.policy, 'NON_RUNTIME_DOCUMENTATION_ONLY_DO_NOT_SEED_OR_ENFORCE');
  assert.equal(proposal.auto_billing, false);
  assert.equal(proposal.public_self_serve_enabled, false);
  assert.equal(proposal.account_creation_enabled_by_this_file, false);
  assert.equal(proposal.rules.all_limits_provisional_not_enforced, true);
  assert.equal(proposal.rules.integrations_are_eligibility_only_not_auto_enabled, true);
  assert.equal(proposal.rules.existing_tenant_data_never_deleted_on_downgrade, true);
  assert.equal(proposal.rules.never_change_org_status_from_payment_event, true);
  assert.equal(proposal.rules.no_trial_or_subscription_rows_are_created, true);
  for (const gate of ['r13_p0_independent_approval_and_release','r13_p3_verified_billing','r13_p4_quota_downgrade_and_offboarding']) {
    assert.ok(proposal.approval_gates.includes(gate), gate);
  }
});

test('R13-P1 commercial prices, four-tier order, setup and honest Free offer', () => {
  assert.equal(proposal.currency, 'INR');
  assert.equal(proposal.pricing_unit, 'per_organization_workspace_per_month');
  assert.deepEqual(proposal.tiers.map(t => t.code), ['free','basic','growth','pro']);
  assert.deepEqual(proposal.tiers.map(t => t.monthly_inr), [0,1499,3499,6999]);
  assert.deepEqual(proposal.tiers.map(t => t.setup_fee_inr.minimum), [2999,4999,9999,19999]);
  assert.deepEqual(proposal.tiers.map(t => t.setup_fee_inr.maximum), [4999,7999,14999,34999]);
  assert.equal(proposal.tiers[0].setup_fee_inr.optional,true);
  assert.ok(proposal.tiers.slice(1).every(t => t.setup_fee_inr.optional === false));
  assert.equal(proposal.tiers.filter(t => t.featured).length,1);
  assert.equal(proposal.tiers.find(t => t.code === 'growth').featured,true);
});

test('R13-P1 provisional quotas are increasing; there is no destructive downgrade', () => {
  assert.deepEqual(proposal.tiers.map(t => t.provisional_limits.named_users),[1,2,5,10]);
  assert.deepEqual(proposal.tiers.map(t => t.provisional_limits.lead_records),[250,2000,10000,50000]);
  assert.equal(proposal.rules.existing_tenant_data_never_deleted_on_downgrade, true);
});

test('R13-P1 no plan promises provider access or autonomous messaging', () => {
  for (const tier of proposal.tiers) {
    assert.equal(typeof tier.monthly_inr, 'number');
    assert.ok(tier.setup_fee_inr.minimum <= tier.setup_fee_inr.maximum);
    assert.ok(tier.exclude.includes('automated_customer_messaging') || tier.exclude.includes('autonomous_customer_messaging'));
    assert.ok(Array.isArray(tier.gated_integrations));
    assert.ok(!tier.included.some(feature => /whatsapp_business_connection|google_ads_reporting|meta_ads_reporting|optional_website_behavior|forecasting_only/.test(feature)),
      'provider-gated or predictive feature must not be unconditional: ' + tier.code);
  }
  assert.ok(proposal.tiers.find(t => t.code === 'basic').gated_integrations.some(x => x.includes('whatsapp')));
  assert.ok(proposal.tiers.find(t => t.code === 'pro').gated_integrations.some(x => x.includes('forecasting')));
});

test('R14 founder pilot is a separate, finite contract with no auto renewal', () => {
  const pilot = proposal.managed_pilot;
  assert.equal(pilot.commercial_status,'SEPARATE_PROPOSAL_NOT_APPROVED');
  assert.equal(pilot.duration_days_after_secure_activation,60);
  assert.equal(pilot.one_time_inr,14999);
  assert.equal(pilot.named_users,3);
  assert.equal(pilot.automatic_renewal,false);
  assert.ok(pilot.post_pilot.includes('Previous proposed automatic/standard'));
  assert.ok(pilot.activation_gates.includes('real_tenant_isolation_verified'));
  assert.equal(pilot.payment,'manual_separate_saas_invoice_never_crm_customer_payments');
});
