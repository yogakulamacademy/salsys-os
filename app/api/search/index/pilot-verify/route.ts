import { NextRequest, NextResponse } from 'next/server';

import { stageClaudeSeoRecommendationAsDraft } from '@/lib/seo/claude-experiment-staging';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const ALLOWED_BRANCH = 'feature/claude-seo-intelligence-v1';
const PILOT_SLUG = 'yogakulam-academy';
const FOREIGN_SLUG = 'test-yoga-school';
const ANALYSIS_RUN_ID = 'b8a1d074-9aee-4326-8d07-b7ea88b967e2';
const ACTION_INDEX = 0;
const PROBE = 'claude-stage-v1-2b87f1c43d09';

async function resolveOrganization(slug: string) {
  const admin = createAdminClient();
  const { data, error } = await admin.from('organizations').select('id').eq('slug', slug).maybeSingle();
  if (error || !data?.id) throw new Error(`ORGANIZATION_NOT_FOUND:${slug}`);
  return String(data.id);
}

async function resolveCreator(organizationId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('organization_members')
    .select('user_id,role')
    .eq('organization_id', organizationId)
    .eq('active', true)
    .in('role', ['owner', 'admin', 'manager'])
    .limit(1)
    .maybeSingle();
  if (error || !data?.user_id) throw new Error('PILOT_CREATOR_NOT_FOUND');
  return String(data.user_id);
}

export async function GET(request: NextRequest) {
  if (
    process.env.VERCEL_ENV === 'production' ||
    process.env.VERCEL_GIT_COMMIT_REF !== ALLOWED_BRANCH ||
    request.nextUrl.searchParams.get('probe') !== PROBE
  ) {
    return NextResponse.json({ ok: false, error: 'Not found.' }, { status: 404 });
  }

  try {
    const admin = createAdminClient();
    const [organizationId, foreignOrganizationId] = await Promise.all([
      resolveOrganization(PILOT_SLUG),
      resolveOrganization(FOREIGN_SLUG),
    ]);
    const creatorId = await resolveCreator(organizationId);

    const first = await stageClaudeSeoRecommendationAsDraft({
      organizationId,
      analysisRunId: ANALYSIS_RUN_ID,
      recommendationIndex: ACTION_INDEX,
      createdBy: creatorId,
    });

    const second = await stageClaudeSeoRecommendationAsDraft({
      organizationId,
      analysisRunId: ANALYSIS_RUN_ID,
      recommendationIndex: ACTION_INDEX,
      createdBy: creatorId,
    });

    let foreignBlocked = false;
    let foreignError = '';
    try {
      await stageClaudeSeoRecommendationAsDraft({
        organizationId: foreignOrganizationId,
        analysisRunId: ANALYSIS_RUN_ID,
        recommendationIndex: ACTION_INDEX,
        createdBy: creatorId,
      });
    } catch (error) {
      foreignError = error instanceof Error ? error.message : 'unknown';
      foreignBlocked = foreignError === 'CLAUDE_STAGE_ANALYSIS_NOT_FOUND';
    }

    const { data: experiment, error: experimentError } = await admin
      .from('seo_experiments')
      .select('id,organization_id,status,source_layer,source_action,source_reference,target_page_id,target_url,start_at,end_at,completed_at,cancelled_at,created_by')
      .eq('organization_id', organizationId)
      .eq('id', first.experimentId)
      .single();
    if (experimentError || !experiment) throw new Error('EXPERIMENT_VERIFY_FAILED');

    const { data: links, error: linkError } = await admin
      .from('seo_ai_recommendation_links')
      .select('id,organization_id,analysis_run_id,recommendation_index,experiment_id,evidence_fingerprint,prompt_version')
      .eq('organization_id', organizationId)
      .eq('analysis_run_id', ANALYSIS_RUN_ID)
      .eq('recommendation_index', ACTION_INDEX);
    if (linkError) throw new Error('LINK_VERIFY_FAILED');

    const { count: foreignExperimentCount, error: foreignCountError } = await admin
      .from('seo_experiments')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', foreignOrganizationId)
      .contains('source_reference', { analysis_run_id: ANALYSIS_RUN_ID });
    if (foreignCountError) throw new Error('FOREIGN_EXPERIMENT_VERIFY_FAILED');

    const sameExperiment = first.experimentId === second.experimentId;
    const oneLink = Array.isArray(links) && links.length === 1;
    const draftOnly = experiment.status === 'draft'
      && experiment.start_at === null
      && experiment.end_at === null
      && experiment.completed_at === null
      && experiment.cancelled_at === null;
    const provenanceSafe = experiment.source_layer === 'claude_seo_intelligence_v1'
      && experiment.source_action === 'workspace_action'
      && String((experiment.source_reference as Record<string, unknown> | null)?.analysis_run_id || '') === ANALYSIS_RUN_ID;

    const ok = first.created === true
      && second.created === false
      && sameExperiment
      && oneLink
      && draftOnly
      && provenanceSafe
      && foreignBlocked
      && Number(foreignExperimentCount || 0) === 0;

    return NextResponse.json({
      ok,
      first: { created: first.created, experimentId: first.experimentId, status: first.experimentStatus },
      retry: { created: second.created, sameExperiment },
      experiment: {
        status: experiment.status,
        sourceLayer: experiment.source_layer,
        sourceAction: experiment.source_action,
        targetPageBound: Boolean(experiment.target_page_id),
        targetUrl: experiment.target_url,
        started: experiment.start_at !== null,
        completed: experiment.completed_at !== null,
        cancelled: experiment.cancelled_at !== null,
      },
      linkage: { count: Array.isArray(links) ? links.length : 0, oneLink },
      adversarialForeignTenant: {
        blocked: foreignBlocked,
        error: foreignError,
        experimentCount: Number(foreignExperimentCount || 0),
      },
      guardrails: {
        draftOnly,
        provenanceSafe,
        automaticPublishing: false,
        executionStarted: false,
      },
    }, { status: ok ? 200 : 207, headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : 'CLAUDE_STAGE_VERIFY_FAILED',
    }, { status: 503, headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } });
  }
}
