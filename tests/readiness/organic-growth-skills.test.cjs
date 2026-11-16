const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./helpers.cjs');

const core = load('lib/ai/organic-growth-skills-core.ts');

test('SEO vs Ads refuses savings claims without paid evidence', () => {
  const result = core.buildSeoVsAdsEvidence(
    [{ query: 'online yoga training', clicks: 21, impressions: 900, avg_position: 3.1 }],
    [],
  );
  assert.equal(result.status, 'insufficient_paid_evidence');
  assert.deepEqual(result.overlap, []);
  assert.equal(result.estimatedSavings, null);
  assert.equal(result.estimatedWaste, null);
  assert.ok(result.limitations.some(item => /incrementality/i.test(item)));
});

test('SEO vs Ads normalizes exact terms but does not call overlap wasted spend', () => {
  const result = core.buildSeoVsAdsEvidence(
    [{ query: 'Yoga  Teacher Training', clicks: 42, impressions: 1000, avg_position: 2.4 }],
    [{ search_term: 'yoga teacher training', currency_code: 'INR', spend: 300, clicks: 12, conversions: 2, campaign_id: 'c1' }],
  );
  assert.equal(result.status, 'review_candidates_only');
  assert.equal(result.overlap.length, 1);
  assert.equal(result.overlap[0].organicAveragePosition, 2.4);
  assert.equal(result.overlap[0].paidSpend, 300);
  assert.equal(result.estimatedWaste, null);
  assert.equal(result.estimatedSavings, null);
  assert.equal(result.requiresHumanReview, true);
});

test('SEO vs Ads never combines currencies and missing GSC is not called no ranking', () => {
  const organic = [{ query: 'prenatal yoga', clicks: 9, impressions: 100, avg_position: 9.8 }];
  const paid = [
    { search_term: 'prenatal yoga', currency_code: 'INR', spend: 200, clicks: 7, conversions: 1, campaign_id: 'c1' },
    { search_term: 'prenatal yoga', currency_code: 'USD', spend: 5, clicks: 2, conversions: 0, campaign_id: 'c2' },
    { search_term: 'retreat in Kerala', currency_code: 'USD', spend: 8, clicks: 3, conversions: 0, campaign_id: 'c3' },
  ];
  const result = core.buildSeoVsAdsEvidence(organic, paid);
  assert.equal(result.overlap.length, 2);
  assert.deepEqual(result.overlap.map(x => x.currency).sort(), ['INR', 'USD']);
  assert.equal(result.paidWithoutObservedOrganic[0].query, 'retreat in kerala');
  assert.ok(result.limitations.some(s => /incomplete/.test(s)));
});

test('Content Brief returns evidence and no fabricated live SERP observations', () => {
  const output = core.buildContentBriefEvidence('prenatal yoga education', [
    { query: 'prenatal yoga online', clicks: 10, impressions: 200, avg_position: 8 },
    { query: 'real estate loan', clicks: 100, impressions: 800, avg_position: 3 },
  ], [
    { query: 'prenatal yoga online', leader_page: 'https://example.com/prenatal', clicks: 8, impressions: 120, avg_position: 9, recommendation: 'expand' },
  ]);
  assert.equal(output.status, 'evidence_available');
  assert.deepEqual(output.evidence.searchQueries.map(x => x.query), ['prenatal yoga online']);
  assert.equal(output.evidence.existingPages.length, 1);
  assert.equal(output.requiresHumanReview, true);
  assert.ok(output.limitations.some(s => /not checked a live SERP/.test(s)));
});

test('Content Brief treats absent keyword evidence as unknown', () => {
  const output = core.buildContentBriefEvidence('face yoga', [], []);
  assert.equal(output.status, 'insufficient_search_evidence');
  assert.deepEqual(output.evidence.searchQueries, []);
  assert.deepEqual(output.evidence.existingPages, []);
});

function mockGateway({ role = 'owner', paidRows = [], organicRows = [], enabled = true, queryError = false } = {}) {
  const reads = [];
  const client = {
    from(table) {
      const call = { table, eq: [], filters: [] };
      reads.push(call);
      const builder = {
        select() { return builder; },
        eq(col, value) { call.eq.push([col, value]); return builder; },
        ilike(col, value) { call.filters.push([col, value]); return builder; },
        order() { return builder; },
        limit() {
          const rows = table === 'v_seo_query_30d' ? organicRows : paidRows;
          return Promise.resolve({ data: rows, error: queryError ? { message: 'synthetic error' } : null });
        },
      };
      return builder;
    },
  };
  const gateway = load('lib/ai/organic-growth-skills-gateway.ts', {
    'server-only': {},
    '@/lib/supabase/server': { createClient: async () => client },
    '@/lib/workspace': {
      getCurrentWorkspaceContext: async () => ({
        activeWorkspace: { organizationId: 'org-a', role },
        activeOrganizationId: 'org-a',
      }),
    },
    './organic-growth-skills-core': core,
  });
  const previous = process.env.SALSYS_ORGANIC_GROWTH_SKILLS_PILOT;
  if (enabled) process.env.SALSYS_ORGANIC_GROWTH_SKILLS_PILOT = 'true';
  else delete process.env.SALSYS_ORGANIC_GROWTH_SKILLS_PILOT;
  return {
    reads, run: gateway.runOrganicGrowthReadOnlyTool,
    restore: () => {
      if (previous === undefined) delete process.env.SALSYS_ORGANIC_GROWTH_SKILLS_PILOT;
      else process.env.SALSYS_ORGANIC_GROWTH_SKILLS_PILOT = previous;
    },
  };
}

test('Gateway fails closed if pilot disabled, no database access', async () => {
  const f = mockGateway({ enabled: false });
  try {
    await assert.rejects(f.run('salsys_seo_vs_ads_evidence_v1', {}), /disabled/);
    assert.equal(f.reads.length, 0);
  } finally { f.restore(); }
});

test('Gateway denies staff role before querying analytics', async () => {
  const f = mockGateway({ role: 'employee' });
  try {
    await assert.rejects(f.run('salsys_seo_vs_ads_evidence_v1', {}), /do not have access/);
    assert.equal(f.reads.length, 0);
  } finally { f.restore(); }
});

test('Gateway only reads canonical organization-scoped views', async () => {
  const f = mockGateway({ organicRows: [{ query: 'yoga course', clicks: 2, impressions: 20, avg_position: 4 }] });
  try {
    const output = await f.run('salsys_seo_vs_ads_evidence_v1', {});
    assert.equal(output.status, 'insufficient_paid_evidence');
    assert.deepEqual(f.reads.map(x => x.table).sort(), [
      'v_google_ads_search_term_30d', 'v_seo_query_30d',
    ]);
    for (const read of f.reads) assert.deepEqual(read.eq, [['organization_id', 'org-a']]);
  } finally { f.restore(); }
});

test('Gateway refuses arbitrary tool parameters and fails closed on data errors', async () => {
  const f = mockGateway({ queryError: true });
  try {
    await assert.rejects(f.run('salsys_seo_vs_ads_evidence_v1', { organization_id: 'org-b' }), /does not accept/);
    assert.equal(f.reads.length, 0);
    await assert.rejects(f.run('salsys_seo_vs_ads_evidence_v1', {}), /unavailable/);
  } finally { f.restore(); }
});
