const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { load } = require('./helpers.cjs');

const SECRET = 'synthetic-test-app-secret-never-a-real-provider-key';
const ACCOUNT = '17890000000012345';
const CUSTOMER = '992200001112233';
const ORG = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const MID = 'mid_synthetic_001';
const RAW_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CRM_THREAD = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const EVENT_TIME = 1793000000000;

function echoEvent(overrides = {}) {
  return {
    sender: { id: ACCOUNT },
    recipient: { id: CUSTOMER },
    timestamp: EVENT_TIME,
    message: { mid: MID, is_echo: true, text: 'Synthetic fixture only' },
    ...overrides,
  };
}

function payload(events = [echoEvent()]) {
  return { object: 'instagram', entry: [{ id: ACCOUNT, messaging: events }] };
}

function request(body, options = {}) {
  const bytes = Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
  const expected = crypto.createHmac('sha256', SECRET).update(bytes).digest('hex');
  const headers = { 'content-type': 'application/json' };
  if (options.signature !== 'missing') {
    headers['x-hub-signature-256'] =
      options.signature === 'invalid' ? 'sha256=' + '0'.repeat(64) : 'sha256=' + expected;
  }
  return new Request('https://local.test/api/instagram/webhook', {
    method: 'POST',
    headers,
    body: bytes,
  });
}

function harness(options = {}) {
  const calls = {
    createAdminClient: 0,
    lookup: [],
    rpc: [],
    automation: 0,
    profile: 0,
    readActivity: 0,
  };
  const seen = new Set();

  const admin = {
    from(name) {
      const filters = [];
      const query = {
        select(value) {
          assert.equal(value, name === 'integration_connections' ? 'organization_id' : 'id');
          return query;
        },
        eq(key, value) {
          filters.push([key, value]);
          return query;
        },
        limit: async n => {
          assert.equal(n, 2);
          calls.lookup.push({ table: name, filters });
          if (options.lookupError) {
            return { data: null, error: { message: 'synthetic private error' } };
          }
          if (name === 'integration_connections') {
            assert.deepEqual(filters, [
              ['provider', 'instagram'],
              ['status', 'connected'],
              ['external_account_id', ACCOUNT],
            ]);
            return { data: options.unknownAccount ? [] :
              options.ambiguousAccount ? [{ organization_id: ORG }, { organization_id: ORG }] :
                [{ organization_id: ORG }], error: null };
          }
          if (name === 'conversations') {
            assert.deepEqual(filters, [
              ['organization_id', ORG],
              ['channel', 'instagram'],
              ['external_account_id', ACCOUNT],
              ['external_conversation_id', ACCOUNT + ':' + CUSTOMER],
            ]);
            return { data: options.missingThread ? [] :
              options.ambiguousThread ? [{ id: CRM_THREAD }, { id: CRM_THREAD }] :
                [{ id: CRM_THREAD }], error: null };
          }
          if (name === 'messages') {
            assert.deepEqual(filters, [
              ['organization_id', ORG],
              ['conversation_id', CRM_THREAD],
              ['direction', 'outbound'],
              ['external_message_id', MID],
            ]);
            return { data: options.existingOutbound ? [{ id: 'message_existing' }] : [],
              error: null };
          }
          throw new Error('Unexpected read table: ' + name);
        },
        maybeSingle: async () => {
          assert.equal(name, 'integration_connections');
          calls.lookup.push({ table: name, filters });
          assert.deepEqual(filters, [
            ['provider', 'instagram'],
            ['status', 'connected'],
            ['external_account_id', ACCOUNT],
          ]);
          return { data: options.unknownAccount ? null : { organization_id: ORG }, error: null };
        },
      };
      return query;
    },
    async rpc(name, args) {
      calls.rpc.push({ name, args });
      if (name === 'ingest_raw_event') {
        assert.equal(args.p_organization_id, ORG);
        assert.equal(args.p_source_system, 'instagram');
        assert.equal(args.p_ingestion_method, 'instagram_webhook');
        assert.equal(args.p_source_event_id, 'echo:' + MID);
        assert.equal(args.p_source_event_type, 'outbound_echo:text');
        assert.equal(args.p_source_account_id, ACCOUNT);
        assert.equal(args.p_source_subject_id, CUSTOMER);
        assert.equal(args.p_external_message_id, MID);
        assert.equal(args.p_payload.outbound_echo.message.mid, MID);
        assert.equal(args.p_payload.outbound_echo.message.is_echo, true);
        assert.equal(args.p_context.signature_valid, true);
        assert.equal(args.p_context.direction, 'outbound');
        assert.equal(args.p_occurred_at, new Date(EVENT_TIME).toISOString());
        const created = !seen.has(args.p_source_event_id);
        seen.add(args.p_source_event_id);
        return { data: { event_id: RAW_ID, created }, error: null };
      }
      if (name === 'ingest_instagram_outbound_echo_v1') {
        assert.deepEqual(args, { p_raw_event_id: RAW_ID });
        return {
          data: options.projection ??
            (calls.rpc.filter(call => call.name === name).length > 1
              ? { ok: true, duplicate_message: true }
              : { ok: true, processed: true }),
          error: null,
        };
      }
      throw new Error('Unexpected provider or CRM mutation: ' + name);
    },
  };

  const route = load('app/api/instagram/webhook/route.ts', {
    crypto: { default: crypto },
    'next/server': {
      NextResponse: {
        json(data, options = {}) { return { status: options.status ?? 200, data }; },
      },
    },
    '@/lib/supabase/admin': {
      createAdminClient: () => {
        calls.createAdminClient += 1;
        return admin;
      },
    },
    '@/lib/security/machine-bearer-auth': { secretMatches: () => false },
    '@/lib/integrations/message-read-activity': {
      recordInstagramConversationReadActivity: async (_db, event) => {
        calls.readActivity += 1;
        assert.equal(event.accountId, ACCOUNT);
        assert.equal(event.customerId, CUSTOMER);
        assert.equal(event.occurredAt, new Date(EVENT_TIME).toISOString());
        return { acknowledged: true };
      },
    },
    '@/lib/automation/instagram-operations': {
      queueInstagramCommentAutomation: async () => { calls.automation++; throw Error('must not queue'); },
      queueInstagramDmAutomation: async () => { calls.automation++; throw Error('must not queue'); },
    },
    '@/lib/integrations/instagram-profile-sync': {
      applyInstagramProfileToGenericLead: async () => { calls.profile++; throw Error('must not enrich'); },
      resolveInstagramMessagingProfile: async () => { calls.profile++; throw Error('must not fetch profile'); },
    },
  });
  return { route, calls };
}

