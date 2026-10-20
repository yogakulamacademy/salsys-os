import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { getInstagramRuntimeForOrganization } from '@/lib/integrations/instagram-connection';

const DEFAULT_INSTAGRAM_API_VERSION = 'v26.0';
const STOP_WORDS = new Set(['stop', 'unsubscribe', 'cancel', 'opt out', 'opt-out']);

type RuleRow = {
  id: string;
  trigger_type: string;
  match_mode: 'contains_any' | 'exact_any' | 'any';
  keywords: string[] | null;
  response_text: string;
  requires_human_approval: boolean;
  priority: number;
};

type QueueDmInput = {
  organizationId: string;
  rawEventId: string;
  sourceEventId: string;
  leadId: string;
  conversationId: string;
  instagramAccountId: string;
  instagramUserId: string;
  messageType: string;
  body: string | null;
  triggerType?: string;
};

type QueueCommentInput = {
  organizationId: string;
  rawEventId: string;
  sourceEventId: string;
  instagramAccountId: string;
  commentId: string;
  body: string | null;
};

function apiVersion() {
  const configured = process.env.INSTAGRAM_API_VERSION?.trim();
  return configured && /^v\d+\.\d+$/.test(configured)
    ? configured
    : DEFAULT_INSTAGRAM_API_VERSION;
}

function normalizeText(value: string | null | undefined) {
  return (value ?? '')
    .normalize('NFKC')
    .toLocaleLowerCase('en')
    .replace(/\s+/g, ' ')
    .trim();
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function matchesRule(rule: RuleRow, body: string | null) {
  const normalized = normalizeText(body);
  if (rule.match_mode === 'any') return true;
  if (!normalized) return false;

  const keywords = (rule.keywords ?? [])
    .map((keyword) => normalizeText(keyword))
    .filter(Boolean);

  if (!keywords.length) return false;
  if (rule.match_mode === 'exact_any') {
    return keywords.some((keyword) => normalized === keyword);
  }

  return keywords.some((keyword) => normalized.includes(keyword));
}

async function policyRequiresApproval(organizationId: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from('instagram_channel_policies')
    .select('requires_human_approval')
    .eq('organization_id', organizationId)
    .maybeSingle();

  return data?.requires_human_approval !== false;
}

async function firstMatchingRule(
  organizationId: string,
  triggerType: string,
  body: string | null,
) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('instagram_automation_rules')
    .select('id,trigger_type,match_mode,keywords,response_text,requires_human_approval,priority')
    .eq('organization_id', organizationId)
    .eq('active', true)
    .eq('trigger_type', triggerType)
    .order('priority', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) throw new Error(`Unable to load Instagram automation rules: ${error.message}`);

  return ((data ?? []) as RuleRow[]).find((rule) => matchesRule(rule, body)) ?? null;
}

export function isInstagramStopRequest(body: string | null | undefined) {
  return STOP_WORDS.has(normalizeText(body));
}

export async function suppressInstagramUser(
  organizationId: string,
  instagramUserId: string,
  reason = 'customer_stop_request',
) {
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { error } = await admin
    .from('instagram_channel_preferences')
    .upsert(
      {
        organization_id: organizationId,
        instagram_user_id: instagramUserId,
        suppressed: true,
        suppression_reason: reason,
        suppressed_at: now,
      },
      { onConflict: 'organization_id,instagram_user_id' },
    );

  if (error) throw new Error(`Unable to suppress Instagram recipient: ${error.message}`);
}

