import 'server-only';

import { createHash } from 'node:crypto';

import { createAdminClient } from '@/lib/supabase/admin';

export type AiVisibilityProbeKind =
  | 'brand_visibility'
  | 'answer_visibility'
  | 'recommendation_visibility';

type RunProbeInput = {
  organizationId: string;
  siteId?: string | null;
  probeKind: AiVisibilityProbeKind;
  promptText: string;
  locale?: string | null;
  countryCode?: string | null;
  createdBy?: string | null;
};

type ClaudeProbeOutput = {
  answer?: unknown;
  recommendations?: unknown;
};

type ClaudeRecommendation = {
  name: string;
  url: string | null;
};

const DETECTION_VERSION = 'r9_visibility_probe_v1';

const CLAUDE_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    answer: { type: 'string' },
    recommendations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          url: { anyOf: [{ type: 'string' }, { type: 'null' }] },
        },
        required: ['name', 'url'],
        additionalProperties: false,
      },
    },
  },
  required: ['answer', 'recommendations'],
  additionalProperties: false,
} as const;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeHost(value: string) {
  return value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
}

function normalizeForMatch(value: string) {
  return value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function deriveAliases(organizationName: string, hostname: string | null) {
  const aliases = new Set<string>();
  const normalizedName = normalizeForMatch(organizationName);
  if (normalizedName.length >= 4) aliases.add(normalizedName);

  if (hostname) {
    const host = normalizeHost(hostname);
    if (host.length >= 4) aliases.add(normalizeForMatch(host));
    const rootLabel = host.split('.')[0] || '';
    if (rootLabel.length >= 4) aliases.add(normalizeForMatch(rootLabel));
  }

  return [...aliases].filter(Boolean).sort((a, b) => b.length - a.length);
}

function countAliasMatches(text: string, aliases: string[]) {
  const normalized = normalizeForMatch(text);
  if (!normalized) return 0;

  let count = 0;
  for (const alias of aliases) {
    if (!alias) continue;
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
    const matches = normalized.match(new RegExp(`(^|\\s)${escaped}(?=\\s|$)`, 'g'));
    count += matches?.length || 0;
  }
  return count;
}

function recommendationMatchesBrand(item: ClaudeRecommendation, aliases: string[], hostname: string | null) {
  const nameMatches = countAliasMatches(item.name, aliases) > 0;
  if (nameMatches) return true;

  if (!hostname || !item.url) return false;
  const normalizedHost = normalizeHost(hostname);
  try {
    return normalizeHost(new URL(item.url).hostname) === normalizedHost;
  } catch {
    return normalizeHost(item.url) === normalizedHost;
  }
}

function parseRecommendations(value: unknown): ClaudeRecommendation[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 20).flatMap((item) => {
    const record = asRecord(item);
    if (!record) return [];
    const name = normalizeText(record.name).slice(0, 500);
    if (!name) return [];
    const rawUrl = normalizeText(record.url);
    return [{ name, url: rawUrl ? rawUrl.slice(0, 2000) : null }];
  });
}

function parseClaudeJson(text: string): ClaudeProbeOutput {
  const trimmed = text.trim().replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
  const parsed = JSON.parse(trimmed);
  const record = asRecord(parsed);
  if (!record) throw new Error('AI_VISIBILITY_PROBE_JSON_INVALID');
  return record;
}

