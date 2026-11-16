import assert from 'node:assert/strict';
import { test } from 'node:test';

import { projectDeskcommInboundShadow } from '../../lib/integrations/deskcomm-inbound-shadow.ts';
import { summarizeDeskcommInboundShadow } from '../../lib/integrations/deskcomm-shadow-summary.ts';

const time = '2026-11-16T07:30:00.000Z';
const base = {
  event_key: 'message:wamid-secret',
  event_type: 'message:text',
  external_message_id: 'wamid-secret',
  contact_wa_id: '880000000000',
  signature_valid: true,
  organizationMapped: true,
  payload: { message: { text: { body: 'DATES' } } },
};

function row(event = base) {
  return {
    received_at: time,
    metadata: {
      adapter: 'app/api/whatsapp/webhook',
      legacy_webhook_event_id: 'private-event-id',
      deskcomm_inbound_shadow: projectDeskcommInboundShadow(event),
    },
  };
}

test('aggregates only categorical totals and timestamps', () => {
  const rows = [
    row(),
    row({ ...base, event_type: 'status:delivered', payload: { status: { status: 'delivered' } } }),
    row({ ...base, payload: { message: { text: { body: 'December' } } } }),
    row({ ...base, payload: { message: { text: { body: 'STOP' } } } }),
    { received_at: time, metadata: {} },
  ];
  assert.deepEqual(summarizeDeskcommInboundShadow(rows), {
    observedRawReceipts: 5,
    taggedReceipts: 4,
    untaggedReceipts: 1,
    inboundMessages: 3,
    deliveryStatuses: 1,
    unsupportedEvents: 0,
    incompleteEvidence: 0,
    untrustedEvidence: 0,
    candidateBatchDates: 1,
    candidateMonths: 1,
    candidateOptOuts: 1,
    lastTaggedAt: time,
  });
  const result = JSON.stringify(summarizeDeskcommInboundShadow(rows));
  for (const secret of ['wamid-secret', '880000000000', 'private-event-id', 'DATES', 'December', 'STOP']) {
    assert.equal(result.includes(secret), false, 'private event data must not be emitted');
  }
});

test('no rows is an empty OBSERVED window, not an invented failure count', () => {
  const result = summarizeDeskcommInboundShadow([]);
  assert.equal(result?.observedRawReceipts, 0);
  assert.equal(result?.lastTaggedAt, null);
});

test('rejects malformed shadow schema or unauthorized send/replay flags', () => {
  assert.equal(summarizeDeskcommInboundShadow([{ received_at: time, metadata: {
    deskcomm_inbound_shadow: { ...projectDeskcommInboundShadow(base), automation_authorized: true },
  } }]), null);
  assert.equal(summarizeDeskcommInboundShadow([{ received_at: time, metadata: {
    deskcomm_inbound_shadow: { ...projectDeskcommInboundShadow(base), replay_authorized: true },
  } }]), null);
  assert.equal(summarizeDeskcommInboundShadow([{ received_at: time, metadata: {
    deskcomm_inbound_shadow: { ...projectDeskcommInboundShadow(base), intent_candidate: 'invented' },
  } }]), null);
  assert.equal(summarizeDeskcommInboundShadow([{ received_at: time, metadata: {
    deskcomm_inbound_shadow: {},
  } }]), null);
});

test('fails closed above the bounded report size, or on malformed timestamps', () => {
  assert.equal(summarizeDeskcommInboundShadow(Array.from({ length: 1001 }, () => row())), null);
  assert.equal(summarizeDeskcommInboundShadow([{ ...row(), received_at: 'not-a-date' }]), null);
});

test('tolerates existing untagged canonical events without rewriting them', () => {
  assert.equal(summarizeDeskcommInboundShadow([
    { received_at: time, metadata: { adapter: 'app/api/whatsapp/webhook' } },
  ])?.untaggedReceipts, 1);
});
