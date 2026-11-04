import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireCurrentOrganizationId } from '@/lib/workspace';

/**
 * Server-only record of an attempted Anthropic request.
 * Every provider call must be preceded by a successfully inserted row.
 * This record tracks usage (not a USD charge or estimated billing).
 */
export type ProviderCallOutcome =
  | 'provider_completed' | 'http_error' | 'transport_error' | 'invalid_response';

export type ProviderUsageCounts = {
  input_tokens?: unknown;
  output_tokens?: unknown;
  cache_creation_input_tokens?: unknown;
  cache_read_input_tokens?: unknown;
};

export type ProviderCallHandle = {
  id: string;
  organizationId: string;
  leadId: string;
  startedAtMs: number;
};

export function safeTokenCount(value: unknown): number | null {
  return typeof value === 'number' &&
    Number.isSafeInteger(value) && value >= 0 && value <= 1_000_000_000
    ? value : null;
}

function safeHttpStatus(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 100 && value <= 599
    ? value : null;
}

export async function startLeadInsightProviderCall(
  organizationId: string,
  leadId: string,
  model: string,
): Promise<ProviderCallHandle> {
  if (process.env.AI_LEAD_INSIGHTS_USAGE_LEDGER_ENABLED !== 'true') {
    throw new Error('AI provider usage monitoring is not enabled.');
  }
  if (!model.trim() || model.length > 120) {
    throw new Error('Invalid AI provider model.');
  }

  // Privileged insert is forbidden until the current user, workspace and
  // this specific lead have all passed their own access checks.
  const session = await createClient();
  const { data: { user }, error: authError } = await session.auth.getUser();
  if (authError || !user?.id) {
    throw new Error('AI provider usage authorization is unavailable.');
  }
  const activeOrganizationId = await requireCurrentOrganizationId(session, user.id);
  if (activeOrganizationId !== organizationId) {
    throw new Error('AI provider usage authorization is unavailable.');
  }
  const { data: leadAllowed, error: leadError } = await session.rpc('can_work_lead', {
    p_lead_id: leadId,
  });
  if (leadError || leadAllowed !== true) {
    throw new Error('AI provider usage authorization is unavailable.');
  }

  const startedAtMs = Date.now();
  const { data, error } = await createAdminClient().from('ai_lead_insight_provider_calls')
    .insert({
      organization_id: organizationId,
      lead_id: leadId,
      requested_by: user.id,
      model_name: model,
      outcome: 'started',
    })
    .select('id').single();

  if (error || !data?.id) {
    throw new Error('AI provider usage monitoring is temporarily unavailable.');
  }

  return { id: String(data.id), organizationId, leadId, startedAtMs };
}

export async function completeLeadInsightProviderCall(
  handle: ProviderCallHandle,
  outcome: ProviderCallOutcome,
  options: { httpStatus?: unknown; usage?: ProviderUsageCounts | null },
): Promise<void> {
  if (process.env.AI_LEAD_INSIGHTS_USAGE_LEDGER_ENABLED !== 'true') {
    throw new Error('AI provider usage monitoring is not enabled.');
  }

  const elapsedMs = Math.max(0, Math.min(120000, Date.now() - handle.startedAtMs));
  const usage = options.usage || {};
  const { data, error } = await createAdminClient().from('ai_lead_insight_provider_calls')
    .update({
      outcome,
      http_status: safeHttpStatus(options.httpStatus),
      input_tokens: safeTokenCount(usage.input_tokens),
      output_tokens: safeTokenCount(usage.output_tokens),
      cache_creation_input_tokens: safeTokenCount(usage.cache_creation_input_tokens),
      cache_read_input_tokens: safeTokenCount(usage.cache_read_input_tokens),
      completed_at: new Date().toISOString(),
      elapsed_ms: elapsedMs,
    })
    .eq('id', handle.id)
    .eq('organization_id', handle.organizationId)
    .eq('lead_id', handle.leadId)
    .eq('outcome', 'started')
    .select('id').single();

  if (error || data?.id !== handle.id) {
    throw new Error('AI provider usage completion could not be verified.');
  }
}
