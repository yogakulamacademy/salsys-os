import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { AdActivationAction } from "@/lib/ad-activation/types";
import { assessAdActivationProviderReadiness } from "@/lib/ad-activation/provider-readiness";
import { assessAdActivationCredentialReadiness } from "@/lib/ad-activation/credential-boundary";
import { AD_ACTIVATION_TRANSPORT_ENABLED } from "@/lib/ad-activation/transport-policy";

export type AdActivationExecutionReadiness = {
  organizationId: string;
  destinationId: string;
  connectionId: string | null;
  provider: "meta" | "google" | "unsupported";
  action: AdActivationAction;
  configurationReady: boolean;
  credentialReady: boolean;
  structuralReady: boolean;
  privacyPreSendValidation: "required";
  providerPayloadPreparation: "requires_leased_pre_send_validation";
  transportEnabled: false;
  authorizedToSend: false;
  reasons: string[];
};

/**
 * Read-only execution planner for Phase 7C.
 *
 * This does not claim outbox work, validate/renew leases, resolve Person
 * identifiers, create hashed provider payloads, decrypt credentials, finalize
 * deliveries, or call provider APIs. It answers only whether the destination
 * and credential configuration are structurally ready for a later leased send.
 */
export async function assessAdActivationExecutionReadiness(input: {
  organizationId: string;
  destinationId: string;
  action: AdActivationAction;
}): Promise<AdActivationExecutionReadiness> {
  const organizationId = input.organizationId.trim();
  const destinationId = input.destinationId.trim();

  if (!organizationId || !destinationId) {
    throw new Error("organizationId and destinationId are required for execution readiness.");
  }

  const admin = createAdminClient();
  const { data: destination, error } = await admin
    .from("ad_audience_destinations")
    .select("id,organization_id,connection_id")
    .eq("organization_id", organizationId)
    .eq("id", destinationId)
    .maybeSingle();

  if (error) {
    throw new Error(`Activation execution readiness lookup failed: ${error.message}`);
  }

  if (!destination?.connection_id) {
    return {
      organizationId,
      destinationId,
      connectionId: null,
      provider: "unsupported",
      action: input.action,
      configurationReady: false,
      credentialReady: false,
      structuralReady: false,
      privacyPreSendValidation: "required",
      providerPayloadPreparation: "requires_leased_pre_send_validation",
      transportEnabled: false,
      authorizedToSend: false,
      reasons: ["destination_or_connection_not_found", "leased_pre_send_validation_required", "provider_transport_disabled"],
    };
  }

  const [providerReadiness, credentialReadiness] = await Promise.all([
    assessAdActivationProviderReadiness({ organizationId, destinationId }),
    assessAdActivationCredentialReadiness({
      organizationId,
      connectionId: destination.connection_id,
    }),
  ]);

  const actionConfigurationReady = input.action === "add"
    ? providerReadiness.addReady
    : providerReadiness.removeReady;
  const providerMatches = providerReadiness.provider === credentialReadiness.provider;
  const credentialReady = credentialReadiness.connectionReady
    && credentialReadiness.credentialConfigured
    && providerMatches;
  const structuralReady = actionConfigurationReady && credentialReady;

  const reasons = [
    ...providerReadiness.reasons,
    ...credentialReadiness.reasons,
  ];

  if (!providerMatches) reasons.push("provider_connection_mismatch");
  if (!actionConfigurationReady) reasons.push(`${input.action}_configuration_not_ready`);
  if (!credentialReady) reasons.push("provider_credential_not_ready");

  // Always required immediately before any future send. The current validator
  // owns lease-sensitive privacy/membership checks and may mutate expired lease
  // state, so this read-only planner must never invoke it.
  reasons.push("leased_pre_send_validation_required");

  if (AD_ACTIVATION_TRANSPORT_ENABLED === false) {
    reasons.push("provider_transport_disabled");
  }

  return {
    organizationId,
    destinationId,
    connectionId: destination.connection_id,
    provider: providerReadiness.provider,
    action: input.action,
    configurationReady: actionConfigurationReady,
    credentialReady,
    structuralReady,
    privacyPreSendValidation: "required",
    providerPayloadPreparation: "requires_leased_pre_send_validation",
    transportEnabled: false,
    authorizedToSend: false,
    reasons: [...new Set(reasons)],
  };
}
