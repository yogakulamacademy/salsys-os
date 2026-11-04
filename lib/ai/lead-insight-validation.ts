import type { LeadContextV1 } from './lead-context';

/** C2 is observational, never a payment prediction, score or CRM command. */
export const LEAD_INSIGHT_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    status: { type: 'string', enum: ['supported', 'insufficient_evidence'] },
    summary: {
      type: 'object',
      additionalProperties: false,
      properties: {
        text: { type: 'string' },
        evidenceRefs: { type: 'array', items: { type: 'string' } },
      },
      required: ['text', 'evidenceRefs'],
    },
    intent: {
      type: 'object',
      additionalProperties: false,
      properties: {
        level: { type: 'string', enum: ['unknown', 'low', 'medium', 'high'] },
        reason: { type: 'string' },
        evidenceRefs: { type: 'array', items: { type: 'string' } },
      },
      required: ['level', 'reason', 'evidenceRefs'],
    },
    interests: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          description: { type: 'string' },
          evidenceRefs: { type: 'array', items: { type: 'string' } },
        },
        required: ['description', 'evidenceRefs'],
      },
    },
    objections: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          category: {
            type: 'string',
            enum: ['price', 'dates', 'location', 'trust', 'readiness', 'other'],
          },
          description: { type: 'string' },
          evidenceRefs: { type: 'array', items: { type: 'string' } },
        },
        required: ['category', 'description', 'evidenceRefs'],
      },
    },
    nextAction: {
      type: 'object',
      additionalProperties: false,
      properties: {
        kind: {
          type: 'string',
          enum: ['none', 'human_review', 'reply', 'follow_up', 'verify_payment'],
        },
        description: { type: 'string' },
        evidenceRefs: { type: 'array', items: { type: 'string' } },
      },
      required: ['kind', 'description', 'evidenceRefs'],
    },
    uncertainty: { type: 'array', items: { type: 'string' } },
  },
  required: ['status', 'summary', 'intent', 'interests', 'objections', 'nextAction', 'uncertainty'],
} as const;

type InsightRef = { text: string; evidenceRefs: string[] };
export type LeadInsightV1 = {
  status: 'supported' | 'insufficient_evidence';
  summary: InsightRef;
  intent: { level: 'unknown' | 'low' | 'medium' | 'high'; reason: string; evidenceRefs: string[] };
  interests: Array<{ description: string; evidenceRefs: string[] }>;
  objections: Array<{
    category: 'price' | 'dates' | 'location' | 'trust' | 'readiness' | 'other';
    description: string;
    evidenceRefs: string[];
  }>;
  nextAction: {
    kind: 'none' | 'human_review' | 'reply' | 'follow_up' | 'verify_payment';
    description: string;
    evidenceRefs: string[];
  };
  uncertainty: string[];
};

type EvidenceRecord = {
  ref: string;
  kind: string;
  occurredAt: string | null;
  direction?: string;
};

const INTENTS = new Set(['unknown', 'low', 'medium', 'high']);
const ACTIONS = new Set(['none', 'human_review', 'reply', 'follow_up', 'verify_payment']);
const OBJECTIONS = new Set(['price', 'dates', 'location', 'trust', 'readiness', 'other']);
const PAYMENT_CERTAINTY = /\b(?:payment|deposit|balance|enroll(?:ment|ed)?|book(?:ing|ed)?)\b.{0,45}\b(?:confirmed|verified|settled|received|completed|guaranteed)\b/i;

export function evidenceCatalog(context: LeadContextV1): EvidenceRecord[] {
  const staff = context.staffOnly;
  return [
    { ref: 'lead:' + context.lead.id, kind: 'lead', occurredAt: null },
    ...context.conversation.messages.map(m => ({
      ref: m.ref, kind: m.kind, occurredAt: m.occurredAt, direction: m.direction,
    })),
    ...(staff?.activities ?? []).map(a => ({ ref: a.ref, kind: a.kind, occurredAt: a.occurredAt })),
    ...(staff?.tasks ?? []).map(a => ({ ref: a.ref, kind: a.kind, occurredAt: a.occurredAt })),
    ...(staff?.stageChanges ?? []).map(a => ({ ref: a.ref, kind: a.kind, occurredAt: a.occurredAt })),
    ...(staff?.paymentRecords ?? []).map(a => ({ ref: a.ref, kind: a.kind, occurredAt: a.occurredAt })),
  ];
}

