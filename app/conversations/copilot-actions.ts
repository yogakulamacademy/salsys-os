'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

type SupportedChannel = 'instagram' | 'whatsapp';
type CopilotRisk = 'low' | 'review' | 'human_only';
type CopilotComplexity = 'simple' | 'complex';

type ClaudeResponse = {
  content?: Array<{
    type?: string;
    text?: string;
  }>;
  error?: {
    message?: string;
    type?: string;
  };
};

type RouterDecision = {
  complexity: CopilotComplexity;
  risk: CopilotRisk;
  intent: string;
  nextAction: 'reply' | 'handoff';
  reason: string;
};

type KnowledgeHit = {
  chunk_id: string;
  document_id: string;
  title: string;
  category: string;
  content: string;
  rank: number;
  valid_until: string | null;
  metadata: Record<string, unknown> | null;
};

export type CopilotReplyResult =
  | {
      ok: true;
      draft: string;
      channel: SupportedChannel;
      model: string;
      routerModel: string;
      complexity: CopilotComplexity;
      risk: CopilotRisk;
      intent: string;
      nextAction: 'reply' | 'handoff';
      reason: string;
      knowledgeUsed: number;
    }
  | {
      ok: false;
      error: string;
    };

function stringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function cleanText(value: string, max = 4000) {
  return value.replace(/\u0000/g, '').trim().slice(0, max);
}

function configuredModels() {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim() || '';
  const fallback = process.env.ANTHROPIC_COPILOT_MODEL?.trim() || '';
  const haiku = process.env.ANTHROPIC_HAIKU_MODEL?.trim() || fallback;
  const sonnet = process.env.ANTHROPIC_SONNET_MODEL?.trim() || fallback || haiku;

  return { apiKey, haiku, sonnet };
}

async function callClaude({
  apiKey,
  model,
  system,
  prompt,
  maxTokens,
}: {
  apiKey: string;
  model: string;
  system: string;
  prompt: string;
  maxTokens: number;
}) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    }),
    cache: 'no-store',
  });

  const raw = await response.text();
  let payload: ClaudeResponse = {};

  try {
    payload = raw ? (JSON.parse(raw) as ClaudeResponse) : {};
  } catch {
    payload = {};
  }

  if (!response.ok) {
    throw new Error(
      payload.error?.message || `Claude returned HTTP ${response.status}.`,
    );
  }

  const text =
    payload.content
      ?.filter((item) => item.type === 'text' && typeof item.text === 'string')
      .map((item) => item.text || '')
      .join('\n')
      .trim() || '';

  if (!text) {
    throw new Error('Claude returned an empty response.');
  }

  return text;
}

