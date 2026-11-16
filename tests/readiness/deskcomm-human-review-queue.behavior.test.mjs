import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  classifyDeskcommReplyCandidate,
  projectDeskcommInboundShadow,
} from '../../lib/integrations/deskcomm-inbound-shadow.ts';
import {
  collectDeskcommReviewCandidates,
  reconcileDeskcommHumanReviewQueue,
} from '../../lib/integrations/deskcomm-human-review-queue.ts';

const event = {
  event_key: 'message:wamid.hidden',
  event_type: 'message:text',
  external_message_id: 'wamid.hidden',
  contact_wa_id: '919999123456',
  signature_valid: true,
  organizationMapped: true,
  payload: { message: { text: { body: 'Can I speak to a human?' } } },
};

function receipt(input = event) {
  return {
    received_at: '2026-11-16T12:00:00.000Z',
    external_message_id: input.external_message_id,
    source_account_id: 'meta-phone-number-id',
    source_subject_id: input.contact_wa_id,
    metadata: { deskcomm_inbound_shadow: projectDeskcommInboundShadow(input) },
  };
}

const links = [{
  external_message_id: 'wamid.hidden',
  lead_id: 'lead-123',
  conversation_id: 'conversation-123',
}];
const messages = [{
  ...links[0],
  direction: 'inbound',
}];
const conversations = [{
  id: 'conversation-123',
  lead_id: 'lead-123',
  channel: 'whatsapp',
  external_account_id: 'meta-phone-number-id',
  external_conversation_id: '919999123456',
}];

function reconcile(overrides = {}) {
  const candidates = collectDeskcommReviewCandidates([receipt()]);
  assert.ok(candidates);
  return reconcileDeskcommHumanReviewQueue({
    candidates,
    links,
    messages,
    conversations,
    tenantLeadIds: ['lead-123'],
    ...overrides,
  });
}

test('human requests classify conservatively as review-only', () => {
  for (const text of [
    'Can I speak to a human?',
    'I want to talk to a person',
    'Please connect me to an agent',
    'Human please',
    'I would like to speak with someone from your team',
  ]) {
    assert.deepEqual(classifyDeskcommReplyCandidate(text), {
      intent: 'human_handoff_candidate',
      month: null,
    }, text);
  }
  const projected = projectDeskcommInboundShadow(event);
  assert.equal(projected.intent_candidate, 'human_handoff_candidate');
  assert.equal(projected.automation_authorized, false);
  assert.equal(projected.replay_authorized, false);
});

test('quoted menus, non-requests and stale long messages do not create handoffs', () => {
  for (const phrase of [
    '1. Prices\n2. Talk with an agent\n3. Opening hours',
    'Please choose option 4: human',
    'I do not want to speak to a human',
    'We have a human support team',
    'I want to speak with a human ' + 'X'.repeat(200),
  ]) {
    assert.equal(
      classifyDeskcommReplyCandidate(phrase).intent,
      'none',
      phrase.slice(0, 70),
    );
  }
});

test('exact same tenant/account/sender and inbound message gives verified lead link', () => {
  const candidates = collectDeskcommReviewCandidates([receipt()]);
  assert.equal(candidates?.length, 1);
  const queue = reconcile();
  assert.deepEqual(queue, [{
    kind: 'human_request',
    observedAt: '2026-11-16T12:00:00.000Z',
    leadId: 'lead-123',
    conversationId: 'conversation-123',
    match: 'verified_identity',
  }]);
  const output = JSON.stringify(queue);
  for (const privateValue of [
    'wamid.hidden', 'meta-phone-number-id', '919999123456',
    'Can I speak to a human?',
  ]) {
    assert.equal(output.includes(privateValue), false);
  }
});

test('STOP is an opt-out review, not an automatic suppression or send', () => {
  const stop = {
    ...event,
    payload: { message: { text: { body: 'STOP' } } },
  };
  const candidates = collectDeskcommReviewCandidates([receipt(stop)]);
  assert.equal(candidates?.length, 1);
  const queue = reconcileDeskcommHumanReviewQueue({
    candidates: candidates ?? [],
    links, messages, conversations, tenantLeadIds: ['lead-123'],
  });
  assert.equal(queue[0].kind, 'opt_out');
  assert.equal('authorization' in queue[0], false);
});

test('no lead is shown for mismatched account, sender, direction or tenant membership', () => {
  const cases = [
    { conversations: [{ ...conversations[0], external_account_id: 'different-meta-business' }] },
    { conversations: [{ ...conversations[0], external_conversation_id: 'someone-else' }] },
    { conversations: [{ ...conversations[0], lead_id: 'other-lead' }] },
    { conversations: [{ ...conversations[0], channel: 'instagram' }] },
    { messages: [{ ...messages[0], direction: 'outbound' }] },
    { messages: [{ ...messages[0], conversation_id: 'other-conversation' }] },
    { tenantLeadIds: [] },
    { links: [] },
    { messages: [] },
    { conversations: [] },
  ];
  for (const overrides of cases) {
    const [row] = reconcile(overrides);
    assert.equal(row.match, 'needs_identity_review');
    assert.equal(row.leadId, null);
    assert.equal(row.conversationId, null);
  }
});

test('duplicate provider links and message rows fail closed', () => {
  assert.equal(
    reconcile({ links: [links[0], links[0]] })[0].match,
    'needs_identity_review',
  );
  assert.equal(
    reconcile({ messages: [messages[0], messages[0]] })[0].match,
    'needs_identity_review',
  );
});

test('unsigned/unmapped, malformed and unsupported evidence cannot make a queue item', () => {
  assert.deepEqual(
    collectDeskcommReviewCandidates([receipt({ ...event, signature_valid: false })]),
    [],
  );
  assert.deepEqual(
    collectDeskcommReviewCandidates([receipt({ ...event, organizationMapped: false })]),
    [],
  );
  assert.equal(
    collectDeskcommReviewCandidates([{
      ...receipt(),
      metadata: {
        deskcomm_inbound_shadow: {
          ...projectDeskcommInboundShadow(event),
          automation_authorized: true,
        },
      },
    }]),
    null,
  );
  assert.equal(
    collectDeskcommReviewCandidates([{ ...receipt(), source_account_id: null }]),
    null,
  );
  assert.equal(
    collectDeskcommReviewCandidates(Array.from({ length: 1001 }, () => receipt())),
    null,
  );
});

test('unrelated existing canonical raw event rows are ignored', () => {
  assert.deepEqual(
    collectDeskcommReviewCandidates([{ ...receipt(), metadata: {} }]),
    [],
  );
  assert.deepEqual(
    collectDeskcommReviewCandidates([receipt({ ...event, payload: { message: { text: { body: 'DATES' } } } })]),
    [],
  );
});
