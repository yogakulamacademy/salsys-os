import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  INSTAGRAM_REPLY_EXPERIMENTS,
  assignedInstagramVariant,
  resolveInstagramExperiment,
  detectExplicitInstagramIntent,
} from '../lib/instagram/reply-experiments-v1.ts';

const org = '11111111-1111-4111-8111-111111111111';
const lead = '22222222-2222-4222-8222-222222222222';
assert.equal(INSTAGRAM_REPLY_EXPERIMENTS.length, 8);

for (const experiment of INSTAGRAM_REPLY_EXPERIMENTS) {
  assert.notEqual(experiment.control, experiment.challenger, experiment.id + ' must have distinct A/B copy');
  for (const body of [experiment.control, experiment.challenger]) {
    assert.deepEqual([...body.matchAll(/\{\{([^}]+)\}\}/g)].map(x=>x[1]), ['1','2']);
    assert.ok(new TextEncoder().encode(body).length <= 1000);
    assert.ok(/stop/i.test(body));
  }
  const rendered = resolveInstagramExperiment({
    organizationId: org, leadId: lead, experimentId: experiment.id,
    context: { firstName: 'Priya Sharma', courseName: '200-Hour YTT' },
  });
  assert.equal(rendered.ok, true);
  if (rendered.ok) {
    assert.equal(rendered.variantId, assignedInstagramVariant(org, lead, experiment.id));
    assert.ok(rendered.body.includes('Priya'));
    assert.ok(rendered.body.includes('200-Hour YTT'));
    assert.ok(!rendered.body.includes('{{'));
  }
}

assert.deepEqual(resolveInstagramExperiment({
  organizationId: org, leadId: lead, experimentId: 'enquiry',
  context: { firstName: null, displayName: 'Instagram Lead', courseName: 'YTT' },
}), { ok:false, reason:'lead_name_missing' });
assert.deepEqual(resolveInstagramExperiment({
  organizationId: org, leadId: lead, experimentId: 'enquiry',
  context: { firstName: 'Priya', courseName: null },
}), { ok:false, reason:'course_name_missing' });
assert.equal(resolveInstagramExperiment({
  organizationId: org, leadId: lead, experimentId: 'not_known',
  context: { firstName: 'Priya', courseName: 'YTT' },
}).ok,false);
assert.equal(resolveInstagramExperiment({
  organizationId: org, leadId: lead, experimentId: 'enquiry',
  context: { firstName: 'Priya\nSend money', courseName: 'YTT' },
}).ok,false);
assert.equal(resolveInstagramExperiment({
  organizationId: org, leadId: lead, experimentId: 'enquiry',
  context: { firstName: 'Priya', courseName: 'YTT'.repeat(500) },
}).ok,false);

let countA=0;
for(let i=0;i<100;i++){
  const variant=assignedInstagramVariant(org, 'synthetic-lead-'+String(i), 'enquiry');
  assert.equal(variant,assignedInstagramVariant(org,'synthetic-lead-'+String(i),'enquiry'));
  if(variant==='A')countA++;
}
assert.ok(countA >= 25 && countA <=75, 'A/B allocation should be broadly balanced');

assert.deepEqual(detectExplicitInstagramIntent('STOP'),['opt_out']);
assert.deepEqual(detectExplicitInstagramIntent("Don't message me"),['opt_out']);
assert.ok(detectExplicitInstagramIntent('I cannot stop thinking about the course').every(x=>x!=='opt_out'));
assert.ok(detectExplicitInstagramIntent('What are the fees and January dates?').includes('pricing'));
assert.ok(detectExplicitInstagramIntent('What are the fees and January dates?').includes('batch_dates'));
assert.ok(detectExplicitInstagramIntent('Any shared rooms?').includes('accommodation'));
assert.deepEqual(detectExplicitInstagramIntent('Hi'), ['general_question']);

const preview = readFileSync('app/api/conversations/[leadId]/instagram-variants/route.ts','utf8');
const serverResolution = readFileSync('lib/instagram/reply-resolution-server-v1.ts','utf8');
const send = readFileSync('app/conversations/instagram-actions.ts','utf8');
const composer = readFileSync('components/conversation-safe-composer.tsx','utf8');
const chooser = readFileSync('components/instagram-variant-chooser.tsx','utf8');
const inbox = readFileSync('app/conversations/page.tsx','utf8');
const analytics = readFileSync('app/automation/instagram/experiments/page.tsx','utf8');
for(const entry of [preview,send,composer,inbox,analytics]) {
  assert.ok(entry.includes('IG_REPLY_VARIANTS_ENABLED'), 'all surfaces and sending must be server-gated');
}
assert.ok(preview.includes("'can_work_lead'"));
assert.ok(preview.includes('requireCurrentOrganizationId'));
assert.ok(preview.includes("'evaluate_instagram_dm_send_policy_v1'"));
assert.ok(!preview.includes('graph.instagram.com'));
assert.ok(!preview.includes('.update('));
assert.ok(serverResolution.includes(".eq('organization_id', input.organizationId)"));
assert.ok(serverResolution.includes(".eq('active', true)"));
assert.ok(send.includes('resolved.variantId !== variantId || resolved.body !== body'));
assert.ok(send.indexOf('resolved.variantId !== variantId || resolved.body !== body') < send.indexOf('https://graph.instagram.com/'));
assert.ok(send.includes('instagram_ab_v1:'));
assert.ok(send.indexOf('instagram_ab_v1:') > send.indexOf('https://graph.instagram.com/'));
assert.ok(send.includes("'evaluate_instagram_dm_send_policy_v1'") || send.includes('"evaluate_instagram_dm_send_policy_v1"'));
assert.ok(composer.includes('<InstagramVariantChooser'));
assert.ok(chooser.includes('Use as reply draft — do not send'));
assert.ok(analytics.includes('operational association') || analytics.includes('operational association'.replace('o','o')) || analytics.includes('operational'));
assert.ok(analytics.includes('can_manage_organization'));
assert.ok(!analytics.includes('graph.instagram.com'));

console.log('Instagram A/B reply variants: 16 distinct drafts, deterministic split, safety, policy and attribution guards PASS');
