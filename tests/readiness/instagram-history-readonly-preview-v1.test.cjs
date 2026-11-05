const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { load } = require('./helpers.cjs');

const parser = load('lib/integrations/instagram-history-preview-validation.ts');

const ORG = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CONNECTION = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ACCOUNT = '17840000000000001';

const sample = {
  ok: true,
  dryRun: true,
  customerMessageSent: false,
  conversationsScanned: 1,
  conversationsMatched: 1,
  messagesSeen: 14,
  messagesSkipped: 2,
  messagesImported: 0,
  messagesAlreadyPresent: 0,
  hasMore: true,
};

test('bounded read-only history summary only returns numeric aggregates', () => {
  assert.deepEqual(parser.parseInstagramHistoryPreview(sample), {
    conversationsScanned: 1,
    conversationsMatched: 1,
    messagesSeen: 14,
    messagesSkipped: 2,
    hasMore: true,
  });
  assert.deepEqual(parser.parseInstagramHistoryPreview({
    ...sample, conversationsScanned: 0, conversationsMatched: 0,
    messagesSeen: 0, messagesSkipped: 0, hasMore: false,
  }), {
    conversationsScanned: 0,
    conversationsMatched: 0,
    messagesSeen: 0,
    messagesSkipped: 0,
    hasMore: false,
  });
});

test('rejects invalid provider summaries and any import/write evidence', () => {
  for (const body of [
    null, [], {}, { ...sample, ok: false }, { ...sample, dryRun: false },
    { ...sample, customerMessageSent: true },
    { ...sample, messagesImported: 1 },
    { ...sample, messagesAlreadyPresent: 1 },
    { ...sample, messagesSeen: 21 },
    { ...sample, conversationsScanned: 2 },
    { ...sample, conversationsMatched: 2 },
    { ...sample, conversationsMatched: 0, messagesSkipped: 16 },
    { ...sample, messagesSkipped: -1 },
    { ...sample, messagesSeen: '14' },
    { ...sample, hasMore: 'false' },
    { ...sample, messagesSeen: 0.5 },
    { ...sample, providerMessage: 'sensitive customer text' },
    { ...sample, externalAccountId: ACCOUNT },
    { ...sample, accessToken: 'synthetic-secret' },
  ]) assert.throws(() => parser.parseInstagramHistoryPreview(body));
});

function setup(options = {}) {
  const calls = { admin: 0, provider: 0, options: [], queries: [] };
  const workspaceRole = options.role ?? 'admin';
  const workspace = {
    activeWorkspace: options.noWorkspace ? null : { organizationId: ORG, role: workspaceRole },
    activeOrganizationId: options.wrongOrganization ? 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' : ORG,
    memberships: options.noMembership ? [] : [{ organizationId: ORG, role: options.mismatchedRole ? 'viewer' : workspaceRole }],
  };
  const session = {
    auth: { getUser: async () => ({
      data: { user: options.anonymous ? null : { id: 'synthetic-staff' } },
      error: null,
    }) },
    from(table) {
      assert.equal(table, 'profiles');
      const query = {
        select(value) { assert.equal(value, 'active'); return query; },
        eq(k, v) { assert.equal(k, 'id'); assert.equal(v, 'synthetic-staff'); return query; },
        maybeSingle: async () => ({
          data: { active: !options.inactiveProfile }, error: null,
        }),
      };
      return query;
    },
  };
  const admin = {
    from(table) {
      assert.equal(table, 'integration_connections');
      const filters = [];
      const query = {
        select(columns) { assert.equal(columns, 'id,external_account_id'); return query; },
        eq(k, v) { filters.push([k, v]); return query; },
        maybeSingle: async () => {
          calls.queries.push(filters);
          assert.deepEqual(filters, [
            ['organization_id', ORG],
            ['provider', 'instagram'],
            ['status', 'connected'],
            ['id', CONNECTION],
          ]);
          return { data: options.missingAccount ? null :
            { id: CONNECTION, external_account_id: ACCOUNT }, error: null };
        },
      };
      return query;
    },
  };
  const route = load('app/api/instagram/history-sync/route.ts', {
    'next/server': { NextResponse: { json: (data, params = {}) => ({
      status: params.status ?? 200, data,
    }) } },
    '@/lib/supabase/server': { createClient: async () => session },
    '@/lib/supabase/admin': { createAdminClient: () => { calls.admin++; return admin; } },
    '@/lib/workspace': { getWorkspaceContextForUser: async () => workspace },
    '@/lib/security/machine-bearer-auth': { bearerMatchesAnySecret: () => false },
    '@/lib/integrations/instagram-history-reconciliation': {
      inspectInstagramEchoSubscription: async () => {
        calls.provider++;
        return { subscribed: false, fields: [], customerMessageSent: false };
      },
      reconcileInstagramMessageHistory: async (args) => {
        calls.provider++;
        calls.options.push(args);
        return {
          conversationsScanned: 1,
          conversationsMatched: 1,
          messagesSeen: 14,
          messagesImported: 0,
          messagesAlreadyPresent: 0,
          messagesSkipped: 2,
          hasMore: true,
          dryRun: !args.apply,
          customerMessageSent: false,
        };
      },
    },
  });
  return { route, calls };
}

