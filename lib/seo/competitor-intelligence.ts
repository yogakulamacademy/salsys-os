import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';

export type SeoSurface = 'seo' | 'aeo' | 'geo';

function asText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function safeDomain(value: string) {
  const input = value.trim().toLowerCase();
  if (!input) throw new Error('SEO_COMPETITOR_DOMAIN_REQUIRED');
  try {
    const url = new URL(input.includes('://') ? input : `https://${input}`);
    return url.hostname.replace(/^www\./, '');
  } catch {
    throw new Error('SEO_COMPETITOR_DOMAIN_INVALID');
  }
}

export async function getCompetitorIntelligence(organizationId: string) {
  const admin = createAdminClient();
  const [competitors, targets, latest, analyses] = await Promise.all([
    admin.from('seo_competitors').select('id,domain,display_name,competitor_type,is_active,source,created_at').eq('organization_id', organizationId).order('created_at', { ascending: true }),
    admin.from('seo_rank_targets').select('id,query,surface,locale,country_code,device,engine,priority,check_interval_minutes,last_checked_at,next_check_at,is_active').eq('organization_id', organizationId).order('priority', { ascending: false }),
    admin.from('v_seo_rank_latest_v1').select('*').eq('organization_id', organizationId).order('priority', { ascending: false }),
    admin.from('seo_competitor_analysis_runs').select('id,status,provider,model,summary,gaps,recommendations,evidence,created_at,completed_at').eq('organization_id', organizationId).order('created_at', { ascending: false }).limit(5),
  ]);

  for (const result of [competitors, targets, latest, analyses]) {
    if (result.error) throw new Error(`SEO_COMPETITOR_QUERY_FAILED:${result.error.message}`);
  }

  return {
    competitors: competitors.data ?? [],
    targets: targets.data ?? [],
    latest: latest.data ?? [],
    analyses: analyses.data ?? [],
    rank_provider_configured: Boolean(process.env.SEO_RANKING_API_URL && process.env.SEO_RANKING_API_KEY),
    claude_configured: Boolean(process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_SONNET_MODEL),
  };
}

export async function addCompetitor(input: { organizationId: string; domain: string; displayName?: string; competitorType?: string }) {
  const admin = createAdminClient();
  const domain = safeDomain(input.domain);
  const type = ['organic','commercial','content','local','ai_visibility'].includes(input.competitorType || '') ? input.competitorType : 'organic';
  const { data, error } = await admin.from('seo_competitors').upsert({
    organization_id: input.organizationId,
    domain,
    display_name: asText(input.displayName) || null,
    competitor_type: type,
    source: 'manual',
    is_active: true,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'organization_id,domain' }).select('id,domain,display_name,competitor_type,is_active').single();
  if (error) throw new Error(`SEO_COMPETITOR_SAVE_FAILED:${error.message}`);
  return data;
}

export async function addRankTarget(input: {
  organizationId: string;
  query: string;
  surface: SeoSurface;
  locale?: string;
  countryCode?: string;
  device?: 'desktop' | 'mobile';
  engine?: string;
  priority?: number;
  intervalMinutes?: number;
}) {
  const query = asText(input.query);
  if (query.length < 2 || query.length > 300) throw new Error('SEO_RANK_QUERY_INVALID');
  if (!['seo','aeo','geo'].includes(input.surface)) throw new Error('SEO_RANK_SURFACE_INVALID');
  const admin = createAdminClient();
  const interval = Math.max(60, Math.min(input.intervalMinutes || 360, 10080));
  const { data, error } = await admin.from('seo_rank_targets').upsert({
    organization_id: input.organizationId,
    query,
    surface: input.surface,
    locale: asText(input.locale) || 'en-IN',
    country_code: asText(input.countryCode).toUpperCase() || 'IN',
    device: input.device === 'mobile' ? 'mobile' : 'desktop',
    engine: asText(input.engine) || (input.surface === 'geo' ? 'ai' : 'google'),
    priority: Math.max(1, Math.min(input.priority || 50, 100)),
    check_interval_minutes: interval,
    next_check_at: new Date().toISOString(),
    is_active: true,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'organization_id,query,surface,locale,country_code,device,engine' }).select('*').single();
  if (error) throw new Error(`SEO_RANK_TARGET_SAVE_FAILED:${error.message}`);
  return data;
}

function extractClaudeJson(text: string) {
  const trimmed = text.trim().replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first < 0 || last <= first) throw new Error('CLAUDE_JSON_INVALID');
  return JSON.parse(trimmed.slice(first, last + 1)) as Record<string, unknown>;
}

