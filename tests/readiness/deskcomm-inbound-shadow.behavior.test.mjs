import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  classifyDeskcommReplyCandidate,
  projectDeskcommInboundShadow,
} from '../../lib/integrations/deskcomm-inbound-shadow.ts';

const sample = {
  event_key: 'message:wamid.provider-id',
  event_type: 'message:text',
  external_message_id: 'wamid.provider-id',
  contact_wa_id: '123456789',
  signature_valid: true,
  organizationMapped: true,
  payload: { message: { text: { body: 'DATES' } } },
};

test('signed, tenant-bound inbound reply is a candidate, never an authorized send', () => {
  const projected = projectDeskcommInboundShadow(sample);
  assert.equal(projected.event_family, 'inbound_message');
  assert.equal(projected.evidence_state, 'verified');
  assert.equal(projected.intent_candidate, 'batch_information_request');
  assert.equal(projected.month_candidate, null);
  assert.equal(projected.automation_authorized, false);
  assert.equal(projected.replay_authorized, false);
  assert.equal(projected.acknowledgement_strategy, 'existing_sync_after_processing');
  const serialized = JSON.stringify(projected);
  for (const value of ['wamid.provider-id', '123456789', 'DATES']) {
    assert.equal(serialized.includes(value), false, 'must not expose raw provider or message values');
  }
});

test('unsigned events never emit intents even when body says STOP', () => {
  const projected = projectDeskcommInboundShadow({
    ...sample,
    signature_valid: false,
    payload: { message: { text: { body: 'STOP' } } },
  });
  assert.equal(projected.event_family, 'untrusted');
  assert.equal(projected.evidence_state, 'untrusted');
  assert.equal(projected.intent_candidate, 'none');
});

test('unmapped account does not yield an actionable candidate', () => {
  const projected = projectDeskcommInboundShadow({ ...sample, organizationMapped: false });
  assert.equal(projected.event_family, 'untrusted');
  assert.equal(projected.active_tenant_sender_binding, false);
  assert.equal(projected.intent_candidate, 'none');
});

test('missing sender or message ID becomes incomplete evidence', () => {
  assert.equal(
    projectDeskcommInboundShadow({ ...sample, contact_wa_id: '' }).evidence_state,
    'incomplete',
  );
  assert.equal(
    projectDeskcommInboundShadow({ ...sample, external_message_id: null }).evidence_state,
    'incomplete',
  );
  assert.equal(
    projectDeskcommInboundShadow({ ...sample, event_key: '' }).evidence_state,
    'untrusted',
  );
});

test('delivery receipts never interpret customer text or trigger replay', () => {
  const projected = projectDeskcommInboundShadow({
    ...sample,
    event_type: 'status:read',
    payload: { status: { status: 'read' }, message: { text: { body: 'STOP' } } },
  });
  assert.equal(projected.event_family, 'delivery_status');
  assert.equal(projected.intent_candidate, 'none');
  assert.equal(projected.replay_authorized, false);
});

test('unknown Meta event types remain preserved but are not trusted for automation', () => {
  const projected = projectDeskcommInboundShadow({
    ...sample,
    event_type: 'smb_message_echoes',
  });
  assert.equal(projected.event_family, 'unsupported_event');
  assert.equal(projected.evidence_state, 'unsupported');
  assert.equal(projected.intent_candidate, 'none');
});

test('STOP is only a candidate, and DATES must match a direct reply', () => {
  for (const phrase of ['STOP', 'Stop All', 'unsubscribe', 'opt out']) {
    assert.deepEqual(classifyDeskcommReplyCandidate(phrase), {
      intent: 'opt_out_candidate',
      month: null,
    });
  }
  assert.deepEqual(classifyDeskcommReplyCandidate('DATES'), {
    intent: 'batch_information_request',
    month: null,
  });
  assert.deepEqual(classifyDeskcommReplyCandidate('please send me dates'), {
    intent: 'none',
    month: null,
  });
});

test('explicit month-only reply produces a tentative preference, no raw answer', () => {
  for (const [text, month] of [
    ['November', 'november'],
    ['Nov 2027', 'november'],
    ['Sep.', 'september'],
    ['Sept-2027', 'september'],
    ['May', 'may'],
    ['DECEMBER 2026', 'december'],
  ]) {
    assert.deepEqual(classifyDeskcommReplyCandidate(text), {
      intent: 'preferred_month_candidate',
      month,
    });
  }
  assert.deepEqual(classifyDeskcommReplyCandidate('I may join'), { intent: 'none', month: null });
  assert.deepEqual(classifyDeskcommReplyCandidate('maybe in June'), { intent: 'none', month: null });
  assert.deepEqual(classifyDeskcommReplyCandidate('June 1900'), { intent: 'none', month: null });
});

test('non-text messages and untrusted message content never produce candidates', () => {
  const cases = [
    { ...sample, event_type: 'message:interactive' },
    { ...sample, event_type: 'message:image' },
    { ...sample, payload: { message: { text: { body: { stop: true } } } } },
  ];
  cases.forEach((event) => {
    const projection = projectDeskcommInboundShadow(event);
    assert.equal(projection.intent_candidate, 'none');
    assert.equal(projection.automation_authorized, false);
  });
});