function request(body, origin = 'https://crm.example.test') {
  const payload = JSON.stringify(body);
  return {
    headers: { get(key) {
      if (key === 'origin') return origin;
      if (key === 'content-length') return String(Buffer.byteLength(payload));
      return null;
    } },
    nextUrl: { origin: 'https://crm.example.test' },
    json: async () => body,
  };
}

test('authorized owner/admin history preview cannot import or change CRM state', async () => {
  for (const role of ['owner', 'admin']) {
    const { route, calls } = setup({ role });
    const response = await route.POST(request({
      connectionId: CONNECTION, mode: 'history_preview', apply: false,
    }));
    assert.equal(response.status, 200);
    assert.equal(response.data.ok, true);
    assert.equal(response.data.dryRun, true);
    assert.equal(response.data.customerMessageSent, false);
    assert.deepEqual(calls.options, [
      { organizationId: ORG, accountId: ACCOUNT, apply: false },
    ]);
    assert.equal(calls.admin, 1);
    assert.equal(calls.provider, 1);
    assert.equal(calls.queries.length, 1);
  }
});

test('wrong origin, inactive staff and non-admin or mismatched membership never get service access', async () => {
  const cases = [
    { options: {}, origin: 'https://another-origin.test' },
    { options: { anonymous: true } },
    { options: { inactiveProfile: true } },
    { options: { role: 'viewer' } },
    { options: { wrongOrganization: true } },
    { options: { noMembership: true } },
    { options: { mismatchedRole: true } },
    { options: { noWorkspace: true } },
  ];
  for (const { options, origin } of cases) {
    const { route, calls } = setup(options);
    const response = await route.POST(request({
      connectionId: CONNECTION, mode: 'history_preview', apply: false,
    }, origin));
    assert.ok([401, 403].includes(response.status));
    assert.equal(calls.admin, 0);
    assert.equal(calls.provider, 0);
  }
});

test('an inspection mode cannot enable history import even if worker flag is enabled', async () => {
  const previous = process.env.INSTAGRAM_HISTORY_SYNC_ENABLED;
  process.env.INSTAGRAM_HISTORY_SYNC_ENABLED = 'true';
  try {
    for (const mode of ['history_preview', 'echo_status']) {
      for (const apply of [true, undefined]) {
        const { route, calls } = setup();
        const reply = await route.POST(request({ connectionId: CONNECTION, mode, apply }));
        assert.equal(reply.status, 400);
        assert.equal(calls.admin, 0);
        assert.equal(calls.provider, 0);
      }
    }
    const { route, calls } = setup();
    const reply = await route.POST(request({
      connectionId: CONNECTION, mode: 'unexpected', apply: false,
    }));
    assert.equal(reply.status, 400);
    assert.equal(calls.admin, 0);
  } finally {
    if (previous === undefined) delete process.env.INSTAGRAM_HISTORY_SYNC_ENABLED;
    else process.env.INSTAGRAM_HISTORY_SYNC_ENABLED = previous;
  }
});

test('workspace-scoped connection denies accounts not linked to the tenant', async () => {
  const { route, calls } = setup({ missingAccount: true });
  const reply = await route.POST(request({
    connectionId: CONNECTION, mode: 'history_preview', apply: false,
  }));
  assert.equal(reply.status, 403);
  assert.equal(calls.admin, 1);
  assert.equal(calls.provider, 0);
});

test('System Health history preview uses read-only mode and displays no message bodies', () => {
  const ui = readFileSync('components/instagram-history-preview.tsx', 'utf8');
  const page = readFileSync('app/system-health/message-sync/page.tsx', 'utf8');
  const route = readFileSync('app/api/instagram/history-sync/route.ts', 'utf8');
  assert.match(ui, /mode: 'history_preview', apply: false/);
  assert.match(ui, /credentials: 'same-origin'/);
  assert.match(ui, /parseInstagramHistoryPreview\(payload\)/);
  assert.match(ui, /No messages were imported, sent, or modified/);
  assert.match(page, /InstagramHistoryPreview connections={instagramConnections}/);
  assert.match(route, /workspace\.activeOrganizationId !== active\.organizationId/);
  assert.match(route, /body\.mode === 'history_preview' \|\| body\.mode === 'echo_status'/);
  assert.doesNotMatch(ui, /apply: true|\.upsert\(|\.insert\(|sendInstagramMessage|message\.text|accessToken/);
  assert.doesNotMatch(page, /use client|onClick=|fetch\(/);
});
