import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentWorkspaceContext } from '@/lib/workspace';
import { useMockData } from '@/lib/config';
import { summarizeInsightReviews, type InsightQualitySummary } from '@/lib/ai/lead-insight-quality';
import { daysAgoIso, observedPilotState, pilotPrerequisites, pilotRate, type PilotPrerequisite } from '@/lib/ai/pilot-readiness';

export type AiInsightPilotStatus = {
  observedAt: string;
  organizationName: string;
  readiness: 'blocked' | 'review_required';
  prerequisites: PilotPrerequisite[];
  tenantPolicy: {
    configured: boolean;
    enabled: boolean;
    organizationDailyLimit: number | null;
    userHourlyLimit: number | null;
  };
  usage: {
    attemptsToday: number;
    remainingToday: number | null;
    runReceipts7d: number;
    reviews7d: number;
    reviewCoveragePercent: number | null;
    reviewsSampleTruncated: boolean;
    quality: InsightQualitySummary;
  };
  retentionReview: {
    proposedThresholdDays: 90;
    receiptsOlderThanThreshold: number;
    quotaCountersOlderThanThreshold: number;
    cleanupEnabled: false;
  };
};

/**
 * Staff-only readout. A regular admissions/viewer session cannot reach any
 * service-role reads, and clients do not supply tenant IDs or see raw records.
 *
 * This is diagnostic-only: it neither enables AI nor changes tenant policies.
 */
export async function getAiInsightPilotStatus(): Promise<AiInsightPilotStatus | null> {
  if (useMockData) return null;

  const session = await createClient();
  const { data: { user }, error: authError } = await session.auth.getUser();
  if (authError || !user?.id) return null;

  const workspace = await getCurrentWorkspaceContext(session);
  const organizationId = workspace.activeOrganizationId;
  if (!organizationId || workspace.activeWorkspace?.organizationId !== organizationId) return null;
  if (!['owner', 'admin'].includes(workspace.activeWorkspace.role)) return null;

  // Read the current, session-authorized membership again to avoid trusting
  // a stale role from the workspace display resolver.
  const { data: membership, error: membershipError } = await session
    .from('organization_members')
    .select('role,active')
    .eq('organization_id', organizationId)
    .eq('user_id', user.id)
    .eq('active', true)
    .maybeSingle();

  if (membershipError || !membership || !['owner', 'admin'].includes(String(membership.role))) {
    return null;
  }

  const now = new Date();
  const dayStart = `${now.toISOString().slice(0, 10)}T00:00:00.000Z`;
  const sevenDays = daysAgoIso(now, 7);
  const ninetyDays = daysAgoIso(now, 90);
  const admin = createAdminClient();

  // Every privileged query is scoped to the already-verified organization.
  const [policy, today, runs, reviews, sample, oldRuns, oldQuotas] = await Promise.all([
    admin.from('ai_lead_insight_tenant_policies')
      .select('enabled,org_daily_limit,user_hourly_limit')
      .eq('organization_id', organizationId).maybeSingle(),
    admin.from('ai_lead_insight_quota_counters')
      .select('attempt_count')
      .eq('organization_id', organizationId)
      .eq('actor_key', '00000000-0000-0000-0000-000000000000')
      .eq('period_kind', 'org_day')
      .eq('period_start', dayStart).maybeSingle(),
    admin.from('ai_lead_insight_runs')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId).gte('created_at', sevenDays),
    admin.from('ai_lead_insight_reviews')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId).gte('created_at', sevenDays),
    admin.from('ai_lead_insight_reviews')
      .select('rating,issue_codes,run_id')
      .eq('organization_id', organizationId)
      .gte('created_at', sevenDays)
      .order('created_at', { ascending: false })
      .limit(500),
    admin.from('ai_lead_insight_runs')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId).lt('created_at', ninetyDays),
    admin.from('ai_lead_insight_quota_counters')
      .select('organization_id', { count: 'exact', head: true })
      .eq('organization_id', organizationId).lt('period_start', ninetyDays),
  ]);

  if (policy.error || today.error || runs.error || reviews.error ||
      sample.error || oldRuns.error || oldQuotas.error) {
    // Never convert a failed database read to a misleading zero.
    throw new Error('AI pilot operations status is temporarily unavailable.');
  }

  const config = policy.data;
  const attempts = Number(today.data?.attempt_count ?? 0);
  const dailyLimit = config ? Number(config.org_daily_limit) : null;
  const reviews7d = Number(reviews.count ?? 0);
  const runs7d = Number(runs.count ?? 0);
  const flags = {
    generationEnabled: process.env.AI_LEAD_INSIGHTS_ENABLED === 'true',
    uiEnabled: process.env.AI_LEAD_INSIGHTS_UI_ENABLED === 'true',
    quotasEnabled: process.env.AI_LEAD_INSIGHTS_QUOTAS_ENABLED === 'true',
    feedbackEnabled: process.env.AI_LEAD_INSIGHTS_FEEDBACK_ENABLED === 'true',
    modelConfigured: Boolean(process.env.ANTHROPIC_API_KEY?.trim() &&
      (process.env.ANTHROPIC_SONNET_MODEL?.trim() || process.env.ANTHROPIC_HAIKU_MODEL?.trim())),
    signingKeyConfigured: Boolean(process.env.AI_LEAD_INSIGHTS_CONTEXT_HMAC_KEY?.trim() &&
      (process.env.AI_LEAD_INSIGHTS_CONTEXT_HMAC_KEY?.trim().length ?? 0) >= 32),
    tenantOptedIn: config?.enabled === true,
    quotaPolicyPresent: config !== null,
  };

  const prerequisites = pilotPrerequisites(flags);
  const sampleRows = sample.data ?? [];
  const reviewsSampleTruncated = sampleRows.length === 500;
  const quality = summarizeInsightReviews(sampleRows.map(row => ({
    rating: row.rating,
    issue_codes: Array.isArray(row.issue_codes) ? row.issue_codes : [],
    run_id: row.run_id,
  })));

  return {
    observedAt: now.toISOString(),
    organizationName: workspace.activeWorkspace.organizationName,
    readiness: observedPilotState(prerequisites),
    prerequisites,
    tenantPolicy: {
      configured: config !== null,
      enabled: config?.enabled === true,
      organizationDailyLimit: dailyLimit,
      userHourlyLimit: config ? Number(config.user_hourly_limit) : null,
    },
    usage: {
      attemptsToday: attempts,
      remainingToday: dailyLimit === null ? null : Math.max(0, dailyLimit - attempts),
      runReceipts7d: runs7d,
      reviews7d,
      // Multiple reviewers can assess one run. Coverage uses unique run IDs
      // and stays unknown when the sample is truncated.
      reviewCoveragePercent: reviewsSampleTruncated ? null : pilotRate(quality.distinctRunsReviewed, runs7d),
      reviewsSampleTruncated,
      quality,
    },
    retentionReview: {
      proposedThresholdDays: 90,
      receiptsOlderThanThreshold: Number(oldRuns.count ?? 0),
      quotaCountersOlderThanThreshold: Number(oldQuotas.count ?? 0),
      cleanupEnabled: false,
    },
  };
}
