import 'server-only';

import type { SystemIntelligenceBrief } from '@/lib/intelligence/system-intelligence';

export type ClaudeOperatingBrief = {
  executive_summary: string;
  top_priorities: Array<{
    signal_id: string;
    priority: number;
    action: string;
    why_now: string;
  }>;
  watch: string[];
  confidence_note: string;
  generated_at: string;
  model: string;
};

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as UnknownRecord : null;
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function array(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function boundedText(value: unknown, max: number) {
  return text(value).slice(0, max);
}

function parseJsonResponse(value: string) {
  const cleaned = value.trim().replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
  const first = cleaned.indexOf('{');
  const last = cleaned.lastIndexOf('}');
  if (first < 0 || last <= first) throw new Error('CLAUDE_INTELLIGENCE_JSON_INVALID');
  return JSON.parse(cleaned.slice(first, last + 1)) as UnknownRecord;
}

function safeEvidence(brief: SystemIntelligenceBrief) {
  return {
    state: brief.state,
    attention_score: brief.attentionScore,
    counters: brief.counters,
    signals: brief.signals.slice(0, 8).map((signal) => ({
      id: signal.id,
      category: signal.category,
      tone: signal.tone,
      score: signal.score,
      title: signal.title,
      reason: signal.reason,
      recommended_action: signal.recommendedAction,
      metric_label: signal.metricLabel,
      metric_value: signal.metricValue,
    })),
  };
}

export function isClaudeOperatingBriefConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim() && process.env.ANTHROPIC_SONNET_MODEL?.trim());
}

export async function generateClaudeOperatingBrief(brief: SystemIntelligenceBrief): Promise<ClaudeOperatingBrief> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  const model = process.env.ANTHROPIC_SONNET_MODEL?.trim();
  if (!apiKey || !model) throw new Error('CLAUDE_INTELLIGENCE_NOT_CONFIGURED');

  const evidence = safeEvidence(brief);
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 1300,
      temperature: 0.15,
      system: [
        'You are the operating-intelligence synthesis layer inside SalsysOS.',
        'Use only the supplied deterministic evidence. Never invent counts, customers, revenue, rankings, conversions, causes, URLs, campaign performance, system failures or outcomes.',
        'Do not recommend autonomous customer messaging, financial actions, website publishing or automation activation. Recommendations are advisory and human-controlled.',
        'If evidence is incomplete or a causal explanation is not supported, say that explicitly.',
        'Return strict JSON only. No markdown.',
      ].join(' '),
      messages: [{
        role: 'user',
        content: `Create a concise operating brief from this evidence. Return JSON exactly with: executive_summary (string, max 500 chars), top_priorities (array max 4; each: signal_id matching an supplied signal id, priority integer 1-4, action string, why_now string), watch (array max 3 strings), confidence_note (string). Rank by the supplied scores but use judgment to avoid repeating the same operating situation. EVIDENCE: ${JSON.stringify(evidence)}`,
      }],
    }),
    signal: AbortSignal.timeout(45000),
  });

  if (!response.ok) throw new Error(`CLAUDE_INTELLIGENCE_REQUEST_FAILED_${response.status}`);
  const body = await response.json() as { content?: Array<{ type?: string; text?: string }> };
  const output = body.content?.find((item) => item.type === 'text')?.text || '';
  const parsed = parseJsonResponse(output);
  const allowedSignalIds = new Set(brief.signals.map((signal) => signal.id));

  const priorities = array(parsed.top_priorities)
    .map(record)
    .filter((item): item is UnknownRecord => Boolean(item))
    .map((item, index) => ({
      signal_id: text(item.signal_id),
      priority: Math.max(1, Math.min(4, Number(item.priority) || index + 1)),
      action: boundedText(item.action, 320),
      why_now: boundedText(item.why_now, 360),
    }))
    .filter((item) => allowedSignalIds.has(item.signal_id) && item.action && item.why_now)
    .slice(0, 4);

  if (priorities.length === 0) throw new Error('CLAUDE_INTELLIGENCE_PRIORITIES_INVALID');

  return {
    executive_summary: boundedText(parsed.executive_summary, 500) || 'The current evidence has been ranked into the priorities below.',
    top_priorities: priorities,
    watch: array(parsed.watch).map((item) => boundedText(item, 260)).filter(Boolean).slice(0, 3),
    confidence_note: boundedText(parsed.confidence_note, 320) || 'This brief is limited to the supplied SalsysOS evidence.',
    generated_at: new Date().toISOString(),
    model,
  };
}
