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

function mockGateway({
  role = 'owner', paidRows = [], organicRows = [], adsHealth = null,
  gscLatestDate = '2026-11-13', pageRows = [],
  enabled = true, queryError = false, revokeAfterFirst = false,
} = {}) {
  const reads = [];
  let authorizationChecks = 0;
  const client = {
    from(table) {
      const call = { table, eq: [], filters: [], ranges: [], countRequested: false };
      reads.push(call);
      const builder = {
        select(_columns, options) {
          call.countRequested = options?.count === 'exact';
          return builder;
        },
        eq(col, value) { call.eq.push([col, value]); return builder; },
        ilike(col, value) { call.filters.push([col, value]); return builder; },
        order() { return builder; },
        maybeSingle() {
          return Promise.resolve({
            data: table === 'v_gsc_sync_health'
              ? { latest_gsc_date: gscLatestDate }
              : adsHealth,
            error: queryError ? { message: 'synthetic error' } : null,
          });
        },
        limit(size) {
          const allRows = table === 'v_seo_query_30d' ? organicRows :
            table === 'v_seo_keyword_intelligence_30d' ? pageRows : paidRows;
          return Promise.resolve({
            data: allRows.slice(0, size), count: call.countRequested ? allRows.length : null,
            error: queryError ? { message: 'synthetic error' } : null,
          });
        },
        range(start, end) {
          call.ranges.push([start, end]);
          const allRows = table === 'v_seo_query_30d' ? organicRows : paidRows;
          return Promise.resolve({
            data: allRows.slice(start, end + 1),
            count: call.countRequested ? allRows.length : null,
            error: queryError ? { message: 'synthetic error' } : null,
          });
        },
      };
      return builder;
    },
  };
  const gateway = load('lib/ai/organic-growth-skills-gateway.ts', {
    'server-only': {},
    '@/lib/supabase/server': { createClient: async () => client },
    '@/lib/workspace': {
      getCurrentWorkspaceContext: async () => {
        authorizationChecks++;
        return {
          activeWorkspace: { organizationId: 'org-a', role: revokeAfterFirst && authorizationChecks > 1 ? 'employee' : role },
          activeOrganizationId: 'org-a',
        };
      },
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
      'v_google_ads_search_term_30d', 'v_google_ads_sync_health', 'v_gsc_sync_health', 'v_seo_query_30d',
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


test('Ads sync health reports known Cloud-project access blocker without leaking raw error', () => {
  const health = core.summarizeGoogleAdsSyncHealth({
    last_sync_status: 'failed',
    latest_data_date: '2026-10-04',
    last_sync_error: 'sensitive-contact@example.com: CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION token=private-test-value',
  });
  assert.equal(health.status, 'configuration_blocked');
  assert.equal(health.blockerCode, 'google_cloud_project_test_access');
  assert.equal(health.latestDataDate, '2026-10-04');
  assert.match(health.operatorNextStep, /Explorer/);
  assert.doesNotMatch(JSON.stringify(health), /sensitive-contact|private-test-value|token=/);
});

test('Ads sync health preserves failure without echoing unknown provider messages', () => {
  const health = core.summarizeGoogleAdsSyncHealth({
    last_sync_status: 'failed', latest_data_date: null, last_sync_error: 'private-provider-error',
  });
  assert.equal(health.status, 'sync_failed');
  assert.equal(health.blockerCode, 'google_ads_sync_failure');
  assert.doesNotMatch(JSON.stringify(health), /private-provider-error/);
});

test('Gateway returns sanitized provider health beside insufficient paid evidence', async () => {
  const f = mockGateway({
    organicRows: [{ query: 'yoga class', clicks: 3, impressions: 30, avg_position: 5 }],
    adsHealth: {
      last_sync_status: 'failed',
      latest_data_date: '2026-10-04',
      last_sync_error: 'sensitive@example.com CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION',
    },
  });
  try {
    const result = await f.run('salsys_seo_vs_ads_evidence_v1', {});
    assert.equal(result.status, 'insufficient_paid_evidence');
    assert.equal(result.sourceReadiness.blockerCode, 'google_cloud_project_test_access');
    assert.equal(result.sourceReadiness.latestDataDate, '2026-10-04');
    assert.doesNotMatch(JSON.stringify(result), /sensitive@example.com/);
  } finally { f.restore(); }
});


test('Gateway rechecks current tenant role after source reads and refuses revoked access', async () => {
  const f = mockGateway({
    revokeAfterFirst: true,
    organicRows: [{ query: 'yoga course', clicks: 7, impressions: 40, avg_position: 3 }],
  });
  try {
    await assert.rejects(
      f.run('salsys_seo_vs_ads_evidence_v1', {}),
      /access changed while reading/,
    );
    assert.equal(f.reads.length, 4);
  } finally { f.restore(); }
});


test('Coverage gate blocks stale and mismatched rows instead of claiming opportunity', () => {
  const stale = core.assessOrganicComparisonCoverage({
    organicExpected: 2, organicRead: 2, paidExpected: 1, paidRead: 1,
    gscLatestDate: '2026-11-13', adsLatestDate: '2026-10-04',
    adsSyncStatus: 'configuration_blocked', asOfDate: '2026-11-16',
  });
  assert.equal(stale.comparisonReadiness, 'blocked_incomplete_or_stale');
  assert.ok(stale.reasons.includes('ads_data_stale_or_unverified'));
  assert.ok(stale.reasons.includes('google_ads_sync_not_healthy'));
  assert.equal(stale.periodAlignmentVerified, false);

  const partial = core.assessOrganicComparisonCoverage({
    organicExpected: 1200, organicRead: 1000, paidExpected: 20, paidRead: 20,
    gscLatestDate: '2026-11-14', adsLatestDate: '2026-11-14',
    adsSyncStatus: 'last_sync_succeeded', asOfDate: '2026-11-16',
  });
  assert.equal(partial.comparisonReadiness, 'blocked_incomplete_or_stale');
  assert.equal(partial.rows.organicComplete, false);

  const recent = core.assessOrganicComparisonCoverage({
    organicExpected: 1200, organicRead: 1200, paidExpected: 20, paidRead: 20,
    gscLatestDate: '2026-11-14', adsLatestDate: '2026-11-14',
    adsSyncStatus: 'last_sync_succeeded', asOfDate: '2026-11-16',
  });
  assert.equal(recent.comparisonReadiness, 'review_candidates_only');
  assert.equal(recent.neverInferSavings, true);
  assert.equal(recent.periodAlignmentVerified, false);
});

test('Gateway paginates Search Console beyond first 1000 rows without dropping source terms', async () => {
  const today = new Date().toISOString().slice(0, 10);
  const organicRows = Array.from({ length: 1201 }, (_, i) => ({
    query: 'synthetic term ' + i, clicks: 3, impressions: 20, avg_position: 4,
  }));
  const f = mockGateway({
    organicRows,
    paidRows: [{ search_term: 'synthetic term 1200', currency_code: 'INR', spend: 200, clicks: 2, conversions: 0 }],
    gscLatestDate: today,
    adsHealth: { last_sync_status: 'success', latest_data_date: today, last_sync_error: null },
  });
  try {
    const result = await f.run('salsys_seo_vs_ads_evidence_v1', {});
    assert.equal(result.sourceCoverage.rows.organicRead, 1201);
    assert.equal(result.sourceCoverage.rows.organicComplete, true);
    assert.equal(result.sourceCoverage.comparisonReadiness, 'review_candidates_only');
    assert.equal(result.overlap.length, 1);
    assert.equal(result.overlap[0].query, 'synthetic term 1200');
    const organicReads = f.reads.filter(x => x.table === 'v_seo_query_30d');
    assert.equal(organicReads.length, 3);
    assert.deepEqual(organicReads.map(x => x.ranges[0][0]), [0, 500, 1000]);
    assert.ok(organicReads.every(x => x.countRequested));
  } finally { f.restore(); }
});

test('Gateway withholds candidates above bounded 3000-row source cap', async () => {
  const today = new Date().toISOString().slice(0, 10);
  const organicRows = Array.from({ length: 3200 }, (_, i) => ({
    query: 'synthetic yoga ' + i, clicks: 1, impressions: 2, avg_position: 4,
  }));
  const f = mockGateway({
    organicRows,
    paidRows: [{ search_term: 'synthetic yoga 2999', currency_code: 'INR', spend: 100, clicks: 2, conversions: 1 }],
    gscLatestDate: today,
    adsHealth: { last_sync_status: 'success', latest_data_date: today, last_sync_error: null },
  });
  try {
    const result = await f.run('salsys_seo_vs_ads_evidence_v1', {});
    assert.equal(result.status, 'source_quality_blocked');
    assert.equal(result.sourceCoverage.rows.organicRead, 3000);
    assert.equal(result.sourceCoverage.rows.organicReported, 3200);
    assert.deepEqual(result.overlap, []);
    assert.deepEqual(result.paidWithoutObservedOrganic, []);
  } finally { f.restore(); }
});

test('Content brief reports when matching query/page evidence was truncated', async () => {
  const topic = 'prenatal yoga';
  const synthetic = Array.from({ length: 181 }, (_, i) => ({
    query: 'prenatal yoga ' + i, clicks: 1, impressions: 3, avg_position: 5,
  }));
  const f = mockGateway({ organicRows: synthetic, pageRows: [] });
  try {
    const result = await f.run('salsys_content_brief_evidence_v1', { topic });
    assert.equal(result.sourceCoverage.searchQueriesReported, 181);
    assert.equal(result.sourceCoverage.searchQueriesReturned, 150);
    assert.equal(result.sourceCoverage.sourceCompletenessVerified, false);
  } finally { f.restore(); }
});
