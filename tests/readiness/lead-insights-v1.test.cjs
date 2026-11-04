const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./helpers.cjs');
const { readFileSync } = require('node:fs');

const lead = '11111111-1111-4111-8111-111111111111';
const inbound = 'message:22222222-2222-4222-8222-222222222222';
const outbound = 'message:33333333-3333-4333-8333-333333333333';
const task = 'task:44444444-4444-4444-8444-444444444444';
const pay = 'payment:55555555-5555-4555-8555-555555555555';
const ctx = {
  schemaVersion: 'lead_context_v1',
  generatedAt: '2026-11-04T10:00:00Z',
  audience: 'staff_insight',
  lead: {
    id: lead, organizationId: 'some-org', displayName: 'CONFIDENTIAL NAME',
    stage: 'engaged', storedIntent: null, currentChannel: 'instagram',
    courseId: null, batchId: null, preferredLocation: 'Mysore', preferredMode: null,
    preferredMonth: null, lastInboundAt: null, lastOutboundAt: null, nextFollowupAt: null,
  },
  conversation: {
    newestFirst: true, limitedTo: 100, mayBeTruncated: false, channelsIncluded: ['instagram'],
    messages: [
      { ref: inbound, kind: 'message', conversationId: 'conv1', direction: 'inbound',
        channel: 'instagram', messageType: 'text', occurredAt: '2026-11-04T09:00:00Z',
        body: 'Can I have the course fee? Phone +919876543210, write jane@example.com' },
      { ref: outbound, kind: 'message', conversationId: 'conv1', direction: 'outbound',
        channel: 'instagram', messageType: 'text', occurredAt: '2026-11-04T08:00:00Z', body: 'I sent the brochure' },
    ],
  },
  staffOnly: {
    existingSummary: 'A private staff summary',
    privateNotes: 'A private staff note',
    activities: [],
    tasks: [{ ref: task, kind: 'task', occurredAt: '2026-11-04T07:00:00Z', title: 'Follow up',
      detail: 'Staff should check tuition', status: 'open', dueAt: '2026-11-05T00:00:00Z' }],
    stageChanges: [],
    paymentRecords: [{ ref: pay, kind: 'payment', occurredAt: '2026-11-04T07:00:00Z', status: 'pending',
      kindCode: 'deposit', amount: 100, currency: 'USD', verification: 'recorded_status_only' }],
  },
  limitations: ['Recent history only'],
};

const validator = load('lib/ai/lead-insight-validation.ts');
const good = () => ({
  status: 'supported',
  summary: { text: 'Asked about tuition and needs a response.', evidenceRefs: [inbound] },
  intent: { level: 'medium', reason: 'Requested fee details', evidenceRefs: [inbound] },
  interests: [{ description: 'Recorded preference for Mysore', evidenceRefs: ['lead:' + lead] }],
  objections: [{ category: 'price', description: 'Asked about cost', evidenceRefs: [inbound] }],
  nextAction: { kind: 'follow_up', description: 'Answer the price enquiry', evidenceRefs: [inbound, task] },
  uncertainty: ['No verified payment information available.'],
});

test('valid insights preserve concrete evidence refs, without numeric predictions', () => {
  const result = validator.validateLeadInsight(good(), ctx);
  assert.equal(result.intent.level, 'medium');
  assert.deepEqual(result.nextAction.evidenceRefs, [inbound, task]);
  assert.equal('paymentProbability' in result, false);
});

test('foreign or invented evidence refs invalidate the whole model result', () => {
  const output = good();
  output.objections[0].evidenceRefs = ['message:99999999-9999-4999-8999-999999999999'];
  assert.throws(() => validator.validateLeadInsight(output, ctx), /outside the permitted/);
});

test('customer intent cannot be sourced from outbound/staff evidence', () => {
  const output = good();
  output.intent.evidenceRefs = [outbound];
  assert.throws(() => validator.validateLeadInsight(output, ctx), /inbound evidence/);
});

test('customer objections cannot be sourced from payment evidence', () => {
  const output = good();
  output.objections[0].evidenceRefs = [pay];
  assert.throws(() => validator.validateLeadInsight(output, ctx), /inbound evidence/);
});

test('no staff context cannot yield staff insights', () => {
  const output = good();
  assert.throws(() => validator.validateLeadInsight(output, { ...ctx, audience: 'customer_draft', staffOnly: null }), /staff-only/);
});

test('unsupported financial settlement or enrollment claims fail closed', () => {
  const output = good();
  output.summary.text = 'Deposit received and confirmed.';
  assert.throws(() => validator.validateLeadInsight(output, ctx), /Unverified financial/);
});

test('insufficient_evidence discards unsupported model-generated prose', () => {
  const output = good();
  output.status = 'insufficient_evidence';
  output.summary.text = 'The student is definitely buying tomorrow';
  const result = validator.validateLeadInsight(output, ctx);
  assert.equal(result.status, 'insufficient_evidence');
  assert.equal(result.intent.level, 'unknown');
  assert.deepEqual(result.summary.evidenceRefs, []);
  assert.doesNotMatch(JSON.stringify(result), /definitely buying/);
});