async function run(body, options = {}, state = {}) {
  const original = {
    secret: process.env.INSTAGRAM_APP_SECRET,
    enabled: process.env.INSTAGRAM_OUTBOUND_ECHO_ENABLED,
    readEnabled: process.env.INSTAGRAM_READ_RECEIPT_ACTIVITY_ENABLED,
  };
  process.env.INSTAGRAM_APP_SECRET = SECRET;
  if (state.enabled === false) delete process.env.INSTAGRAM_OUTBOUND_ECHO_ENABLED;
  else process.env.INSTAGRAM_OUTBOUND_ECHO_ENABLED = 'true';
  if (state.readEnabled === true) process.env.INSTAGRAM_READ_RECEIPT_ACTIVITY_ENABLED = 'true';
  else delete process.env.INSTAGRAM_READ_RECEIPT_ACTIVITY_ENABLED;
  const ctx = harness(state);
  try {
    const reply = await ctx.route.POST(request(body, options));
    return { ...ctx, reply };
  } finally {
    if (original.secret === undefined) delete process.env.INSTAGRAM_APP_SECRET;
    else process.env.INSTAGRAM_APP_SECRET = original.secret;
    if (original.enabled === undefined) delete process.env.INSTAGRAM_OUTBOUND_ECHO_ENABLED;
    else process.env.INSTAGRAM_OUTBOUND_ECHO_ENABLED = original.enabled;
    if (original.readEnabled === undefined) delete process.env.INSTAGRAM_READ_RECEIPT_ACTIVITY_ENABLED;
    else process.env.INSTAGRAM_READ_RECEIPT_ACTIVITY_ENABLED = original.readEnabled;
  }
}

