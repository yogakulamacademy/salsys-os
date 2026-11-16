import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { getCurrentWorkspaceContext } from '@/lib/workspace';
import {
  buildContentBriefEvidence,
  buildSeoVsAdsEvidence,
  ORGANIC_GROWTH_READ_ONLY_TOOLS,
  primaryTopicTerm,
  assessOrganicComparisonCoverage,
  summarizeGoogleAdsSyncHealth,
  type GoogleAdsSyncHealthRow,
  type OrganicGrowthToolName,
  type OrganicQueryRow,
  type KeywordPageRow,
  type PaidSearchTermRow,
} from './organic-growth-skills-core';

export { ORGANIC_GROWTH_READ_ONLY_TOOLS };

/**
 * Human-initiated, pilot-gated server tool dispatcher.
 * Not registered with the existing Co-Pilot and not mounted as an HTTP endpoint.
 * Never accepts tenant IDs, CRM lead IDs, provider tokens, or arbitrary SQL.
 *
 * A Claude orchestration loop may call this function only after its own
 * model/tool approval, tenant authorization and usage-budget gates have passed.
 */
export async function runOrganicGrowthReadOnlyTool(
  toolName: OrganicGrowthToolName,
  rawInput: unknown,
) {
  if (process.env.SALSYS_ORGANIC_GROWTH_SKILLS_PILOT !== 'true') {
    throw new Error('Organic Growth skill pilot is disabled.');
  }

  if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) {
    throw new Error('Invalid Organic Growth tool arguments.');
  }

  const input = rawInput as Record<string, unknown>;
  if (toolName === 'salsys_content_brief_evidence_v1') {
    const keys = Object.keys(input);
    if (keys.length !== 1 || keys[0] !== 'topic' ||
        typeof input.topic !== 'string' ||
        input.topic.trim().length < 3 || input.topic.trim().length > 120) {
      throw new Error('Content Brief requires a topic between 3 and 120 characters.');
    }
  } else if (toolName === 'salsys_seo_vs_ads_evidence_v1') {
    if (Object.keys(input).length !== 0) {
      throw new Error('SEO vs Ads does not accept user-supplied filters or credentials.');
    }
  } else {
    throw new Error('Unknown or unauthorized Organic Growth tool.');
  }

  // Fail closed before ANY analytics read if session/tenant role is missing.
  const supabase = await createClient();
  const workspace = await getCurrentWorkspaceContext(supabase);
  const active = workspace.activeWorkspace;
  if (!active || !workspace.activeOrganizationId ||
      active.organizationId !== workspace.activeOrganizationId ||
      !['owner', 'admin'].includes(active.role)) {
    throw new Error('You do not have access to Organic Growth intelligence.');
  }

  const organizationId = active.organizationId;

  // A user can lose access while an expensive analytics read is in flight.
  // Re-resolve the current workspace before returning ANY result to the caller.
  async function assertAccessStillActive() {
    const current = await getCurrentWorkspaceContext(supabase);
    const currentActive = current.activeWorkspace;
    if (!currentActive ||
        current.activeOrganizationId !== organizationId ||
        currentActive.organizationId !== organizationId ||
        !['owner', 'admin'].includes(currentActive.role)) {
      throw new Error('Organic Growth access changed while reading; no evidence was returned.');
    }
  }

  if (toolName === 'salsys_content_brief_evidence_v1') {
    const topic = (input.topic as string).trim();
    const term = primaryTopicTerm(topic);
    if (!term) {
      throw new Error('Content Brief requires a meaningful search topic.');
    }

    // The views already exist. Both queries carry an explicit tenant predicate
    // and execute through the authenticated client (no service-role bypass).
    const [queriesResult, pagesResult] = await Promise.all([
      supabase
        .from('v_seo_query_30d')
        .select('query,clicks,impressions,avg_position', { count: 'exact' })
        .eq('organization_id', organizationId)
        .ilike('query', '%' + term + '%')
        .order('impressions', { ascending: false })
        .limit(150),
      supabase
        .from('v_seo_keyword_intelligence_30d')
        .select('query,leader_page,clicks,impressions,avg_position,recommendation', { count: 'exact' })
        .eq('organization_id', organizationId)
        .ilike('query', '%' + term + '%')
        .order('impressions', { ascending: false })
        .limit(80),
    ]);
    if (queriesResult.error || pagesResult.error) {
      throw new Error('Search evidence is currently unavailable; no content brief has been generated.');
    }

    await assertAccessStillActive();
    return {
      ...buildContentBriefEvidence(
        topic,
        (queriesResult.data ?? []) as OrganicQueryRow[],
        (pagesResult.data ?? []) as KeywordPageRow[],
      ),
      sourceCoverage: {
        searchQueriesReturned: (queriesResult.data ?? []).length,
        searchQueriesReported: queriesResult.count,
        mappedPagesReturned: (pagesResult.data ?? []).length,
        mappedPagesReported: pagesResult.count,
        sourceCompletenessVerified:
          typeof queriesResult.count === 'number' &&
          typeof pagesResult.count === 'number' &&
          queriesResult.count === (queriesResult.data ?? []).length &&
          pagesResult.count === (pagesResult.data ?? []).length,
      },
    };
  }

  // Offset pagination is bounded, stable-sorted and count-checked. The
  // previous single 1,000-row read could silently omit legitimate queries.
  const PAGE_SIZE = 500;
  const MAX_SOURCE_ROWS = 3000;

  async function loadBoundedRows(
    table: 'v_seo_query_30d' | 'v_google_ads_search_term_30d',
    columns: string,
    orderColumn: 'impressions' | 'spend',
    termColumn: 'query' | 'search_term',
  ) {
    const rows: Record<string, unknown>[] = [];
    let expected: number | null = null;

    for (let offset = 0; offset < MAX_SOURCE_ROWS; offset += PAGE_SIZE) {
      let query = supabase
        .from(table)
        .select(columns, { count: 'exact' })
        .eq('organization_id', organizationId)
        .order(orderColumn, { ascending: false })
        .order(termColumn, { ascending: true });
      // Paid search terms can share both spend and text across campaigns.
      // Add the remaining GROUP BY dimensions for stable page boundaries.
      if (table === 'v_google_ads_search_term_30d') {
        query = query
          .order('customer_id', { ascending: true })
          .order('campaign_id', { ascending: true })
          .order('ad_group_id', { ascending: true });
      }
      const result = await query.range(offset, offset + PAGE_SIZE - 1);

      if (result.error) {
        throw new Error('Search reporting data is unavailable. No comparison has been generated.');
      }
      const nextCount = result.count;
      if (typeof nextCount !== 'number' || !Number.isSafeInteger(nextCount) ||
          nextCount < 0 || (expected !== null && expected !== nextCount)) {
        throw new Error('Search reporting row count changed or is not verifiable.');
      }
      expected = nextCount;
      const batch = (result.data ?? []) as unknown as Record<string, unknown>[];
      rows.push(...batch);
      if (batch.length < PAGE_SIZE || rows.length >= expected) break;
    }
    // When >MAX_SOURCE_ROWS, the caller receives an explicit partial marker
    // and all analytical candidates are withheld until coverage is complete.
    return { rows, expected };
  }

  const [organicResult, paidResult, adsHealthResult, gscHealthResult] =
    await Promise.all([
      loadBoundedRows('v_seo_query_30d',
        'query,clicks,impressions,avg_position', 'impressions', 'query'),
      loadBoundedRows('v_google_ads_search_term_30d',
        'search_term,currency_code,spend,clicks,conversions,campaign_id',
        'spend', 'search_term'),
      supabase
        .from('v_google_ads_sync_health')
        .select('last_sync_status,latest_data_date,last_sync_error')
        .eq('organization_id', organizationId)
        .maybeSingle(),
      supabase
        .from('v_gsc_sync_health')
        .select('latest_gsc_date')
        .eq('organization_id', organizationId)
        .maybeSingle(),
    ]);

  if (adsHealthResult.error || gscHealthResult.error) {
    throw new Error('Reporting source health is unavailable; comparison has not been generated.');
  }

  const sourceReadiness = summarizeGoogleAdsSyncHealth(
    (adsHealthResult.data ?? null) as GoogleAdsSyncHealthRow | null,
  );
  const sourceCoverage = assessOrganicComparisonCoverage({
    organicExpected: organicResult.expected,
    organicRead: organicResult.rows.length,
    paidExpected: paidResult.expected,
    paidRead: paidResult.rows.length,
    gscLatestDate: typeof gscHealthResult.data?.latest_gsc_date === 'string'
      ? gscHealthResult.data.latest_gsc_date : null,
    adsLatestDate: sourceReadiness.latestDataDate,
    adsSyncStatus: sourceReadiness.status,
    asOfDate: new Date().toISOString().slice(0, 10),
  });

  const evidence = buildSeoVsAdsEvidence(
    organicResult.rows as unknown as OrganicQueryRow[],
    paidResult.rows as unknown as PaidSearchTermRow[],
  );

  await assertAccessStillActive();
  const reviewable = sourceCoverage.comparisonReadiness === 'review_candidates_only';
  // Never surface overlap candidates from stale, partial or unhealthy data.
  return {
    ...evidence,
    status: reviewable ? evidence.status :
      evidence.status === 'insufficient_paid_evidence' ? evidence.status :
      'source_quality_blocked',
    overlap: reviewable ? evidence.overlap : [],
    paidWithoutObservedOrganic: reviewable ? evidence.paidWithoutObservedOrganic : [],
    counts: {
      ...evidence.counts,
      overlapCandidates: reviewable ? evidence.counts.overlapCandidates : 0,
    },
    sourceReadiness,
    sourceCoverage,
  };
}
