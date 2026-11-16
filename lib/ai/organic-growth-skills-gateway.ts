import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { getCurrentWorkspaceContext } from '@/lib/workspace';
import {
  buildContentBriefEvidence,
  buildSeoVsAdsEvidence,
  ORGANIC_GROWTH_READ_ONLY_TOOLS,
  primaryTopicTerm,
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
        .select('query,clicks,impressions,avg_position')
        .eq('organization_id', organizationId)
        .ilike('query', '%' + term + '%')
        .order('impressions', { ascending: false })
        .limit(150),
      supabase
        .from('v_seo_keyword_intelligence_30d')
        .select('query,leader_page,clicks,impressions,avg_position,recommendation')
        .eq('organization_id', organizationId)
        .ilike('query', '%' + term + '%')
        .order('impressions', { ascending: false })
        .limit(80),
    ]);
    if (queriesResult.error || pagesResult.error) {
      throw new Error('Search evidence is currently unavailable; no content brief has been generated.');
    }

    await assertAccessStillActive();
    return buildContentBriefEvidence(
      topic,
      (queriesResult.data ?? []) as OrganicQueryRow[],
      (pagesResult.data ?? []) as KeywordPageRow[],
    );
  }

  const [organicResult, paidResult, adsHealthResult] = await Promise.all([
    supabase
      .from('v_seo_query_30d')
      .select('query,clicks,impressions,avg_position')
      .eq('organization_id', organizationId)
      .order('impressions', { ascending: false })
      .limit(1000),
    supabase
      .from('v_google_ads_search_term_30d')
      .select('search_term,currency_code,spend,clicks,conversions,campaign_id')
      .eq('organization_id', organizationId)
      .order('spend', { ascending: false })
      .limit(1000),
    supabase
      .from('v_google_ads_sync_health')
      .select('last_sync_status,latest_data_date,last_sync_error')
      .eq('organization_id', organizationId)
      .maybeSingle(),
  ]);

  if (organicResult.error || paidResult.error || adsHealthResult.error) {
    throw new Error('Organic or paid search evidence is unavailable; comparison has not been generated.');
  }

  const evidence = buildSeoVsAdsEvidence(
    (organicResult.data ?? []) as OrganicQueryRow[],
    (paidResult.data ?? []) as PaidSearchTermRow[],
  );
  await assertAccessStillActive();
  // Raw provider error strings are read only for server-side classification.
  // Return the allowlisted blocker code, never upstream error text.
  return {
    ...evidence,
    sourceReadiness: summarizeGoogleAdsSyncHealth(
      (adsHealthResult.data ?? null) as GoogleAdsSyncHealthRow | null,
    ),
  };
}
