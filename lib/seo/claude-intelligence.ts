import 'server-only';

import { createHash } from 'node:crypto';

import { searchTenantSeoOpenSearch } from '@/lib/search/seo';
import { createAdminClient } from '@/lib/supabase/admin';

const PROMPT_VERSION = 'claude_seo_intelligence_v1';

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function asText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function extractClaudeJson(text: string) {
  const trimmed = text.trim().replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first < 0 || last <= first) throw new Error('CLAUDE_SEO_JSON_INVALID');
  const parsed = JSON.parse(trimmed.slice(first, last + 1));
  const record = asRecord(parsed);
  if (!record) throw new Error('CLAUDE_SEO_JSON_INVALID');
  return record;
}

function clampConfidence(value: unknown) {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.max(0, Math.min(number, 1));
}

function compactRows(rows: unknown[] | null | undefined, limit: number) {
  return (rows || []).slice(0, limit);
}

async function optionalOpenSearchEvidence(organizationId: string) {
  try {
    const result = await searchTenantSeoOpenSearch({ organizationId, mode: 'opportunity', size: 20 });
    return {
      available: true,
      items: result.items.slice(0, 20).map((item) => ({
        entity_type: item.entityType,
        entity_id: item.entityId,
        score: item.score,
        source: item.source,
      })),
    };
  } catch {
    return { available: false, items: [] as Array<Record<string, unknown>> };
  }
}

async function collectEvidence(organizationId: string) {
  const admin = createAdminClient();

  const [
    opportunities,
    contentGaps,
    aeoPages,
    geoPages,
    topicAuthority,
    openSearch,
  ] = await Promise.all([
    admin
      .from('v_seo_page_opportunity_engine_v1')
      .select('site_id,page_id,normalized_url,url_path,page_type,is_indexable,gsc_clicks,gsc_impressions,gsc_ctr,gsc_avg_position,ga4_sessions,ga4_engaged_sessions,ga4_key_events,crm_leads,crm_qualified_leads,crm_enrolled_leads,semantic_coverage_score_v1,semantic_topic_count,primary_topic_count,semantic_entity_count,technical_issue_count,high_technical_issues,medium_technical_issues,technical_issue_types,internal_link_opportunities,best_internal_link_score,opportunity_score_v1,opportunity_reasons')
      .eq('organization_id', organizationId)
      .order('opportunity_score_v1', { ascending: false })
      .limit(20),
    admin
      .from('v_seo_content_gap_intelligence_v1')
      .select('site_id,topic_id,canonical_key,topic_name,topic_type,mapped_pages,indexable_pages,query_count,gsc_clicks,gsc_impressions,gsc_avg_position,top_queries,gap_type,priority_score_v1,recommendation')
      .eq('organization_id', organizationId)
      .order('priority_score_v1', { ascending: false })
      .limit(20),
    admin
      .from('v_seo_aeo_page_readiness_v1')
      .select('site_id,page_id,normalized_url,url_path,page_type,title,is_indexable,word_count,schema_types,answer_heading_count,interrogative_heading_count,has_answer_sections,has_faq_schema,has_howto_schema,semantic_coverage_score_v1,semantic_topic_count,semantic_entity_count,answer_query_count,high_opportunity_query_count,answer_clicks,answer_impressions,best_answer_opportunity_score,answer_readiness_score_v1,answer_state,recommended_action,recommendation')
      .eq('organization_id', organizationId)
      .order('best_answer_opportunity_score', { ascending: false })
      .limit(15),
    admin
      .from('v_seo_geo_page_intelligence_v1')
      .select('site_id,page_id,normalized_url,url_path,page_type,title,is_indexable,word_count,schema_types,page_topic_count,page_entity_count,semantic_coverage_score_v1,answer_readiness_score_v1,answer_query_count,high_opportunity_answer_queries,ai_referral_sessions,ai_linked_leads,observed_ai_providers,generative_readiness_score_v1,geo_state,recommended_action,recommendation')
      .eq('organization_id', organizationId)
      .order('generative_readiness_score_v1', { ascending: true })
      .limit(15),
    admin
      .from('v_seo_topic_authority_v1')
      .select('topic_id,canonical_key,name,topic_type,mapped_pages,indexable_pages,avg_mapping_confidence,avg_prominence,gsc_clicks,gsc_impressions,ga4_sessions,crm_leads,crm_qualified_leads,crm_enrolled_leads,topical_authority_score_v1')
      .eq('organization_id', organizationId)
      .order('topical_authority_score_v1', { ascending: false })
      .limit(20),
    optionalOpenSearchEvidence(organizationId),
  ]);

  for (const result of [opportunities, contentGaps, aeoPages, geoPages, topicAuthority]) {
    if (result.error) throw new Error(`CLAUDE_SEO_EVIDENCE_QUERY_FAILED:${result.error.message}`);
  }

  return {
    generated_at: new Date().toISOString(),
    provider_limitations: {
      live_rank_provider_connected: false,
      competitor_rank_positions_available: false,
      ai_citation_positions_available: false,
      opensearch_context_available: openSearch.available,
      rule: 'Do not infer or invent live rankings, competitor positions, SERP features, or AI citations.',
    },
    page_opportunities: compactRows(opportunities.data, 20),
    content_gaps: compactRows(contentGaps.data, 20),
    aeo_pages: compactRows(aeoPages.data, 15),
    geo_pages: compactRows(geoPages.data, 15),
    topic_authority: compactRows(topicAuthority.data, 20),
    opensearch_opportunities: openSearch.items,
  };
}