export function unknownLeadInsight(): LeadInsightV1 {
  return {
    status: 'insufficient_evidence',
    summary: { text: 'Insufficient evidence to summarize this lead reliably.', evidenceRefs: [] },
    intent: { level: 'unknown', reason: 'Customer intent is not established.', evidenceRefs: [] },
    interests: [],
    objections: [],
    nextAction: { kind: 'none', description: '', evidenceRefs: [] },
    uncertainty: ['Relevant lead history may be unavailable or incomplete.'],
  };
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Invalid AI insight shape.');
  return value as Record<string, unknown>;
}
function text(value: unknown, max: number, allowEmpty = false): string {
  if (typeof value !== 'string' || value.length > max || (!allowEmpty && !value.trim())) {
    throw Error('AI insight text failed validation.');
  }
  const trimmed = value.trim();
  if (PAYMENT_CERTAINTY.test(trimmed)) throw Error('Unverified financial or enrollment claim in AI output.');
  return trimmed;
}
function refs(value: unknown, allowed: Map<string, EvidenceRecord>, kind: 'any' | 'customer' | 'interest', mandatory = true): string[] {
  if (!Array.isArray(value) || value.length > 5 || (mandatory && value.length === 0)) {
    throw Error('AI insight evidence references are missing or oversized.');
  }
  const result: string[] = [];
  for (const raw of value) {
    if (typeof raw !== 'string') throw Error('AI evidence reference is invalid.');
    const evidence = allowed.get(raw);
    if (!evidence) throw Error('AI cited a source outside the permitted lead context.');
    if (kind === 'customer' && !(evidence.kind === 'message' && evidence.direction === 'inbound')) {
      throw Error('Customer intent or objection was not supported by inbound evidence.');
    }
    if (kind === 'interest' && evidence.kind !== 'lead' && !(evidence.kind === 'message' && evidence.direction === 'inbound')) {
      throw Error('AI interest requires a customer message or recorded lead preference.');
    }
    if (result.includes(raw)) throw Error('Duplicate evidence reference.');
    result.push(raw);
  }
  return result;
}

export function validateLeadInsight(value: unknown, context: LeadContextV1): LeadInsightV1 {
  if (context.audience !== 'staff_insight' || !context.staffOnly) {
    throw Error('AI staff insight requires authorized staff-only context.');
  }
  const evidence = new Map(evidenceCatalog(context).map(x => [x.ref, x]));
  const o = record(value);
  if (o.status !== 'supported' && o.status !== 'insufficient_evidence') throw Error('Invalid insight status.');

  if (o.status === 'insufficient_evidence') {
    // Model-authored unsupported prose is never shown, even if JSON parses.
    return unknownLeadInsight();
  }

  const s = record(o.summary);
  const summary = {
    text: text(s.text, 450),
    evidenceRefs: refs(s.evidenceRefs, evidence, 'any'),
  };
  const i = record(o.intent);
  if (!INTENTS.has(String(i.level))) throw Error('Unknown intent classification.');
  const intentLevel = i.level as LeadInsightV1['intent']['level'];
  const intent = {
    level: intentLevel,
    reason: text(i.reason, 260, intentLevel === 'unknown'),
    evidenceRefs: refs(i.evidenceRefs, evidence, 'customer', intentLevel !== 'unknown'),
  };
  if (intentLevel === 'unknown' && intent.evidenceRefs.length > 0) {
    throw Error('Unknown intent cannot carry a claimed customer basis.');
  }

  if (!Array.isArray(o.interests) || o.interests.length > 3) throw Error('Invalid interests list.');
  const interests = o.interests.map(item => {
    const v = record(item);
    return { description: text(v.description, 180), evidenceRefs: refs(v.evidenceRefs, evidence, 'interest') };
  });
  if (!Array.isArray(o.objections) || o.objections.length > 3) throw Error('Invalid objections list.');
  const objections = o.objections.map(item => {
    const v = record(item);
    if (!OBJECTIONS.has(String(v.category))) throw Error('Unknown objection type.');
    return {
      category: v.category as LeadInsightV1['objections'][number]['category'],
      description: text(v.description, 200),
      evidenceRefs: refs(v.evidenceRefs, evidence, 'customer'),
    };
  });
  const next = record(o.nextAction);
  if (!ACTIONS.has(String(next.kind))) throw Error('Unknown next action.');
  const actionKind = next.kind as LeadInsightV1['nextAction']['kind'];
  const nextAction = {
    kind: actionKind,
    description: text(next.description, 260, actionKind === 'none'),
    evidenceRefs: refs(next.evidenceRefs, evidence, 'any', actionKind !== 'none'),
  };
  if (actionKind === 'none' && nextAction.evidenceRefs.length > 0) throw Error('No-action result cannot cite action evidence.');
  if (!Array.isArray(o.uncertainty) || o.uncertainty.length > 5) throw Error('Invalid uncertainty list.');
  const uncertainty = o.uncertainty.map(item => text(item, 220));
  return { status: 'supported', summary, intent, interests, objections, nextAction, uncertainty };
}
