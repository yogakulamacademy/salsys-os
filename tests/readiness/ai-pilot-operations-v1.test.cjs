const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { load } = require('./helpers.cjs');

const pure = load('lib/ai/pilot-readiness.ts');
const quality = load('lib/ai/lead-insight-quality.ts');

test('pilot is never automatically approved even when all deployment flags are on', () => {
  const prerequisites = pure.pilotPrerequisites({
    generationEnabled: true,
    uiEnabled: true,
    quotasEnabled: true,
    feedbackEnabled: true,
    modelConfigured: true,
    signingKeyConfigured: true,
    tenantOptedIn: true,
    quotaPolicyPresent: true,
  });
  assert.equal(pure.observedPilotState(prerequisites), 'review_required');
  for (const key of ['privacy', 'quality', 'cost']) {
    assert.equal(prerequisites.find(x => x.key === key).state, 'review_required');
  }
});

test('pilot is blocked when disabled and ratio never implies accuracy without data', () => {
  const state = pure.pilotPrerequisites({
    generationEnabled: false,
    uiEnabled: false,
    quotasEnabled: false,
    feedbackEnabled: false,
    modelConfigured: false,
    signingKeyConfigured: false,
    tenantOptedIn: false,
    quotaPolicyPresent: false,
  });
  assert.equal(pure.observedPilotState(state), 'blocked');
  assert.equal(pure.pilotRate(0, 0), null);
  assert.equal(pure.pilotRate(5, 2), null);
  assert.equal(pure.pilotRate(1, 2), 50);
});