test('rejects invalid and missing HMAC signatures before creating a privileged client', async () => {
  for (const signature of ['missing', 'invalid']) {
    const { reply, calls } = await run(payload(), { signature });
    assert.equal(reply.status, 401);
    assert.equal(calls.createAdminClient, 0);
    assert.equal(calls.rpc.length, 0);
  }
});

test('disabled echo parser does not touch CRM even with a correctly signed outbound message', async () => {
  const { reply, calls } = await run(payload(), {}, { enabled: false });
  assert.equal(reply.status, 200);
  assert.equal(reply.data.reason, 'no_supported_instagram_events');
  assert.equal(calls.createAdminClient, 1);
  assert.deepEqual(calls.lookup.map(x => x.table), [
    'integration_connections', 'conversations', 'messages',
  ]);
  assert.equal(calls.rpc.length, 0);
});

test('disabled CRM processing observes signed echo counts without privileged client or customer data', async () => {
  const priorInfo = console.info;
  const logs = [];
  console.info = (...args) => { logs.push(args); };
  try {
    const { reply, calls } = await run(payload([echoEvent(), echoEvent()]), {}, { enabled: false });
    assert.equal(reply.status, 200);
    assert.equal(reply.data.reason, 'no_supported_instagram_events');
    assert.equal(calls.createAdminClient, 1);
    assert.equal(calls.rpc.length, 0);
    assert.deepEqual(calls.lookup.map(x => x.table), [
      'integration_connections', 'conversations', 'messages',
      'integration_connections', 'conversations', 'messages',
    ]);
    assert.deepEqual(logs, [[
      'Signed Instagram outbound echo candidates observed (CRM processing disabled).',
      {
        candidateCount: 2, checkedCount: 2,
        connectedAccountMatches: 2, existingThreadMatches: 2,
        existingOutboundMidMatches: 0,
        unmappedOrAmbiguousAccounts: 0, missingOrAmbiguousThreads: 0,
        lookupUnavailable: 0, uncheckedCount: 0,
      },
    ]]);
    const serialized = JSON.stringify(logs);
    for (const privateValue of [ACCOUNT, CUSTOMER, MID, 'Synthetic fixture only', ORG, SECRET]) {
      assert.equal(serialized.includes(privateValue), false, 'No identifiers or contents in logs');
    }
  } finally {
    console.info = priorInfo;
  }
});

test('identity preflight reports exact outbound MID matches without writes or identifiers', async () => {
  const priorInfo = console.info;
  const logs = [];
  console.info = (...args) => logs.push(args);
  try {
    const { reply, calls } = await run(payload(), {}, { enabled: false, existingOutbound: true });
    assert.equal(reply.status, 200);
    assert.equal(calls.rpc.length, 0);
    assert.equal(calls.automation, 0);
    assert.equal(calls.profile, 0);
    const aggregate = logs[0][1];
    assert.equal(aggregate.existingOutboundMidMatches, 1);
    assert.equal(aggregate.existingThreadMatches, 1);
    assert.equal(aggregate.connectedAccountMatches, 1);
    assert.equal(aggregate.lookupUnavailable, 0);
    assert.equal(JSON.stringify(logs).includes(MID), false);
  } finally { console.info = priorInfo; }
});

test('identity preflight fails closed on unknown, ambiguous or unavailable account/thread evidence', async () => {
  for (const state of [
    { unknownAccount: true },
    { ambiguousAccount: true },
    { missingThread: true },
    { ambiguousThread: true },
    { lookupError: true },
  ]) {
    const priorInfo = console.info;
    const logs = [];
    console.info = (...args) => logs.push(args);
    try {
      const { reply, calls } = await run(payload(), {}, { enabled: false, ...state });
      assert.equal(reply.status, 200);
      assert.equal(calls.rpc.length, 0);
      assert.equal(calls.automation, 0);
      assert.equal(calls.profile, 0);
      const metric = logs[0][1];
      assert.equal(metric.candidateCount, 1);
      assert.equal(metric.existingOutboundMidMatches, 0);
      assert.equal(metric.lookupUnavailable + metric.unmappedOrAmbiguousAccounts +
        metric.missingOrAmbiguousThreads, 1);
      assert.equal(JSON.stringify(logs).includes(MID), false);
      assert.equal(JSON.stringify(logs).includes(ACCOUNT), false);
    } finally { console.info = priorInfo; }
  }
});