export async function queueInstagramDmAutomation(input: QueueDmInput) {
  if (isInstagramStopRequest(input.body)) {
    await suppressInstagramUser(input.organizationId, input.instagramUserId);
    return { ok: true as const, suppressed: true as const, queued: false as const };
  }

  const triggerType =
    input.triggerType ??
    (input.messageType === 'story_mention'
      ? 'story_mention'
      : input.messageType === 'postback'
        ? 'postback'
        : input.messageType === 'referral'
          ? 'referral'
          : 'dm_keyword');

  const rule = await firstMatchingRule(input.organizationId, triggerType, input.body);
  if (!rule) return { ok: true as const, queued: false as const };

  const requiresApproval =
    rule.requires_human_approval || (await policyRequiresApproval(input.organizationId));
  const status = requiresApproval ? 'pending_approval' : 'queued';
  const idempotencyKey = `instagram:${rule.id}:${input.sourceEventId}`;
  const admin = createAdminClient();

  const { data, error } = await admin
    .from('instagram_automation_runs')
    .upsert(
      {
        organization_id: input.organizationId,
        rule_id: rule.id,
        raw_event_id: input.rawEventId,
        source_event_id: input.sourceEventId,
        trigger_type: triggerType,
        lead_id: input.leadId,
        conversation_id: input.conversationId,
        instagram_account_id: input.instagramAccountId,
        instagram_user_id: input.instagramUserId,
        response_text: rule.response_text,
        status,
        human_approved: false,
        idempotency_key: idempotencyKey,
      },
      { onConflict: 'organization_id,idempotency_key', ignoreDuplicates: true },
    )
    .select('id,status')
    .maybeSingle();

  if (error) throw new Error(`Unable to queue Instagram automation: ${error.message}`);
  return { ok: true as const, queued: Boolean(data?.id), runId: data?.id ?? null, status };
}

export async function queueInstagramCommentAutomation(input: QueueCommentInput) {
  const rule = await firstMatchingRule(input.organizationId, 'comment_keyword', input.body);
  if (!rule) return { ok: true as const, queued: false as const };

  const requiresApproval =
    rule.requires_human_approval || (await policyRequiresApproval(input.organizationId));
  const status = requiresApproval ? 'pending_approval' : 'queued';
  const idempotencyKey = `instagram:${rule.id}:${input.sourceEventId}`;
  const admin = createAdminClient();

  const { data, error } = await admin
    .from('instagram_automation_runs')
    .upsert(
      {
        organization_id: input.organizationId,
        rule_id: rule.id,
        raw_event_id: input.rawEventId,
        source_event_id: input.sourceEventId,
        trigger_type: 'comment_keyword',
        instagram_account_id: input.instagramAccountId,
        comment_id: input.commentId,
        response_text: rule.response_text,
        status,
        human_approved: false,
        idempotency_key: idempotencyKey,
      },
      { onConflict: 'organization_id,idempotency_key', ignoreDuplicates: true },
    )
    .select('id,status')
    .maybeSingle();

  if (error) throw new Error(`Unable to queue Instagram comment automation: ${error.message}`);
  return { ok: true as const, queued: Boolean(data?.id), runId: data?.id ?? null, status };
}

