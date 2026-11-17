import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { editRatio, hardStop, outcomeFor, shadowDecision, topicOf } from '../../lib/autopilot-shadow.ts';

const NOW = new Date('2026-11-17T06:00:00Z');
const recent = new Date(NOW.getTime() - 30 * 60_000).toISOString();
const base = { latestInboundAt: recent, now: NOW, stage: 'engaged', routerRisk: 'low', knowledgeUsed: 2, draft: 'The next 200-hour batch starts on 5 January in Mysore.' };

test('phase 1 sends only dates, course content and registration with knowledge and low risk', () => {
  assert.equal(shadowDecision({ ...base, latestInbound: 'When is the next batch?' }).wouldSend, true);
  assert.equal(shadowDecision({ ...base, latestInbound: 'What is the syllabus of the 200 hour course' }).wouldSend, true);
  assert.equal(shadowDecision({ ...base, latestInbound: 'How do I register?' }).wouldSend, true);
  assert.equal(shadowDecision({ ...base, latestInbound: 'What is the fee?' }).stopReason, 'topic_not_allowed');
  assert.equal(shadowDecision({ ...base, latestInbound: 'Is there accommodation?' }).stopReason, 'topic_not_allowed');
});

test('hard stops win over the model', () => {
  assert.equal(shadowDecision({ ...base, latestInbound: 'I am 5 months pregnant, can I join the next batch?' }).stopReason, 'health_safety');
  assert.equal(shadowDecision({ ...base, latestInbound: 'Any discount for two courses in the next batch?' }).stopReason, 'offer_request');
  assert.equal(shadowDecision({ ...base, latestInbound: 'I want a refund' }).stopReason, 'complaint_or_refund');
  assert.equal(shadowDecision({ ...base, latestInbound: 'Can I pay half now for the March batch?' }).stopReason, 'money_or_commitment');
  assert.equal(hardStop('when is the next batch'), null);
});

test('router, knowledge, window and stage stop it too', () => {
  const q = { ...base, latestInbound: 'When is the next batch?' };
  assert.equal(shadowDecision({ ...q, routerRisk: 'review' }).stopReason, 'router_review');
  assert.equal(shadowDecision({ ...q, routerRisk: 'human_only' }).stopReason, 'router_human_only');
  assert.equal(shadowDecision({ ...q, knowledgeUsed: 0 }).stopReason, 'no_knowledge');
  assert.equal(shadowDecision({ ...q, latestInboundAt: '2026-11-15T00:00:00Z' }).stopReason, 'window_closed');
  assert.equal(shadowDecision({ ...q, stage: 'enrolled' }).stopReason, 'closed_stage');
  assert.equal(shadowDecision({ ...q, draft: 'The fee is ₹45,000 and the batch starts in January.' }).stopReason, 'money_or_commitment');
});

test('edit ratio measures how much a person changed the draft', () => {
  const d = 'Namaste! The next 200-hour batch starts on 5 January in Mysore. Shall I send the brochure?';
  assert.equal(editRatio(d, d), 0);
  assert.equal(outcomeFor(editRatio(d, d + ' ')), 'sent_as_is');
  assert.equal(outcomeFor(editRatio(d, d.replace('Namaste!', 'Hi Priya, namaste!'))), 'sent_small_edit');
  assert.equal(outcomeFor(editRatio(d, 'Please call us on our office number for details.')), 'sent_rewritten');
  assert.equal(topicOf('when does the course start'), 'dates');
});

test('wiring: off by default, Instagram only, never sends, outcome recorded on send', () => {
  const action = readFileSync(new URL('../../app/conversations/autopilot-shadow-actions.ts', import.meta.url), 'utf8');
  assert.match(action, /AI_AUTOPILOT_SHADOW_ENABLED !== "true"/);
  assert.match(action, /current_contact_channel !== "instagram"/);
  assert.doesNotMatch(action, /sendInstagramMessageAction|graph\.facebook/);
  const ui = readFileSync(new URL('../../components/inbox-shadow-draft.tsx', import.meta.url), 'utf8');
  assert.match(ui, /source: "autopilot_shadow"/);
  assert.match(ui, /!box \|\| !box\.value\.trim\(\)/);
  assert.match(ui, /crm:instagram-sent/);
  const sql = readFileSync(new URL('../../supabase/migrations/20261117100000_ai_autopilot_shadow_v1.sql', import.meta.url), 'utf8');
  assert.match(sql, /unique \(inbound_message_id, mode\)/);
  assert.match(sql, /revoke insert, update, delete on public\.ai_autopilot_runs from authenticated/);
  assert.match(sql, /auth\.uid\(\) is null or not public\.can_work_lead\(p_lead_id\)/);
  assert.match(sql, /with \(security_invoker = true\)/);
});