function parseRouterDecision(raw: string): RouterDecision {
  const fallback: RouterDecision = {
    complexity: 'complex',
    risk: 'review',
    intent: 'other',
    nextAction: 'reply',
    reason: 'Router output could not be parsed; use stronger review.',
  };

  const firstBrace = raw.indexOf('{');
  const lastBrace = raw.lastIndexOf('}');

  if (firstBrace >= 0 && lastBrace > firstBrace) {
    try {
      const parsed = JSON.parse(raw.slice(firstBrace, lastBrace + 1)) as Record<
        string,
        unknown
      >;

      const complexity =
        parsed.complexity === 'simple' ? 'simple' : 'complex';
      const risk =
        parsed.risk === 'low'
          ? 'low'
          : parsed.risk === 'human_only'
            ? 'human_only'
            : 'review';
      const nextAction = parsed.nextAction === 'handoff' ? 'handoff' : 'reply';

      return {
        complexity,
        risk,
        intent: cleanText(stringValue(parsed.intent) || 'other', 80),
        nextAction,
        reason: cleanText(
          stringValue(parsed.reason) || 'Human review required before sending.',
          240,
        ),
      };
    } catch {
      // Fall through to tolerant key/value parsing below.
    }
  }

  const readToken = (key: string) => {
    const match = raw.match(
      new RegExp(`${key}\\s*[=:]\\s*["']?([a-zA-Z0-9_-]+)`, 'i'),
    );
    return match?.[1]?.trim().toLowerCase() || '';
  };

  const complexityToken = readToken('complexity');
  const riskToken = readToken('risk');
  const nextActionToken = readToken('nextAction');
  const intentMatch = raw.match(/intent\s*[=:]\s*["']?([^\n,"'}]+)/i);
  const reasonMatch = raw.match(/reason\s*[=:]\s*["']?([^\n}]+)/i);

  if (complexityToken || riskToken || nextActionToken || intentMatch) {
    return {
      complexity: complexityToken === 'simple' ? 'simple' : 'complex',
      risk:
        riskToken === 'low'
          ? 'low'
          : riskToken === 'human_only'
            ? 'human_only'
            : 'review',
      intent: cleanText(intentMatch?.[1]?.trim() || 'other', 80),
      nextAction: nextActionToken === 'handoff' ? 'handoff' : 'reply',
      reason: cleanText(
        reasonMatch?.[1]?.replace(/["']$/, '').trim() ||
          'Router returned a non-JSON classification; parsed conservatively.',
        240,
      ),
    };
  }

  return fallback;
}

function serializeContext(value: unknown) {
  return JSON.stringify(value, null, 2).slice(0, 28000);
}

export async function generateCopilotReplyAction(
  leadId: string,
): Promise<CopilotReplyResult> {
  const models = configuredModels();

  if (!models.apiKey || !models.haiku) {
    return {
      ok: false,
      error:
        'Claude Co-Pilot is not configured. Add ANTHROPIC_API_KEY and ANTHROPIC_HAIKU_MODEL (plus ANTHROPIC_SONNET_MODEL for complex replies) in Vercel.',
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false, error: 'Your session has expired. Sign in again.' };
  }

  const { data: canWorkLead, error: accessError } = await supabase.rpc(
    'can_work_lead',
    { p_lead_id: leadId },
  );

  if (accessError || canWorkLead !== true) {
    return {
      ok: false,
      error: accessError?.message || 'You do not have access to this lead.',
    };
  }

  const admin = createAdminClient();
  const { data: lead, error: leadError } = await admin
    .from('leads')
    .select(
      'id, organization_id, display_name, country, current_stage, intent, interested_course_id, preferred_batch_id, preferred_location, preferred_month, preferred_mode, summary, notes, current_contact_channel, lead_creation_channel',
    )
    .eq('id', leadId)
    .maybeSingle();

  if (leadError || !lead?.organization_id) {
    return {
      ok: false,
      error: leadError?.message || 'Unable to load this lead.',
    };
  }

  const organizationId = String(lead.organization_id);
  const channel = stringValue(lead.current_contact_channel) as SupportedChannel;

  if (channel !== 'instagram' && channel !== 'whatsapp') {
    return {
      ok: false,
      error: 'Co-Pilot replies are currently available for Instagram and WhatsApp conversations.',
    };
  }

  const { data: conversation, error: conversationError } = await admin
    .from('conversations')
    .select('id, channel, last_message_at')
    .eq('organization_id', organizationId)
    .eq('lead_id', leadId)
    .eq('channel', channel)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (conversationError || !conversation?.id) {
    return {
      ok: false,
      error:
        conversationError?.message || `No ${channel} conversation was found for this lead.`,
    };
  }

  const { data: messageRows, error: messageError } = await admin
    .from('messages')
    .select('direction, sender_type, body, created_at')
    .eq('organization_id', organizationId)
    .eq('conversation_id', conversation.id)
    .order('created_at', { ascending: false })
    .limit(24);

  if (messageError) {
    return {
      ok: false,
      error: `Unable to load conversation history: ${messageError.message}`,
    };
  }

  const messages = [...(messageRows ?? [])]
    .reverse()
    .map((message) => ({
      direction: message.direction,
      senderType: message.sender_type,
      body: cleanText(String(message.body ?? '[non-text message]'), 1200),
      timestamp: message.created_at,
    }));

  const latestInbound = [...messages]
    .reverse()
    .find(
      (message) =>
        message.direction === 'inbound' &&
        message.body &&
        message.body !== '[non-text message]',
    );

  let approvedKnowledge: KnowledgeHit[] = [];

  if (latestInbound?.body) {
    const { data: knowledgeRows, error: knowledgeError } = await supabase.rpc(
      'search_organization_knowledge_v1',
      {
        p_organization_id: organizationId,
        p_query: latestInbound.body,
        p_limit: 6,
      },
    );

    if (knowledgeError) {
      console.warn('Organization knowledge retrieval failed', {
        leadId,
        organizationId,
        message: knowledgeError.message,
      });
    } else {
      approvedKnowledge = (knowledgeRows ?? []).map((row: KnowledgeHit) => ({
        ...row,
        title: cleanText(String(row.title ?? ''), 240),
        category: cleanText(String(row.category ?? 'general'), 80),
        content: cleanText(String(row.content ?? ''), 1800),
      }));
    }
  }

  let selectedCourse: Record<string, unknown> | null = null;
  let upcomingBatches: Array<Record<string, unknown>> = [];
  let availableCourses: Array<Record<string, unknown>> = [];

  if (lead.interested_course_id) {
    const { data: course } = await admin
      .from('courses')
      .select('id, code, name, category, hours, metadata')
      .eq('organization_id', organizationId)
      .eq('id', lead.interested_course_id)
      .maybeSingle();

    selectedCourse = course ?? null;

    const today = new Date().toISOString().slice(0, 10);
    const { data: batches } = await admin
      .from('course_batches')
      .select(
        'id, batch_code, location, mode, start_date, end_date, start_time, end_time, timezone, currency, price_private, price_shared, price_course_only, seats_remaining, enrollment_open, enrollment_note, accommodation_remaining, accommodation_note',
      )
      .eq('organization_id', organizationId)
      .eq('course_id', lead.interested_course_id)
      .eq('active', true)
      .gte('start_date', today)
      .order('start_date', { ascending: true })
      .limit(8);

    upcomingBatches = (batches ?? []) as Array<Record<string, unknown>>;
  } else {
    const { data: courses } = await admin
      .from('courses')
      .select('id, code, name, category, hours')
      .eq('organization_id', organizationId)
      .eq('active', true)
      .order('name', { ascending: true })
      .limit(20);

    availableCourses = (courses ?? []) as Array<Record<string, unknown>>;
  }

  const context = {
    currentDate: new Date().toISOString().slice(0, 10),
    channel,
    latestInboundMessage: latestInbound?.body || null,
    lead: {
      name: lead.display_name,
      country: lead.country,
      stage: lead.current_stage,
      intent: lead.intent,
      preferredLocation: lead.preferred_location,
      preferredMonth: lead.preferred_month,
      preferredMode: lead.preferred_mode,
      summary: cleanText(String(lead.summary ?? ''), 1400),
      notes: cleanText(String(lead.notes ?? ''), 1400),
    },
    selectedCourse,
    upcomingBatches,
    availableCourses,
    approvedOrganizationKnowledge: approvedKnowledge.map((knowledge) => ({
      title: knowledge.title,
      category: knowledge.category,
      content: knowledge.content,
      validUntil: knowledge.valid_until,
      relevance: knowledge.rank,
      documentId: knowledge.document_id,
    })),
    recentConversation: messages,
  };

  const contextText = serializeContext(context);

  try {
    const routerRaw = await callClaude({
      apiKey: models.apiKey,
      model: models.haiku,
      maxTokens: 320,
      system:
        'You are the routing layer for an admissions reply co-pilot. Classify the latest inbound customer message, using older conversation messages only as context. Do not let an older unrelated request override the latest message unless the latest message explicitly refers back to it. Never draft the customer reply. Your entire output must be one valid JSON object with no markdown, commentary, or code fences. Approved organization knowledge is authoritative for organization-specific policies when present.',
      prompt: `Classify the latest inbound customer message in this CRM conversation.\n\nReturn exactly one JSON object with:\n- complexity: "simple" or "complex"\n- risk: "low", "review", or "human_only"\n- intent: short label\n- nextAction: "reply" or "handoff"\n- reason: one short sentence\n\nUse human_only for a latest-message refund dispute, serious complaint, policy exception, safety/sensitive situation, legal threat, or commitment outside supplied facts. Use review for discounts, unusual payment requests, accommodation exceptions, complaints, and uncertain facts. A simple factual question that is directly answered by approved organization knowledge can be low risk even if an older unrelated message was high risk.\n\nCRM CONTEXT:\n${contextText}`,
    });

    const decision = parseRouterDecision(routerRaw);
    const replyModel =
      decision.complexity === 'simple' && decision.risk === 'low'
        ? models.haiku
        : models.sonnet || models.haiku;

    const draft = cleanText(
      await callClaude({
        apiKey: models.apiKey,
        model: replyModel,
        maxTokens: 520,
        system:
          'You are SalsysOS Admissions Reply Co-Pilot. You draft a message for a human admissions team member to review and send. You never send messages yourself. Answer the latest inbound customer message first and do not reopen older unrelated topics unless the latest message refers back to them. Use only facts supplied in CRM CONTEXT. Live structured CRM data is authoritative for current courses, batches, prices and availability. approvedOrganizationKnowledge is authoritative for organization-specific FAQs and policies when relevant. Never invent prices, dates, availability, accreditation, policies, refunds, discounts, promises, or exceptions. If a required fact is missing, ask a concise clarifying question or say the admissions team can confirm it. Keep the tone warm, natural, helpful, concise, and appropriate for chat. No markdown tables. Avoid sounding robotic. For human_only situations, draft only a neutral acknowledgement and indicate that the team will review; do not make a commitment.',
        prompt: `Draft the next ${channel} reply to the latest inbound customer message.\n\nRouter decision:\n${JSON.stringify(decision)}\n\nCRM CONTEXT:\n${contextText}\n\nReturn only the customer-facing draft, with no analysis, labels, or quotation marks.`,
      }),
      2000,
    );

    return {
      ok: true,
      draft,
      channel,
      model: replyModel,
      routerModel: models.haiku,
      complexity: decision.complexity,
      risk: decision.risk,
      intent: decision.intent,
      nextAction: decision.nextAction,
      reason: decision.reason,
      knowledgeUsed: approvedKnowledge.length,
    };
  } catch (error) {
    console.error('Claude Co-Pilot generation failed', {
      leadId,
      organizationId,
      channel,
      message: error instanceof Error ? error.message : String(error),
    });

    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : 'Unable to generate a Co-Pilot reply right now.',
    };
  }
}