export async function runClaudeCompetitorAnalysis(organizationId: string, userId?: string) {
  const key = process.env.ANTHROPIC_API_KEY;
  const model = process.env.ANTHROPIC_SONNET_MODEL;
  if (!key || !model) throw new Error('CLAUDE_NOT_CONFIGURED');

  const context = await getCompetitorIntelligence(organizationId);
  const payload = {
    competitors: context.competitors,
    rankings: context.latest.slice(0, 100),
  };

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 2400,
      temperature: 0.2,
      system: 'You are the SEO/AEO/GEO competitor analyst inside SalsysOS. Use only supplied evidence. Never invent rankings, traffic, citations, competitor capabilities or revenue. Distinguish observed facts from recommendations. Return strict JSON only.',
      messages: [{
        role: 'user',
        content: `Analyze the supplied SEO/AEO/GEO ranking evidence and competitors. Return JSON with keys summary (object), gaps (array), recommendations (array). Each recommendation must contain surface, priority 1-100, action, why, competitor_advantage, expected_signal, confidence (low|medium|high), and evidence. Focus on how to outperform observed competitors without unsupported claims. DATA: ${JSON.stringify(payload)}`,
      }],
    }),
    signal: AbortSignal.timeout(45000),
  });

  if (!response.ok) throw new Error(`CLAUDE_REQUEST_FAILED_${response.status}`);
  const body = await response.json() as { content?: Array<{ type?: string; text?: string }> };
  const text = body.content?.find((item) => item.type === 'text')?.text || '';
  const parsed = extractClaudeJson(text);

  const admin = createAdminClient();
  const { data, error } = await admin.from('seo_competitor_analysis_runs').insert({
    organization_id: organizationId,
    status: 'completed',
    scope: 'seo_aeo_geo',
    provider: 'anthropic',
    model,
    competitor_ids: context.competitors.map((item: any) => item.id),
    summary: parsed.summary && typeof parsed.summary === 'object' ? parsed.summary : {},
    gaps: Array.isArray(parsed.gaps) ? parsed.gaps : [],
    recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
    evidence: { ranking_targets: context.latest.length, competitors: context.competitors.length },
    created_by: userId || null,
    started_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
  }).select('id,status,provider,model,summary,gaps,recommendations,evidence,created_at').single();
  if (error) throw new Error(`SEO_COMPETITOR_ANALYSIS_SAVE_FAILED:${error.message}`);
  return data;
}

export async function runRankingCheck(input: { organizationId: string; targetId: string }) {
  const url = process.env.SEO_RANKING_API_URL;
  const key = process.env.SEO_RANKING_API_KEY;
  if (!url || !key) throw new Error('SEO_RANK_PROVIDER_NOT_CONFIGURED');
  const admin = createAdminClient();
  const { data: target, error } = await admin.from('seo_rank_targets').select('*').eq('organization_id', input.organizationId).eq('id', input.targetId).single();
  if (error || !target) throw new Error('SEO_RANK_TARGET_NOT_FOUND');

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({ query: target.query, surface: target.surface, locale: target.locale, country_code: target.country_code, device: target.device, engine: target.engine }),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`SEO_RANK_PROVIDER_FAILED_${response.status}`);
  const result = await response.json() as Record<string, unknown>;

  const snapshot = {
    organization_id: input.organizationId,
    target_id: target.id,
    source_provider: asText(result.provider) || 'external_rank_provider',
    own_position: typeof result.own_position === 'number' ? result.own_position : null,
    own_url: asText(result.own_url) || null,
    own_title: asText(result.own_title) || null,
    answer_visibility: typeof result.answer_visibility === 'boolean' ? result.answer_visibility : null,
    ai_cited: typeof result.ai_cited === 'boolean' ? result.ai_cited : null,
    ai_citation_position: typeof result.ai_citation_position === 'number' ? result.ai_citation_position : null,
    ai_provider: asText(result.ai_provider) || null,
    competitor_results: Array.isArray(result.competitor_results) ? result.competitor_results : [],
    serp_features: Array.isArray(result.serp_features) ? result.serp_features : [],
    raw_reference: {},
  };
  const { data: saved, error: saveError } = await admin.from('seo_rank_snapshots').insert(snapshot).select('*').single();
  if (saveError) throw new Error(`SEO_RANK_SAVE_FAILED:${saveError.message}`);
  await admin.from('seo_rank_targets').update({
    last_checked_at: new Date().toISOString(),
    next_check_at: new Date(Date.now() + Number(target.check_interval_minutes || 360) * 60000).toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('organization_id', input.organizationId).eq('id', target.id);
  return saved;
}
