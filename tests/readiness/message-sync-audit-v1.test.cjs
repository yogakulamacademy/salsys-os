const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { load } = require('./helpers.cjs');

const parser = load('lib/message-sync-audit-validation.ts');

const synthetic = {
  messages: [
    { channel: 'instagram', direction: 'inbound', storedCount: 9, missingProviderId: 0, outboundMissingSentAt: 0, latestStoredAt: '2026-11-05T05:00:00Z' },
    { channel: 'instagram', direction: 'outbound', storedCount: 4, missingProviderId: 1, outboundMissingSentAt: 0, latestStoredAt: '2026-11-05T05:00:00Z' },
    { channel: 'whatsapp', direction: 'outbound', storedCount: 3, missingProviderId: 2, outboundMissingSentAt: 1, latestStoredAt: null },
  ],
  providerEventLifecycle: [
    { channel: 'instagram', status: 'processed', eventCount: 11, lastUpdatedAt: '2026-11-05T05:00:00Z' },
    { channel: 'whatsapp', status: 'dead_letter', eventCount: 2, lastUpdatedAt: null },
  ],
  instagramHistory: { accountCursors: 0, completedCycles: 0, conversationsScanned: 0, messagesImported: 0, messagesAlreadyPresent: 0, lastScannedAt: null },
  checkedAt: '2026-11-05T05:15:00Z',
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

test('metadata-only audit parses channel counts and preserves unknown history coverage', () => {
  const result = parser.parseMessageSyncAudit(synthetic);
  assert.equal(result.messages[1].missingProviderId, 1);
  assert.equal(result.messages[2].outboundMissingSentAt, 1);
  assert.equal(result.providerEventLifecycle[1].status, 'dead_letter');
  assert.equal(result.instagramHistory.accountCursors, 0);
  assert.equal(result.instagramHistory.lastScannedAt, null);
});

test('fail closed on impossible, malformed or overly broad database output', () => {
  for (const source of [
    null, {}, [], { ...synthetic, messages: null },
    { ...synthetic, messages: Array.from({length: 13}, () => synthetic.messages[0]) },
    { ...synthetic, messages: [{ ...synthetic.messages[0], storedCount: -1 }] },
    { ...synthetic, messages: [{ ...synthetic.messages[0], missingProviderId: 99 }] },
    { ...synthetic, messages: [{ ...synthetic.messages[0], direction: 'other' }] },
    { ...synthetic, messages: [{ ...synthetic.messages[0], outboundMissingSentAt: 2 }] },
    { ...synthetic, messages: [{ ...synthetic.messages[0], latestStoredAt: 'bad-date' }] },
    { ...synthetic, providerEventLifecycle: [{ ...synthetic.providerEventLifecycle[0], status: 'failed; select *' }] },
    { ...synthetic, instagramHistory: { ...synthetic.instagramHistory, accountCursors: 'NaN' } },
    { ...synthetic, checkedAt: '' },
  ]) assert.throws(() => parser.parseMessageSyncAudit(source));
});

function setup(options = {}) {
  const calls = { serviceClient: 0, rpc: [], sessionTables: [] };
  const profile = {
    select() { return this; },
    eq() { return this; },
    maybeSingle: async () => ({ data: { active: options.inactive !== true }, error: null }),
  };
  const session = {
    auth: { getUser: async () => ({
      data: { user: options.anonymous ? null : { id: 'synthetic-operator' } },
      error: null,
    }) },
    from(name) {
      calls.sessionTables.push(name);
      assert.equal(name, 'profiles');
      return profile;
    },
  };
  const admin = {
    rpc: async (name, args) => {
      calls.rpc.push({ name, args });
      return options.rpcError ? { data: null, error: { message: 'private provider data' } }
        : { data: clone(synthetic), error: null };
    },
  };
  const workspace = {
    activeOrganizationId: options.wrongOrg ? 'other-org' : 'synthetic-org',
    activeWorkspace: options.noWorkspace ? null : {
      organizationId: 'synthetic-org',
      organizationName: 'Example Workspace',
      role: options.role ?? 'admin',
    },
    memberships: options.emptyMembership ? [] : [{
      organizationId: 'synthetic-org',
      organizationName: 'Example Workspace',
      role: options.memberRole ?? options.role ?? 'admin',
    }],
  };
  const module = load('lib/message-sync-audit.ts', {
    'server-only': {},
    '@/lib/supabase/server': { createClient: async () => session },
    '@/lib/supabase/admin': { createAdminClient: () => { calls.serviceClient++; return admin; } },
    '@/lib/workspace': { getWorkspaceContextForUser: async () => workspace },
    '@/lib/data': { isMockMode: () => options.mock === true },
    '@/lib/message-sync-audit-validation': parser,
  });
  return { module, calls };
}

test('authorization rejects anonymous, inactive, missing and non-admin workspaces before service role', async () => {
  for (const options of [
    { anonymous: true }, { inactive: true }, { mock: true },
    { role: 'viewer' }, { memberRole: 'viewer' },
    { noWorkspace: true }, { wrongOrg: true }, { emptyMembership: true },
  ]) {
    const { module, calls } = setup(options);
    assert.equal(await module.getCurrentMessageSyncAudit(), null);
    assert.equal(calls.serviceClient, 0);
    assert.equal(calls.rpc.length, 0);
  }
});

test('owner/admin reads only active tenant aggregates, without provider or CRM mutations', async () => {
  for (const role of ['owner', 'admin']) {
    const { module, calls } = setup({ role });
    const original = process.env.INSTAGRAM_OUTBOUND_ECHO_ENABLED;
    delete process.env.INSTAGRAM_OUTBOUND_ECHO_ENABLED;
    try {
      const result = await module.getCurrentMessageSyncAudit();
      assert.equal(result.workspaceName, 'Example Workspace');
      assert.equal(result.audit.messages[0].storedCount, 9);
      assert.equal(result.instagramEchoEnabled, false);
      assert.equal(calls.rpc.length, 1);
      assert.deepEqual(calls.rpc[0], {
        name: 'get_message_sync_audit_v1', args: { p_organization_id: 'synthetic-org' },
      });
      assert.equal(calls.serviceClient, 1);
    } finally {
      if (original === undefined) delete process.env.INSTAGRAM_OUTBOUND_ECHO_ENABLED;
      else process.env.INSTAGRAM_OUTBOUND_ECHO_ENABLED = original;
    }
  }
});

test('audit RPC failures do not surface provider error details', async () => {
  const { module } = setup({ rpcError: true });
  await assert.rejects(module.getCurrentMessageSyncAudit(), /temporarily unavailable/);
});

test('migration is service-only, tenant-filtered and aggregates no customer content', () => {
  const sql = readFileSync('supabase/migrations/20261105080000_message_sync_audit_v1.sql', 'utf8');
  for (const fragment of [
    'security invoker',
    'where m.organization_id = p_organization_id',
    'and c.organization_id = m.organization_id',
    'where rep.organization_id = p_organization_id',
    'and re.organization_id = rep.organization_id',
    'where organization_id = p_organization_id',
    'grant execute on function public.get_message_sync_audit_v1(uuid)',
    'to service_role;',
    'from public, anon, authenticated;',
    'instagram_history_sync_cursor_v1',
  ]) assert.ok(sql.includes(fragment), fragment);
  assert.doesNotMatch(sql, /\bsecurity definer\b/i);
  assert.doesNotMatch(sql, /m\.body|raw_payload|access_token|phone_number|email_address|provider_secret/i);
  assert.doesNotMatch(sql, /\binsert\s+into\b|\bupdate\s+public\b|\bdelete\s+from\b|\bperform\s+http\b/i);
});

test('operations page is server-rendered read-only and linked from System Health', () => {
  const page = readFileSync('app/system-health/message-sync/page.tsx','utf8');
  const health = readFileSync('app/system-health/page.tsx','utf8');
  assert.match(page,/await getCurrentMessageSyncAudit\(\)/);
  assert.match(page,/if \(!result\) redirect\('\/dashboard'\)/);
  assert.match(page,/not verified provider delivery/);
  assert.match(page,/This flag does not prove that Meta subscribed/);
  assert.match(health,/href="\/system-health\/message-sync"/);
  assert.doesNotMatch(page,/use client|onClick=|fetch\(|sendMessage|replayEvents/);
});