function setup(options = {}) {
  const oldEnv = {
    AI_LEAD_INSIGHTS_ENABLED: process.env.AI_LEAD_INSIGHTS_ENABLED,
    AI_LEAD_INSIGHTS_UI_ENABLED: process.env.AI_LEAD_INSIGHTS_UI_ENABLED,
    AI_LEAD_INSIGHTS_QUOTAS_ENABLED: process.env.AI_LEAD_INSIGHTS_QUOTAS_ENABLED,
    AI_LEAD_INSIGHTS_FEEDBACK_ENABLED: process.env.AI_LEAD_INSIGHTS_FEEDBACK_ENABLED,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    ANTHROPIC_SONNET_MODEL: process.env.ANTHROPIC_SONNET_MODEL,
    AI_LEAD_INSIGHTS_CONTEXT_HMAC_KEY: process.env.AI_LEAD_INSIGHTS_CONTEXT_HMAC_KEY,
  };
  for (const key of Object.keys(oldEnv)) delete process.env[key];
  const calls = { admin: 0, tables: [], queries: [] };

  const session = {
    auth: { getUser: async () => ({
      data: { user: options.noUser ? null : { id: 'test-user' } },
      error: null,
    }) },
    from(table) {
      assert.equal(table, 'organization_members');
      return {
        select() { return this; },
        eq() { return this; },
        maybeSingle: async () => ({ data: {
          role: options.memberRole ?? 'admin', active: true,
        }, error: null }),
      };
    },
  };

  function makeQuery(table) {
    const filters = [];
    let head = false;
    let older = false;
    const query = {
      select(_cols, opts) { head = opts?.head === true; return query; },
      eq(key, value) { filters.push([key, value]); return query; },
      gte() { return query; },
      lt() { older = true; return query; },
      order() { return query; },
      limit() { return query; },
      maybeSingle() { return Promise.resolve(response()); },
      then(resolve, reject) { return Promise.resolve(response()).then(resolve, reject); },
    };
    function response() {
      calls.queries.push({ table, filters, head, older });
      if (!filters.some(([key, value]) => key === 'organization_id' && value === 'org-1')) {
        throw Error('Unscoped privileged table read: ' + table);
      }
      if (options.failedTable === table) return { data: null, error: { message: 'Secret data error' }, count: null };
      if (table === 'ai_lead_insight_tenant_policies') {
        return { data: options.policy ?? null, error: null };
      }
      if (table === 'ai_lead_insight_quota_counters' && !head) {
        return { data: options.today ? { attempt_count: options.today } : null, error: null };
      }
      if (table === 'ai_lead_insight_runs') {
        if (head) return { data: null, count: older ? (options.oldRuns ?? 0) : (options.runs ?? 0), error: null };
        return { data: options.runRows ?? [], error: null };
      }
      if (table === 'ai_lead_insight_reviews') {
        if (head) return { data: null, count: options.reviews ?? 0, error: null };
        return { data: options.reviewRows ?? [], error: null };
      }
      if (table === 'ai_lead_insight_quota_counters' && head) {
        return { data: null, count: options.oldQuotas ?? 0, error: null };
      }
      throw Error('Unexpected table');
    }
    return query;
  }

  const source = load('lib/ai/pilot-status.ts', {
    'server-only': {},
    '@/lib/supabase/server': { createClient: async () => session },
    '@/lib/supabase/admin': { createAdminClient: () => {
      calls.admin += 1;
      return { from: table => { calls.tables.push(table); return makeQuery(table); } };
    } },
    '@/lib/workspace': { getCurrentWorkspaceContext: async () => ({
      activeOrganizationId: options.otherWorkspace ? 'org-2' : 'org-1',
      activeWorkspace: {
        organizationId: 'org-1', organizationName: 'Synthetic Workspace',
        role: options.workspaceRole ?? 'admin',
      },
    }) },
    '@/lib/config': { useMockData: Boolean(options.mock) },
    '@/lib/ai/lead-insight-quality': quality,
    '@/lib/ai/pilot-readiness': pure,
  });

  return {
    status: source.getAiInsightPilotStatus,
    calls,
    restore() {
      for (const [key, value] of Object.entries(oldEnv)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    },
  };
}

test('unauthenticated, non-admin, stale-role, and mock users cannot access admin data', async () => {
  for (const options of [
    { noUser: true }, { workspaceRole: 'viewer' },
    { workspaceRole: 'admissions' }, { memberRole: 'viewer' },
    { otherWorkspace: true }, { mock: true },
  ]) {
    const f = setup(options);
    try {
      assert.equal(await f.status(), null);
      assert.equal(f.calls.admin, 0);
    } finally { f.restore(); }
  }
});

test('owner/admin reads are active-tenant scoped and empty results are not guessed', async () => {
  const f = setup();
  try {
    const result = await f.status();
    assert.equal(result.readiness, 'blocked');
    assert.equal(result.tenantPolicy.configured, false);
    assert.equal(result.usage.attemptsToday, 0);
    assert.equal(result.usage.reviewCoveragePercent, null);
    assert.equal(result.retentionReview.cleanupEnabled, false);
    assert.equal(f.calls.admin, 1);
    assert.ok(f.calls.tables.length >= 7);
    assert.doesNotMatch(JSON.stringify(result), /test-user|ANTHROPIC_API_KEY|secret/);
  } finally { f.restore(); }
});

test('coverage uses only reviewed runs generated in the same seven-day cohort', async () => {
  const f = setup({
    policy: { enabled: false, org_daily_limit: 12, user_hourly_limit: 3 },
    today: 4,
    runs: 2, reviews: 3,
    runRows: [{ id: 'run-1' }, { id: 'run-2' }],
    reviewRows: [
      { rating: 'accurate', issue_codes: [], run_id: 'run-1' },
      { rating: 'partially_accurate', issue_codes: [], run_id: 'run-1' },
      { rating: 'unsure', issue_codes: [], run_id: 'old-run' },
    ],
  });
  try {
    const result = await f.status();
    assert.equal(result.usage.attemptsToday, 4);
    assert.equal(result.usage.remainingToday, 8);
    assert.equal(result.usage.reviewCoveragePercent, 50);
    assert.equal(result.usage.reviews7d, 3);
    assert.equal(result.usage.quality.distinctRunsReviewed, 2);
  } finally { f.restore(); }
});

test('a failed privileged query fails closed, rather than displaying misleading zero usage', async () => {
  const f = setup({ failedTable: 'ai_lead_insight_reviews' });
  try {
    await assert.rejects(f.status(), /temporarily unavailable/);
  } finally { f.restore(); }
});

test('UI has no activation, payment mutation, secret display or client-side quota bypass', () => {
  const page = readFileSync('app/settings/ai-insights/page.tsx', 'utf8');
  const server = readFileSync('lib/ai/pilot-status.ts', 'utf8');
  const settings = readFileSync('app/settings/page.tsx', 'utf8');
  assert.match(page, /getAiInsightPilotStatus/);
  assert.match(page, /notFound\(\)/);
  assert.match(page, /Read only/);
  assert.match(settings, /settings\/ai-insights/);
  assert.match(server, /\['owner', 'admin'\]/);
  assert.match(server, /\.eq\('organization_id', organizationId\)/);
  assert.doesNotMatch(page, /'use client'|activate|toggle|setEnabled|enableTenant/);
  assert.doesNotMatch(server, /\.insert\(|\.update\(|\.delete\(|\.upsert\(/);
});