async function sendInstagramAutomationRun(
  organizationId: string,
  runId: string,
) {
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { data: claimData, error: claimError } = await admin.rpc(
    'claim_instagram_automation_run_v1',
    { p_organization_id: organizationId, p_run_id: runId, p_now: now },
  );

  if (claimError) {
    return { ok: false as const, runId, error: claimError.message };
  }

  const claim = objectValue(claimData);
  if (claim.claimed !== true) {
    return {
      ok: true as const,
      runId,
      sent: false as const,
      reason: stringValue(claim.reason) || 'not_claimed',
    };
  }

  const accountId = stringValue(claim.instagram_account_id);
  const triggerType = stringValue(claim.trigger_type);
  const userId = stringValue(claim.instagram_user_id);
  const commentId = stringValue(claim.comment_id);
  const responseText = stringValue(claim.response_text);
  const leadId = stringValue(claim.lead_id);
  const conversationId = stringValue(claim.conversation_id);

  try {
    const runtime = await getInstagramRuntimeForOrganization(organizationId, accountId);
    const recipient = triggerType === 'comment_keyword'
      ? { comment_id: commentId }
      : { id: userId };

    if ((triggerType === 'comment_keyword' && !commentId) ||
        (triggerType !== 'comment_keyword' && !userId) || !responseText) {
      throw new Error('Instagram automation run is missing recipient or message data.');
    }

    const response = await fetch(
      `https://graph.instagram.com/${apiVersion()}/${encodeURIComponent(runtime.accountId)}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${runtime.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ recipient, message: { text: responseText } }),
        cache: 'no-store',
      },
    );

    const responseTextRaw = await response.text();
    let providerPayload: Record<string, unknown> = {};
    try {
      providerPayload = responseTextRaw ? JSON.parse(responseTextRaw) as Record<string, unknown> : {};
    } catch {
      providerPayload = {};
    }

    const providerMessageId = stringValue(providerPayload.message_id);
    const providerRecipientId = stringValue(providerPayload.recipient_id);
    if (!response.ok || !providerMessageId) {
      const errorObject = objectValue(providerPayload.error);
      const providerError = stringValue(errorObject.message) || `Instagram returned HTTP ${response.status}.`;
      await admin.rpc('finalize_instagram_automation_run_v1', {
        p_organization_id: organizationId,
        p_run_id: runId,
        p_success: false,
        p_provider_message_id: null,
        p_provider_recipient_id: null,
        p_provider_response: providerPayload,
        p_provider_error: providerError,
        p_now: new Date().toISOString(),
      });
      return { ok: false as const, runId, error: providerError };
    }

    await admin.rpc('finalize_instagram_automation_run_v1', {
      p_organization_id: organizationId,
      p_run_id: runId,
      p_success: true,
      p_provider_message_id: providerMessageId,
      p_provider_recipient_id: providerRecipientId || null,
      p_provider_response: providerPayload,
      p_provider_error: null,
      p_now: new Date().toISOString(),
    });

    if (triggerType !== 'comment_keyword' && leadId && conversationId) {
      const { data: logged, error: logError } = await admin.rpc('log_lead_interaction', {
        p_lead_id: leadId,
        p_channel: 'instagram',
        p_direction: 'outbound',
        p_body: responseText,
        p_conversation_id: conversationId,
      });

      if (!logError) {
        const loggedRow = Array.isArray(logged) ? logged[0] : logged;
        const messageId = stringValue(objectValue(loggedRow).id);
        if (messageId) {
          await admin
            .from('messages')
            .update({
              external_message_id: providerMessageId,
              status: 'sent',
              sent_at: new Date().toISOString(),
              human_approved: Boolean(objectValue(claim.policy).human_approved),
              metadata: {
                provider: 'instagram',
                instagram_automation_run_id: runId,
                instagram_automation_trigger: triggerType,
              },
            })
            .eq('id', messageId)
            .eq('organization_id', organizationId)
            .eq('conversation_id', conversationId);
        }
      }
    }

    return { ok: true as const, runId, sent: true as const, providerMessageId };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Instagram provider send failed.';
    await admin.rpc('finalize_instagram_automation_run_v1', {
      p_organization_id: organizationId,
      p_run_id: runId,
      p_success: false,
      p_provider_message_id: null,
      p_provider_recipient_id: null,
      p_provider_response: {},
      p_provider_error: message,
      p_now: new Date().toISOString(),
    });
    return { ok: false as const, runId, error: message };
  }
}

export async function runInstagramAutomations({ maxRuns = 10 }: { maxRuns?: number } = {}) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('instagram_automation_runs')
    .select('id,organization_id,status,scheduled_at')
    .in('status', ['approved', 'queued'])
    .lte('scheduled_at', new Date().toISOString())
    .order('scheduled_at', { ascending: true })
    .limit(Math.max(1, Math.min(maxRuns, 25)));

  if (error) throw new Error(`Unable to load Instagram automation queue: ${error.message}`);

  const results = [] as Array<Record<string, unknown>>;
  for (const row of data ?? []) {
    results.push(await sendInstagramAutomationRun(String(row.organization_id), String(row.id)));
  }

  return {
    ok: results.every((result) => result.ok !== false),
    considered: data?.length ?? 0,
    sent: results.filter((result) => result.sent === true).length,
    results,
  };
}
