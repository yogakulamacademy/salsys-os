import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { resolveHashedAdActivationIdentifiers } from "@/lib/ad-activation/identifier-resolution";
import { buildMetaCustomAudienceDryRun } from "@/lib/ad-activation/providers/meta-custom-audience";
import { buildGoogleDataManagerDryRun } from "@/lib/ad-activation/providers/google-data-manager";
import {
  validateAdActivationDeliveryBeforeSend,
  type AdActivationPreSendValidation,
  type ClaimedAdActivationDelivery,
} from "@/lib/ad-activation/delivery-queue";

export type AdActivationProviderDryRun =
  | { status: "skipped"; reason: string }
  | { status: "ready"; provider: "meta"; connectionId: string; operations: ReturnType<typeof buildMetaCustomAudienceDryRun> }
  | { status: "ready"; provider: "google"; connectionId: string; operation: ReturnType<typeof buildGoogleDataManagerDryRun> };

/**
 * Prepare a provider-specific dry-run descriptor. This function performs no
 * provider HTTP/RPC call and does not persist the generated hashes.
 */
export async function prepareAdActivationProviderDryRun(
  delivery: ClaimedAdActivationDelivery,
): Promise<AdActivationProviderDryRun> {
  const validation = await validateAdActivationDeliveryBeforeSend(delivery);
  return prepareAdActivationProviderDryRunAfterValidation(delivery, validation);
}

/**
 * Prepare a provider descriptor after the caller has already performed the
 * leased pre-send validation. This lets the worker keep validation and payload
 * preparation as explicit, ordered stages without validating twice.
 */
export async function prepareAdActivationProviderDryRunAfterValidation(
  delivery: ClaimedAdActivationDelivery,
  validation: AdActivationPreSendValidation,
): Promise<AdActivationProviderDryRun> {
  if (!validation.valid) {
    return { status: "skipped", reason: validation.reason || "pre_send_validation_failed" };
  }

  const admin = createAdminClient();

  const { data: destination, error: destinationError } = await admin
    .from("ad_audience_destinations")
    .select("id,organization_id,connection_id,external_audience_id,status,config")
    .eq("id", delivery.destination_id)
    .eq("organization_id", delivery.organization_id)
    .maybeSingle();

  if (destinationError) {
    throw new Error(`Activation destination lookup failed: ${destinationError.message}`);
  }
  if (!destination || destination.status !== "active" || !destination.external_audience_id) {
    return { status: "skipped", reason: "destination_not_ready" };
  }

  const { data: connection, error: connectionError } = await admin
    .from("integration_connections")
    .select("id,organization_id,provider,status,external_account_id,provider_metadata")
    .eq("id", destination.connection_id)
    .eq("organization_id", delivery.organization_id)
    .maybeSingle();

  if (connectionError) {
    throw new Error(`Activation connection lookup failed: ${connectionError.message}`);
  }
  if (!connection || connection.status !== "connected") {
    return { status: "skipped", reason: "connection_not_ready" };
  }

  const identifiers = await resolveHashedAdActivationIdentifiers({
    organizationId: delivery.organization_id,
    personId: delivery.person_id,
    action: delivery.action,
  });

  if (identifiers.emailsSha256.length === 0 && identifiers.phonesSha256.length === 0) {
    return { status: "skipped", reason: "no_matchable_identifiers" };
  }

  const config = (destination.config && typeof destination.config === "object" && !Array.isArray(destination.config))
    ? destination.config as Record<string, unknown>
    : {};
  const providerMetadata = (connection.provider_metadata && typeof connection.provider_metadata === "object" && !Array.isArray(connection.provider_metadata))
    ? connection.provider_metadata as Record<string, unknown>
    : {};

  if (connection.provider === "meta") {
    return {
      status: "ready",
      provider: "meta",
      connectionId: connection.id,
      operations: buildMetaCustomAudienceDryRun({
        audienceId: String(destination.external_audience_id),
        action: delivery.action,
        identifiers,
      }),
    };
  }

  if (connection.provider === "google") {
    const operatingAccountId = String(
      config.operatingAccountId ?? connection.external_account_id ?? "",
    );
    const termsAccepted = config.customerMatchTermsAccepted === true;
    const loginAccountId = String(config.loginAccountId ?? providerMetadata.loginAccountId ?? "").replace(/\D/g, "");
    const loginAccountType = config.loginAccountType === "DATA_PARTNER" ? "DATA_PARTNER" : "GOOGLE_ADS";
    const linkedDataPartnerAccountId = String(config.linkedDataPartnerAccountId ?? "").replace(/\D/g, "");

    return {
      status: "ready",
      provider: "google",
      connectionId: connection.id,
      operation: buildGoogleDataManagerDryRun({
        audienceId: String(destination.external_audience_id),
        operatingAccountId,
        action: delivery.action,
        identifiers,
        customerMatchTermsAccepted: termsAccepted,
        loginAccount: loginAccountId
          ? { accountType: loginAccountType, accountId: loginAccountId }
          : undefined,
        linkedDataPartnerAccountId: linkedDataPartnerAccountId || undefined,
      }),
    };
  }

  return { status: "skipped", reason: "unsupported_provider" };
}
