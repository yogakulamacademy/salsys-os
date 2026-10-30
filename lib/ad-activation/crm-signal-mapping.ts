import "server-only";

import type { IntentLevel, LeadStage } from "@/types/crm";

export const BUILTIN_AD_AUDIENCES = {
  activeProspects: "active_prospects",
  qualifiedProspects: "qualified_prospects",
  highIntentProspects: "high_intent_prospects",
  enrolledStudents: "enrolled_students",
} as const;

export type BuiltinAdAudienceKey =
  (typeof BUILTIN_AD_AUDIENCES)[keyof typeof BUILTIN_AD_AUDIENCES];

export type CrmActivationState = {
  stage: LeadStage;
  intent: IntentLevel;
};

export type CrmAudienceTransition = {
  audienceKey: BuiltinAdAudienceKey;
  action: "add" | "remove";
  reason:
    | "lead_active"
    | "lead_qualified"
    | "lead_high_intent"
    | "lead_enrolled"
    | "no_longer_eligible";
};

const TERMINAL_PROSPECT_STAGES = new Set<LeadStage>([
  "enrolled",
  "lost",
  "unqualified",
  "duplicate",
]);

const QUALIFIED_STAGES = new Set<LeadStage>(["qualified", "high_intent"]);
const HIGH_INTENT_CONTEXT_STAGES = new Set<LeadStage>([
  "engaged",
  "qualified",
  "high_intent",
]);
const HIGH_INTENTS = new Set<IntentLevel>(["high", "very_high"]);

export function deriveBuiltinAudienceMemberships(
  state: CrmActivationState,
): Set<BuiltinAdAudienceKey> {
  const memberships = new Set<BuiltinAdAudienceKey>();

  if (!TERMINAL_PROSPECT_STAGES.has(state.stage)) {
    memberships.add(BUILTIN_AD_AUDIENCES.activeProspects);
  }

  if (QUALIFIED_STAGES.has(state.stage)) {
    memberships.add(BUILTIN_AD_AUDIENCES.qualifiedProspects);
  }

  if (
    state.stage === "high_intent" ||
    (HIGH_INTENT_CONTEXT_STAGES.has(state.stage) && HIGH_INTENTS.has(state.intent))
  ) {
    memberships.add(BUILTIN_AD_AUDIENCES.highIntentProspects);
  }

  if (state.stage === "enrolled") {
    memberships.add(BUILTIN_AD_AUDIENCES.enrolledStudents);
  }

  return memberships;
}

function reasonForAdd(
  audienceKey: BuiltinAdAudienceKey,
): CrmAudienceTransition["reason"] {
  switch (audienceKey) {
    case BUILTIN_AD_AUDIENCES.qualifiedProspects:
      return "lead_qualified";
    case BUILTIN_AD_AUDIENCES.highIntentProspects:
      return "lead_high_intent";
    case BUILTIN_AD_AUDIENCES.enrolledStudents:
      return "lead_enrolled";
    case BUILTIN_AD_AUDIENCES.activeProspects:
    default:
      return "lead_active";
  }
}

export function deriveCrmAudienceTransitions(
  previous: CrmActivationState | null,
  current: CrmActivationState,
): CrmAudienceTransition[] {
  const before = previous
    ? deriveBuiltinAudienceMemberships(previous)
    : new Set<BuiltinAdAudienceKey>();
  const after = deriveBuiltinAudienceMemberships(current);
  const transitions: CrmAudienceTransition[] = [];

  for (const audienceKey of Object.values(BUILTIN_AD_AUDIENCES)) {
    const had = before.has(audienceKey);
    const has = after.has(audienceKey);

    if (!had && has) {
      transitions.push({
        audienceKey,
        action: "add",
        reason: reasonForAdd(audienceKey),
      });
    } else if (had && !has) {
      transitions.push({
        audienceKey,
        action: "remove",
        reason: "no_longer_eligible",
      });
    }
  }

  return transitions;
}