function evidenceFingerprint(evidence: Record<string, unknown>) {
  return createHash('sha256').update(JSON.stringify(evidence)).digest('hex');
}

function normalizeOutput(parsed: Record<string, unknown>) {
  const findings = asArray(parsed.findings).slice(0, 12);
  const opportunities = asArray(parsed.opportunities).slice(0, 12);
  const actions = asArray(parsed.actions).slice(0, 12);
  const caveats = asArray(parsed.caveats).slice(0, 12);
  return {
    executive_summary: asText(parsed.executive_summary).slice(0, 4000),
    findings,
    opportunities,
    actions,
    caveats,
    ranking_evidence_status: 'unavailable_without_live_rank_provider',
    human_approval_required: true,
  };
}

export async function getLatestClaudeSeoIntelligence(organizationId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('seo_ai_analysis_runs')
    .select('id,analysis_type,target_kind,target_id,model_provider,model_name,prompt_version,status,output,confidence,started_at,completed_at,created_at')
    .eq('organization_id', organizationId)
    .eq('analysis_type', 'workspace_seo_intelligence')
    .eq('target_kind', 'workspace')
    .eq('target_id', 'seo-intelligence')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`CLAUDE_SEO_LATEST_FAILED:${error.message}`);
  return data;
}

export async function runClaudeSeoIntelligence(organizationId: string) {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  const model = process.env.ANTHROPIC_SONNET_MODEL?.trim();
  if (!key || !model) throw new Error('CLAUDE_NOT_CONFIGURED');

  const evidence = await collectEvidence(organizationId);
  const fingerprint = evidenceFingerprint(evidence);
  const admin = createAdminClient();
  const startedAt = new Date().toISOString();

  const { data: run, error: runError } = await admin
    .from('seo_ai_analysis_runs')
    .insert({
      organization_id: organizationId,
      site_id: null,
      analysis_type: 'workspace_seo_intelligence',
      target_kind: 'workspace',
      target_id: 'seo-intelligence',
      model_provider: 'anthropic',
      model_name: model,
      prompt_version: PROMPT_VERSION,
      status: 'running',
      input_fingerprint: fingerprint,
      output: {},
      started_at: startedAt,
    })
    .select('id')
    .single();
  if (runError || !run?.id) throw new Error(`CLAUDE_SEO_RUN_CREATE_FAILED:${runError?.message || 'unknown'}`);

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 3200,
        temperature: 0.15,
        system: [
          'You are the grounded SEO/AEO/GEO intelligence analyst inside SalsysOS.',
          'Use only the supplied evidence. Never invent rankings, traffic, conversions, revenue, competitors, SERP features, AI citations, URLs, or page ownership.',
          'Google Search Console average position is historical first-party evidence and must not be described as a current live rank.',
          'When live competitor/rank evidence is unavailable, say so explicitly and still analyze first-party SEO opportunity evidence.',
          'If OpenSearch context is unavailable, use the supplied PostgreSQL-derived first-party evidence and state the retrieval limitation only when relevant.',
          'Recommendations are advisory only. No publishing or customer-facing action is authorized.',
          'Return strict JSON only.',
        ].join(' '),
        messages: [{
          role: 'user',
          content: [
            'Analyze this tenant evidence and return one JSON object with:',
            'executive_summary (string);',
            'findings (array of objects with category, finding, evidence, confidence);',
            'opportunities (array of objects with priority 1-100, surface seo|aeo|geo, opportunity, why, target_url|null, evidence, confidence low|medium|high);',
            'actions (array of objects with priority 1-100, action, target_url|null, expected_signal, evidence, approval_required=true);',
            'caveats (array of strings).',
            'Only use target_url values present in the evidence. Do not claim live rank or competitor position because no live rank provider is connected.',
            `EVIDENCE: ${JSON.stringify(evidence)}`,
          ].join('\n'),
        }],
      }),
      signal: AbortSignal.timeout(60000),
    });

    if (!response.ok) throw new Error(`CLAUDE_REQUEST_FAILED_${response.status}`);
    const body = await response.json() as { content?: Array<{ type?: string; text?: string }> };
    const text = body.content?.find((item) => item.type === 'text')?.text || '';
    const parsed = extractClaudeJson(text);
    const output = normalizeOutput(parsed);
    const confidence = clampConfidence(parsed.confidence);
    const completedAt = new Date().toISOString();

    const { data: saved, error: saveError } = await admin
      .from('seo_ai_analysis_runs')
      .update({
        status: 'completed',
        output,
        confidence,
        completed_at: completedAt,
        error_message: null,
      })
      .eq('organization_id', organizationId)
      .eq('id', run.id)
      .select('id,analysis_type,target_kind,target_id,model_provider,model_name,prompt_version,status,output,confidence,started_at,completed_at,created_at')
      .single();
    if (saveError) throw new Error(`CLAUDE_SEO_RUN_SAVE_FAILED:${saveError.message}`);
    return saved;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'CLAUDE_SEO_ANALYSIS_FAILED';
    await admin
      .from('seo_ai_analysis_runs')
      .update({ status: 'failed', error_message: message.slice(0, 500), completed_at: new Date().toISOString() })
      .eq('organization_id', organizationId)
      .eq('id', run.id);
    throw error;
  }
}