test('identity preflight bounds signed candidates per request and avoids write calls', async () => {
  const priorInfo = console.info;
  const logs = [];
  console.info = (...args) => logs.push(args);
  try {
    const { reply, calls } = await run(payload(Array.from({ length: 12 }, () => echoEvent())), {},
      { enabled: false });
    assert.equal(reply.status, 200);
    assert.equal(calls.createAdminClient, 1);
    assert.equal(calls.lookup.length, 30);
    assert.equal(calls.rpc.length, 0);
    assert.equal(logs[0][1].candidateCount, 12);
    assert.equal(logs[0][1].checkedCount, 10);
    assert.equal(logs[0][1].uncheckedCount, 2);
  } finally { console.info = priorInfo; }
});

test('signed Instagram read watermark adds a thread-level activity only with its independent opt-in', async () => {
  const read = { sender: { id: CUSTOMER }, recipient: { id: ACCOUNT },
    timestamp: EVENT_TIME, read: { watermark: EVENT_TIME } };
  const disabled = await run(payload([read]), {}, { enabled: false, readEnabled: false });
  assert.equal(disabled.reply.status, 200);
  assert.equal(disabled.reply.data.reason, 'no_supported_instagram_events');
  assert.equal(disabled.calls.readActivity, 0);
  assert.equal(disabled.calls.createAdminClient, 0);

  const enabled = await run(payload([read]), {}, { enabled: false, readEnabled: true });
  assert.equal(enabled.reply.status, 200);
  assert.equal(enabled.calls.readActivity, 1);
  assert.equal(enabled.reply.data.read_activities_acknowledged, 1);
  assert.equal(enabled.calls.rpc.length, 0);
  assert.equal(enabled.calls.automation, 0);
});

test('invalid, wrong-direction or message-bearing Instagram read envelope creates no activity', async () => {
  const invalid = [
    { sender: { id: ACCOUNT }, recipient: { id: CUSTOMER }, read: { watermark: EVENT_TIME } },
    { sender: { id: CUSTOMER }, recipient: { id: ACCOUNT }, read: {} },
    { sender: { id: CUSTOMER }, recipient: { id: ACCOUNT }, read: { watermark: 'invalid' } },
    { sender: { id: CUSTOMER }, recipient: { id: ACCOUNT }, read: { watermark: EVENT_TIME },
      message: { is_echo: true, text: 'Read receipt with extra echo metadata' } },
  ];
  const result = await run(payload(invalid), {}, { enabled: false, readEnabled: true });
  assert.equal(result.reply.status, 200);
  assert.equal(result.reply.data.reason, 'no_supported_instagram_events');
  assert.equal(result.calls.readActivity, 0);
  assert.equal(result.calls.createAdminClient, 0);

  const badHmac = await run(payload([{
    sender: { id: CUSTOMER }, recipient: { id: ACCOUNT }, read: { watermark: EVENT_TIME },
  }]), { signature: 'invalid' }, { enabled: false, readEnabled: true });
  assert.equal(badHmac.reply.status, 401);
  assert.equal(badHmac.calls.readActivity, 0);
});

test('invalid HMAC or non-echo payload never produces an observation log', async () => {
  const priorInfo = console.info;
  const logs = [];
  console.info = (...args) => { logs.push(args); };
  try {
    const bad = await run(payload(), { signature: 'invalid' }, { enabled: false });
    assert.equal(bad.reply.status, 401);
    const irrelevant = await run(payload([
      echoEvent({ message: { is_echo: true, text: 'MID unavailable' } }),
      echoEvent({ message: { mid: MID, is_echo: true, is_deleted: true } }),
      echoEvent({ sender: { id: CUSTOMER } }),
      { sender: { id: CUSTOMER }, recipient: { id: ACCOUNT }, read: { watermark: EVENT_TIME } },
    ]), {}, { enabled: false });
    assert.equal(irrelevant.reply.status, 200);
    assert.equal(irrelevant.calls.createAdminClient, 0);
    assert.equal(irrelevant.calls.rpc.length, 0);
    assert.deepEqual(logs, []);
  } finally {
    console.info = priorInfo;
  }
});

