const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./helpers.cjs');

function form(overrides = {}) {
  const data = new FormData();
  const values = {
    title: 'Synthetic source-backed policy',
    category: 'policy',
    content: 'Synthetic source-backed content for readiness testing only.',
    source_name: 'Synthetic handbook',
    source_type: 'policy',
    source_uri: 'https://example.test/policy',
    valid_from: '2026-11-03T10:00',
    valid_until: '2026-11-03T11:00',
    intent: 'draft',
    ...overrides,
  };
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

function loadActions({ createClient, requireCurrentOrganizationId = async () => '10000000-0000-4000-8000-000000000001' }) {
  return load('app/settings/knowledge/actions.ts', {
    'next/cache': { revalidatePath() {} },
    'next/navigation': { redirect(url) { throw Error(url); } },
    '@/lib/config': { useMockData: false },
    '@/lib/supabase/server': { createClient },
    '@/lib/workspace': { requireCurrentOrganizationId },
    '@/lib/knowledge-evidence': { inspectKnowledgeMatches() { return { ok: true, matches: [], evidence: [] }; } },
  });
}

test('unsafe source URL is rejected before opening a database connection', async () => {
  let connections = 0;
  const actions = loadActions({ createClient: async () => { connections += 1; throw Error('must not connect'); } });
  await assert.rejects(actions.createKnowledgeDocumentAction(form({ source_uri: 'file:///tmp/private' })), /error=/);
  assert.equal(connections, 0);
});

test('invalid validity window is rejected before opening a database connection', async () => {
  let connections = 0;
  const actions = loadActions({ createClient: async () => { connections += 1; throw Error('must not connect'); } });
  await assert.rejects(actions.createKnowledgeDocumentAction(form({ valid_from: '2026-11-03T12:00', valid_until: '2026-11-03T11:00' })), /error=/);
  assert.equal(connections, 0);
});

test('valid source-backed knowledge uses one atomic provenance RPC with normalized UTC validity', async () => {
  const calls = [];
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: '20000000-0000-4000-8000-000000000001' } }, error: null }) },
    rpc: async (name, args) => {
      calls.push({ name, args });
      if (name === 'can_manage_organization') return { data: true, error: null };
      if (name === 'create_source_backed_knowledge_document_v2') return { data: { ok: true }, error: null };
      throw Error(`Unexpected RPC ${name}`);
    },
  };
  const actions = loadActions({ createClient: async () => client });

  await assert.rejects(actions.createKnowledgeDocumentAction(form()), /notice=/);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].name, 'can_manage_organization');
  assert.equal(calls[1].name, 'create_source_backed_knowledge_document_v2');
  assert.deepEqual(calls[1].args, {
    p_organization_id: '10000000-0000-4000-8000-000000000001',
    p_title: 'Synthetic source-backed policy',
    p_category: 'policy',
    p_content: 'Synthetic source-backed content for readiness testing only.',
    p_source_name: 'Synthetic handbook',
    p_source_type: 'policy',
    p_source_uri: 'https://example.test/policy',
    p_valid_from: '2026-11-03T10:00:00.000Z',
    p_valid_until: '2026-11-03T11:00:00.000Z',
    p_approve: false,
  });
});
