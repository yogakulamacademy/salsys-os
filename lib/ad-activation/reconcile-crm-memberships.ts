import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  deriveBuiltinAudienceMemberships,
  type CrmActivationState,
} from "@/lib/ad-activation/crm-signal-mapping";
import {
  sanitizeAdActivationMetadata,
} from "@/lib/ad-activation/privacy";
import type {
  AdActivationSafeMetadata,
} from "@/lib/ad-activation/types";

export type ReconcileCrmAdActivationInput = {
  organizationId: string;
  personId: string;
  leadId?: string | null;
  state: CrmActivationState;
  metadata?: Record<string, unknown>;
};

export type ReconcileCrmAdActivationResult = {
  organization_id: string;
  person_id: string;
  lead_id: string | null;
  privacy: Record<string, unknown>;
  privacy_eligible: boolean;
  desired_audience_keys: string[];
  memberships_upserted: number;
  memberships_removed: number;
  deliveries_queued: number;
};

function asResult(value: unknown): ReconcileCrmAdActivationResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Ad activation reconciliation returned an invalid result.");
  }
  return value as ReconcileCrmAdActivationResult;
}

/**
 * Reconcile CRM-derived audience membership into the provider-neutral outbox.
 *
 * This function performs no Meta/Google API calls. Raw email/phone identifiers
 * are neither accepted nor persisted here; provider workers resolve them later.
 */
export async function reconcileCrmAdActivationMemberships(
  input: ReconcileCrmAdActivationInput,
): Promise<ReconcileCrmAdActivationResult> {
  const organizationId = input.organizationId.trim();
  const personId = input.personId.trim();
  const leadId = input.leadId?.trim() || null;

  if (!organizationId || !personId) {
    throw new Error("organizationId and personId are required for ad activation reconciliation.");
  }

  const desiredAudienceKeys = [
    ...deriveBuiltinAudienceMemberships(input.state),
  ].sort();

  const safeMetadata: AdActivationSafeMetadata =
    sanitizeAdActivationMetadata({
      ...(input.metadata ?? {}),
      stage: input.state.stage,
      intent: input.state.intent,
    });

  const admin = createAdminClient();
  const { data, error } = await admin.rpc(
    "reconcile_ad_activation_memberships_v1",
    {
      p_organization_id: organizationId,
      p_person_id: personId,
      p_lead_id: leadId,
      p_desired_audience_keys: desiredAudienceKeys,
      p_safe_metadata: safeMetadata,
    },
  );

  if (error) {
    throw new Error(
      `Ad activation membership reconciliation failed: ${error.message}`,
    );
  }

  return asResult(data);
}
