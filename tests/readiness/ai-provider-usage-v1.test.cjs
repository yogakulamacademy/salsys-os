const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { load } = require('./helpers.cjs');

const ORG='11111111-1111-4111-8111-111111111111';
const LEAD='22222222-2222-4222-8222-222222222222';
const CALL='33333333-3333-4333-8333-333333333333';

function setup(options = {}) {
  const previous = process.env.AI_LEAD_INSIGHTS_USAGE_LEDGER_ENABLED;
  process.env.AI_LEAD_INSIGHTS_USAGE_LEDGER_ENABLED = options.flagOff ? 'false' : 'true';
  const calls = { from: [], inserts: [], updates: [], access: [] };
  const session = {
    auth: { getUser: async () => ({
      data: { user: options.noUser ? null : { id:'synthetic-reviewer' } },
      error: null,
    }) },
    rpc: async (name, args) => {
      assert.equal(name, 'can_work_lead');
      assert.equal(args.p_lead_id, LEAD);
      calls.access.push(name);
      return { data: options.deny !== true, error: null };
    },
  };
  const admin = {
    from(table) {
      assert.equal(table, 'ai_lead_insight_provider_calls');
      calls.from.push(table);
      const filters = [];
      return {
        insert(value) {
          calls.inserts.push(value);
          return { select() { return { single: async () => (
            options.insertFails
              ? { data: null, error: { message: 'Synthetic source details' } }
              : { data: { id: CALL }, error: null }
          ) }; } };
        },
        update(value) {
          calls.updates.push(value);
          const chain = {
            eq(field, checkValue) { filters.push([field, checkValue]); return chain; },
            select() { return { single: async () => (
              options.updateFails ? { data: null, error: { message: 'Synthetic error' } }
                : { data: { id: options.invalidUpdatedId ? LEAD : CALL }, error: null }
            ) }; },
          };
          return chain;
        },
      };
    },
  };

  const api = load('lib/ai/lead-insight-provider-usage.ts', {
    'server-only': {},
    '@/lib/supabase/server': { createClient: async () => session },
    '@/lib/supabase/admin': { createAdminClient: () => admin },
    '@/lib/workspace': {
      requireCurrentOrganizationId: async () => options.wrongOrg ? LEAD : ORG,
    },
  });
  return {
    api, calls,
    restore() {
      if (previous === undefined) delete process.env.AI_LEAD_INSIGHTS_USAGE_LEDGER_ENABLED;
      else process.env.AI_LEAD_INSIGHTS_USAGE_LEDGER_ENABLED = previous;
    },
  };
}

test('provider calls cannot begin without the usage flag, session, tenant or lead permission', async () => {
  for (const options of [
    { flagOff:true }, { noUser:true }, { wrongOrg:true }, { deny:true },
  ]) {
    const f = setup(options);
    try {
      await assert.rejects(f.api.startLeadInsightProviderCall(ORG,LEAD,'test-sonnet'));
      assert.equal(f.calls.inserts.length, 0);
    } finally { f.restore(); }
  }
});

test('provider start inserts only metadata and completion records nullable token fields', async () => {
  const f = setup();
  try {
    const handle = await f.api.startLeadInsightProviderCall(ORG,LEAD,'test-sonnet');
    assert.equal(handle.id, CALL);
    assert.deepEqual(f.calls.inserts[0], {
      organization_id:ORG,
      lead_id:LEAD,
      requested_by:'synthetic-reviewer',
      model_name:'test-sonnet',
      outcome:'started',
    });

    await f.api.completeLeadInsightProviderCall(handle,'provider_completed',{
      httpStatus:200,
      usage:{
        input_tokens:230,
        output_tokens:85,
        cache_creation_input_tokens:0,
        cache_read_input_tokens:22,
      },
    });
    assert.equal(f.calls.updates[0].outcome,'provider_completed');
    assert.equal(f.calls.updates[0].http_status,200);
    assert.equal(f.calls.updates[0].input_tokens,230);
    assert.equal(f.calls.updates[0].output_tokens,85);
    assert.equal(f.calls.updates[0].cache_read_input_tokens,22);
    assert.ok(f.calls.updates[0].completed_at);
    assert.equal(typeof f.calls.updates[0].elapsed_ms, 'number');
    assert.doesNotMatch(JSON.stringify(f.calls.updates), /password|message body|customer notes/);
  } finally { f.restore(); }
});

test('missing and invalid usage counters remain unknown, not fabricated zero', async () => {
  const f = setup();
  try {
    assert.equal(f.api.safeTokenCount(undefined),null);
    assert.equal(f.api.safeTokenCount(-1),null);
    assert.equal(f.api.safeTokenCount(1.2),null);
    assert.equal(f.api.safeTokenCount('12'),null);
    assert.equal(f.api.safeTokenCount(0),0);
    const handle = await f.api.startLeadInsightProviderCall(ORG,LEAD,'test-sonnet');
    await f.api.completeLeadInsightProviderCall(handle,'http_error',{httpStatus:429});
    assert.equal(f.calls.updates[0].http_status,429);
    assert.equal(f.calls.updates[0].input_tokens,null);
    assert.equal(f.calls.updates[0].output_tokens,null);
  } finally { f.restore(); }
});

test('failed inserts and updates fail closed and never claim usage was logged', async () => {
  for(const options of [{insertFails:true},{updateFails:true},{invalidUpdatedId:true}]) {
    const f = setup(options);
    try {
      if(options.insertFails) {
        await assert.rejects(f.api.startLeadInsightProviderCall(ORG,LEAD,'test-sonnet'),/temporarily unavailable/);
      } else {
        const handle=await f.api.startLeadInsightProviderCall(ORG,LEAD,'test-sonnet');
        await assert.rejects(
          f.api.completeLeadInsightProviderCall(handle,'provider_completed',{}),
          /could not be verified/
        );
      }
    } finally { f.restore(); }
  }
});

test('SQL usage table has composite tenant FK, enforced RLS and no browser policies', () => {
  const sql=readFileSync('supabase/migrations/20261104233000_ai_lead_insight_provider_usage_v1.sql','utf8');
  for(const fragment of [
    'foreign key (organization_id, lead_id)',
    'force row level security',
    'enable row level security',
    'from public, anon, authenticated',
    'to service_role',
    'outcome in (',
    'cache_read_input_tokens',
  ])assert.ok(sql.includes(fragment),fragment);
  assert.doesNotMatch(sql,/create\s+policy\b/i);
  assert.doesNotMatch(sql,/prompt_text|message_body|raw_response|api_secret|provider_token/i);
});

test('provider monitoring summary preserves incomplete and truncated results', () => {
  const { summarizeProviderUsage } = load('lib/ai/lead-insight-provider-usage-summary.ts');
  const full = summarizeProviderUsage([
    {outcome:'provider_completed',input_tokens:100,output_tokens:55,cache_creation_input_tokens:20,cache_read_input_tokens:10},
    {outcome:'http_error',input_tokens:null,output_tokens:null,cache_creation_input_tokens:null,cache_read_input_tokens:null},
  ],2);
  assert.equal(full.calls,2);
  assert.equal(full.providerCompleted,1);
  assert.equal(full.nonCompleted,1);
  assert.equal(full.reportedInputTokens,100);
  assert.equal(full.reportedOutputTokens,55);
  assert.equal(full.tokenReadingsComplete,false);
  assert.equal(full.usageReported,1);
  assert.match(full.caveat,/not monetary spend/);

  const partial=summarizeProviderUsage([],500);
  assert.equal(partial.sampleTruncated,true);
  assert.equal(partial.reportedInputTokens,null);
});