async function getProbeContext(organizationId: string, siteId?: string | null) {
  const admin = createAdminClient();
  const { data: organization, error: organizationError } = await admin
    .from('organizations')
    .select('id,name')
    .eq('id', organizationId)
    .single();

  if (organizationError || !organization) {
    throw new Error(`AI_VISIBILITY_ORGANIZATION_FAILED:${organizationError?.message || 'not_found'}`);
  }

  let site: { id: string; hostname: string } | null = null;
  if (siteId) {
    const { data, error } = await admin
      .from('organization_sites')
      .select('id,hostname')
      .eq('organization_id', organizationId)
      .eq('id', siteId)
      .single();
    if (error || !data) throw new Error(`AI_VISIBILITY_SITE_FAILED:${error?.message || 'not_found'}`);
    site = data;
  } else {
    const { data, error } = await admin
      .from('organization_sites')
      .select('id,hostname')
      .eq('organization_id', organizationId)
      .eq('status', 'active')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`AI_VISIBILITY_SITE_FAILED:${error.message}`);
    site = data || null;
  }

  return {
    organizationName: normalizeText(organization.name),
    siteId: site?.id || null,
    hostname: site?.hostname || null,
  };
}

export async function getLatestAiVisibilityProbe(organizationId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('seo_ai_visibility_probe_runs')
    .select('id,site_id,provider,model_name,probe_kind,prompt_text,locale,country_code,status,requested_at,started_at,completed_at,error_message,metadata,created_at')
    .eq('organization_id', organizationId)
    .order('requested_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`AI_VISIBILITY_LATEST_FAILED:${error.message}`);
  if (!data) return null;

  const { data: observation, error: observationError } = await admin
    .from('seo_ai_visibility_observations')
    .select('id,observed_at,brand_mentioned,brand_recommended,mention_count,recommendation_position,response_excerpt,evidence_hash,evidence_payload')
    .eq('organization_id', organizationId)
    .eq('run_id', data.id)
    .order('observed_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (observationError) throw new Error(`AI_VISIBILITY_OBSERVATION_FAILED:${observationError.message}`);
  return { ...data, observation: observation || null };
}

export async function runClaudeAiVisibilityProbe(input: RunProbeInput) {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  const model = process.env.ANTHROPIC_SONNET_MODEL?.trim();
  if (!key || !model) throw new Error('CLAUDE_NOT_CONFIGURED');

  const promptText = input.promptText.trim();
  if (!promptText || promptText.length > 4000) throw new Error('AI_VISIBILITY_PROMPT_INVALID');

  const context = await getProbeContext(input.organizationId, input.siteId);
  const aliases = deriveAliases(context.organizationName, context.hostname);
  if (aliases.length === 0) throw new Error('AI_VISIBILITY_BRAND_IDENTITY_UNAVAILABLE');

  const admin = createAdminClient();
  const startedAt = new Date().toISOString();
  const { data: run, error: runError } = await admin
    .from('seo_ai_visibility_probe_runs')
    .insert({
      organization_id: input.organizationId,
      site_id: context.siteId,
      provider: 'anthropic',
      model_name: model,
      probe_kind: input.probeKind,
      prompt_text: promptText,
      locale: input.locale?.trim() || null,
      country_code: input.countryCode?.trim().toUpperCase().slice(0, 2) || null,
      status: 'running',
      requested_at: startedAt,
      started_at: startedAt,
      created_by: input.createdBy || null,
      metadata: {
        detection_version: DETECTION_VERSION,
        citation_evidence_supported: false,
        prompt_injected_brand_identity: false,
      },
    })
    .select('id')
    .single();

  if (runError || !run?.id) {
    throw new Error(`AI_VISIBILITY_RUN_CREATE_FAILED:${runError?.message || 'unknown'}`);
  }

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
        max_tokens: 2400,
        output_config: {
          format: {
            type: 'json_schema',
            schema: CLAUDE_OUTPUT_SCHEMA,
          },
        },
        system: [
          'You are responding to a visibility measurement probe.',
          'Answer the user prompt naturally using your existing model knowledge only.',
          'Do not browse the web, invent sources, or claim citations.',
          'The recommendations array must contain only organizations, brands, products, services, or resources you explicitly recommend in the answer, in the same order they are recommended.',
          'If the answer contains no explicit recommendations, return an empty recommendations array.',
          'Do not add an entity to recommendations merely because it is mentioned.',
        ].join(' '),
        messages: [{ role: 'user', content: promptText }],
      }),
      signal: AbortSignal.timeout(90000),
    });

    if (!response.ok) throw new Error(`CLAUDE_REQUEST_FAILED_${response.status}`);
    const body = await response.json() as {
      id?: string;
      stop_reason?: string;
      content?: Array<{ type?: string; text?: string }>;
    };
    if (body.stop_reason === 'max_tokens') throw new Error('AI_VISIBILITY_OUTPUT_TRUNCATED');

    const rawText = (body.content || [])
      .filter((item) => item.type === 'text' && typeof item.text === 'string')
      .map((item) => item.text || '')
      .join('')
      .trim();
    if (!rawText) throw new Error('AI_VISIBILITY_EMPTY_OUTPUT');

    const parsed = parseClaudeJson(rawText);
    const answer = normalizeText(parsed.answer);
    const recommendations = parseRecommendations(parsed.recommendations);
    const answerMentionCount = countAliasMatches(answer, aliases);
    const matchingRecommendationIndex = recommendations.findIndex((item) =>
      recommendationMatchesBrand(item, aliases, context.hostname),
    );
    const recommendationMentionCount = recommendations.reduce(
      (sum, item) => sum + countAliasMatches(`${item.name} ${item.url || ''}`, aliases),
      0,
    );
    const mentionCount = answerMentionCount + recommendationMentionCount;
    const brandRecommended = matchingRecommendationIndex >= 0;
    const brandMentioned = mentionCount > 0 || brandRecommended;
    const observedAt = new Date().toISOString();
    const evidenceHash = createHash('sha256').update(rawText).digest('hex');

    const { data: observation, error: observationError } = await admin
      .from('seo_ai_visibility_observations')
      .insert({
        organization_id: input.organizationId,
        run_id: run.id,
        observed_at: observedAt,
        brand_mentioned: brandMentioned,
        brand_recommended: brandRecommended,
        mention_count: mentionCount,
        recommendation_position: brandRecommended ? matchingRecommendationIndex + 1 : null,
        response_excerpt: answer.slice(0, 2000) || null,
        evidence_hash: evidenceHash,
        evidence_payload: {
          detection_version: DETECTION_VERSION,
          provider_response_id: body.id || null,
          stop_reason: body.stop_reason || null,
          aliases_used: aliases,
          hostname: context.hostname,
          recommendations,
          citation_evidence_supported: false,
          prompt_injected_brand_identity: false,
        },
      })
      .select('id,observed_at,brand_mentioned,brand_recommended,mention_count,recommendation_position,response_excerpt,evidence_hash,evidence_payload')
      .single();

    if (observationError || !observation) {
      throw new Error(`AI_VISIBILITY_OBSERVATION_SAVE_FAILED:${observationError?.message || 'unknown'}`);
    }

    const completedAt = new Date().toISOString();
    const { error: completeError } = await admin
      .from('seo_ai_visibility_probe_runs')
      .update({ status: 'completed', completed_at: completedAt, error_message: null })
      .eq('organization_id', input.organizationId)
      .eq('id', run.id);
    if (completeError) throw new Error(`AI_VISIBILITY_RUN_COMPLETE_FAILED:${completeError.message}`);

    return {
      runId: run.id,
      provider: 'anthropic',
      modelName: model,
      probeKind: input.probeKind,
      siteId: context.siteId,
      hostname: context.hostname,
      observation,
      guardrails: {
        promptInjectedBrandIdentity: false,
        citationEvidenceSupported: false,
        deterministicBrandMatching: true,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'AI_VISIBILITY_PROBE_FAILED';
    await admin
      .from('seo_ai_visibility_probe_runs')
      .update({
        status: 'failed',
        error_message: message.slice(0, 500),
        completed_at: new Date().toISOString(),
      })
      .eq('organization_id', input.organizationId)
      .eq('id', run.id);
    throw error;
  }
}