test('enabled CRM projection does not emit disabled-mode observation log', async () => {
  const priorInfo = console.info;
  const logs = [];
  console.info = (...args) => { logs.push(args); };
  try {
    const { reply, calls } = await run(payload());
    assert.equal(reply.status, 200);
    assert.equal(reply.data.echoes_processed, 1);
    assert.deepEqual(calls.rpc.map(call => call.name), [
      'ingest_raw_event', 'ingest_instagram_outbound_echo_v1',
    ]);
    assert.deepEqual(logs, []);
  } finally {
    console.info = priorInfo;
  }
});

test('ignores read receipts, deleted echoes, missing mids, and wrong sender direction', async () => {
  const invalid = [
    { sender: { id: CUSTOMER }, recipient: { id: ACCOUNT }, timestamp: EVENT_TIME, read: { watermark: EVENT_TIME } },
    echoEvent({ message: { mid: MID, is_echo: true, is_deleted: true } }),
    echoEvent({ message: { is_echo: true, text: 'No provider ID' } }),
    echoEvent({ sender: { id: CUSTOMER } }),
    echoEvent({ recipient: { id: ACCOUNT } }),
  ];
  const { reply, calls } = await run(payload(invalid));
  assert.equal(reply.status, 200);
  assert.equal(reply.data.reason, 'no_supported_instagram_events');
  assert.equal(calls.createAdminClient, 0);
});

test('unknown Instagram account never writes a CRM raw event or conversation', async () => {
  const { reply, calls } = await run(payload(), {}, { unknownAccount: true });
  assert.equal(reply.status, 200);
  assert.equal(reply.data.unknown_accounts, 1);
  assert.equal(reply.data.received_echoes, 1);
  assert.equal(calls.createAdminClient, 1);
  assert.equal(calls.lookup.length, 1);
  assert.equal(calls.rpc.length, 0);
});

test('signed native-app echo writes only nested outbound evidence for matching account', async () => {
  const { reply, calls } = await run(payload());
  assert.equal(reply.status, 200);
  assert.equal(reply.data.received_echoes, 1);
  assert.equal(reply.data.echoes_processed, 1);
  assert.equal(reply.data.raw_events_created, 1);
  assert.deepEqual(calls.rpc.map(call => call.name), [
    'ingest_raw_event', 'ingest_instagram_outbound_echo_v1',
  ]);
  assert.equal(calls.profile, 0);
  assert.equal(calls.automation, 0);
});

test('duplicate signed echo preserves idempotency and never invokes an inbound projector', async () => {
  const { reply, calls } = await run(payload([echoEvent(), echoEvent()]));
  assert.equal(reply.status, 200);
  assert.equal(reply.data.received_echoes, 2);
  assert.equal(reply.data.raw_events_created, 1);
  assert.equal(reply.data.echoes_processed, 1);
  assert.equal(reply.data.echoes_duplicated, 1);
  assert.deepEqual(calls.rpc.map(call => call.name), [
    'ingest_raw_event', 'ingest_instagram_outbound_echo_v1',
    'ingest_raw_event', 'ingest_instagram_outbound_echo_v1',
  ]);
});

test('deferred signed echo remains a deferred event and does not create a lead', async () => {
  const { reply, calls } = await run(payload(), {}, {
    projection: { ok: true, processed: false, deferred: true, reason: 'conversation_not_found' },
  });
  assert.equal(reply.status, 200);
  assert.equal(reply.data.echoes_deferred, 1);
  assert.equal(reply.data.echoes_processed, 0);
  assert.equal(calls.rpc.filter(call => call.name === 'ingest_instagram_outbound_echo_v1').length, 1);
  assert.equal(calls.automation, 0);
});

test('echo projection rejection fails the webhook for provider replay, without pretending success', async () => {
  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    const { reply, calls } = await run(payload(), {}, {
      projection: { ok: false, error: 'Synthetic projector rejection' },
    });
    assert.equal(reply.status, 500);
    assert.equal(reply.data.error, 'Instagram webhook failed');
    assert.equal(calls.rpc.length, 2);
  } finally {
    console.error = originalConsoleError;
  }
});