test('unknown intent and no-action are explicit and require zero references', () => {
  const output = good();
  output.intent = { level: 'unknown', reason: '', evidenceRefs: [] };
  output.nextAction = { kind: 'none', description: '', evidenceRefs: [] };
  assert.equal(validator.validateLeadInsight(output, ctx).intent.level, 'unknown');
});

function setupAction(options = {}) {
  const oldFetch = global.fetch;
  const oldEnv = {
    AI_LEAD_INSIGHTS_ENABLED: process.env.AI_LEAD_INSIGHTS_ENABLED,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    ANTHROPIC_SONNET_MODEL: process.env.ANTHROPIC_SONNET_MODEL,
    AI_LEAD_INSIGHTS_INCLUDE_PRIVATE_NOTES: process.env.AI_LEAD_INSIGHTS_INCLUDE_PRIVATE_NOTES,
  };
  process.env.AI_LEAD_INSIGHTS_ENABLED = options.flagOff ? 'false' : 'true';
  process.env.ANTHROPIC_API_KEY = 'synthetic-key-not-sent';
  process.env.ANTHROPIC_SONNET_MODEL = 'synthetic-sonnet-model';
  delete process.env.AI_LEAD_INSIGHTS_INCLUDE_PRIVATE_NOTES;
  const calls = { fetch: [], context: [] };
  global.fetch = async (url, request) => {
    const body = JSON.parse(request.body);
    calls.fetch.push({ url, body });
    return {
      ok: !options.providerFails,
      json: async () => ({
        stop_reason: options.truncated ? 'max_tokens' : 'end_turn',
        content: [{ type: 'text', text: JSON.stringify(options.output ?? good()) }],
      }),
    };
  };
  const action = load('app/leads/insights-actions.ts', {
    '@/lib/ai/lead-context': {
      getLeadContextV1: async (id, audience) => {
        calls.context.push([id, audience]);
        if (options.denied) return null;
        if (options.contextThrows) throw Error('Synthetic private database details');
        if (options.changed && calls.context.length > 1) return {
          ...ctx, lead: { ...ctx.lead, stage: 'lost' },
        };
        return {
          ...ctx,
          generatedAt: calls.context.length === 1 ? '2026-11-04T11:00:00Z' : '2026-11-04T12:00:00Z',
        };
      },
    },
    '@/lib/ai/lead-insight-validation': validator,
  }).generateLeadInsightsAction;

  return {
    action, calls,
    restore() {
      global.fetch = oldFetch;
      for (const [key, value] of Object.entries(oldEnv)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    },
  };
}

test('feature flag and denied lead prevent model invocation', async () => {
  for (const options of [{ flagOff: true }, { denied: true }]) {
    const f = setupAction(options);
    try {
      const result = await f.action(lead);
      assert.equal(result.ok, false);
      assert.equal(f.calls.fetch.length, 0);
    } finally { f.restore(); }
  }
});

test('staff-only action produces evidence-vetted insight and does not leak source data in result', async () => {
  const f = setupAction();
  try {
    const result = await f.action(lead);
    assert.equal(result.ok, true);
    assert.equal(result.data.reviewRequired, true);
    assert.equal(result.data.model, 'synthetic-sonnet-model');
    assert.deepEqual(f.calls.context, [[lead, 'staff_insight'], [lead, 'staff_insight']]);
    assert.ok(f.calls.fetch[0].body.output_config.format.schema);
    assert.doesNotMatch(JSON.stringify(result), /private staff|CONFIDENTIAL NAME|jane@example.com|9876543210/);
    const prompt = f.calls.fetch[0].body.messages[0].content;
    assert.match(prompt, /\[email redacted\]/);
    assert.match(prompt, /\[phone redacted\]/);
    assert.doesNotMatch(prompt, /A private staff note|A private staff summary|CONFIDENTIAL NAME|jane@example.com|9876543210/);
    assert.equal(result.data.evidence.some(e => e.ref === inbound), true);
  } finally { f.restore(); }
});

test('a changed context or revoked access after model generation suppresses stale insight', async () => {
  const f = setupAction({ changed: true });
  try {
    const result = await f.action(lead);
    assert.equal(result.ok, false);
    assert.match(result.error, /changed/);
    assert.equal(f.calls.fetch.length, 1);
  } finally { f.restore(); }
});

test('invalid model citation and incomplete API response never produce an insight', async () => {
  for (const options of [
    { output: { ...good(), summary: { text: 'Synthetic text', evidenceRefs: ['task:bad-ref'] } } },
    { truncated: true },
    { providerFails: true },
  ]) {
    const f = setupAction(options);
    try {
      const result = await f.action(lead);
      assert.equal(result.ok, false);
      assert.equal(f.calls.context.length, 1);
    } finally { f.restore(); }
  }
});

test('C2 remains strictly read-only with no send or CRM mutation surface', () => {
  const source = readFileSync('app/leads/insights-actions.ts', 'utf8');
  assert.doesNotMatch(source, /\.insert\(|\.update\(|\.upsert\(|\.delete\(|sendWhatsApp|sendInstagram|scheduleFollowup/i);
  assert.match(source, /getLeadContextV1\(leadId, 'staff_insight'\)/);
  assert.match(source, /AI_LEAD_INSIGHTS_ENABLED/);
});
