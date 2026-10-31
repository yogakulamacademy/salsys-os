import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export type AdActivationProviderReadiness = {
  destinationId: string;
  organizationId: string;
  provider: "meta" | "google" | "unsupported";
  destinationKind: string;
  connectionReady: boolean;
  destinationReady: boolean;
  addReady: boolean;
  removeReady: boolean;
  dryRunOnly: true;
  transportEnabled: false;
  reasons: string[];
};

function objectConfig(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function numericId(value: unknown) {
  return /^\d+$/.test(String(value ?? "").trim());
}

function stringSet(value: unknown) {
  if (!Array.isArray(value)) {
    return new Set<string>();
  }

  return new Set(
    value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean),
  );
}

/**
 * Assess destination/provider configuration only. This deliberately does not
 * resolve Person identifiers, decrypt provider credentials, or call a provider.
 *
 * Provider permissions are checked from the scopes already recorded when the
 * tenant connection was authorized. This lets execution fail closed before any
 * customer identifier is prepared for a provider request.
 */
export async function assessAdActivationProviderReadiness(input: {
  organizationId: string;
  destinationId: string;
}): Promise<AdActivationProviderReadiness> {
  const organizationId = input.organizationId.trim();
  const destinationId = input.destinationId.trim();

  if (!organizationId || !destinationId) {
    throw new Error("organizationId and destinationId are required for activation readiness.");
  }

  const admin = createAdminClient();
  const { data: destination, error: destinationError } = await admin
    .from("ad_audience_destinations")
    .select("id,organization_id,connection_id,destination_kind,external_audience_id,status,config")
    .eq("organization_id", organizationId)
    .eq("id", destinationId)
    .maybeSingle();

  if (destinationError) {
    throw new Error(`Activation readiness destination lookup failed: ${destinationError.message}`);
  }
  if (!destination) {
    return {
      destinationId,
      organizationId,
      provider: "unsupported",
      destinationKind: "unknown",
      connectionReady: false,
      destinationReady: false,
      addReady: false,
      removeReady: false,
      dryRunOnly: true,
      transportEnabled: false,
      reasons: ["destination_not_found"],
    };
  }

  const { data: connection, error: connectionError } = await admin
    .from("integration_connections")
    .select("id,organization_id,provider,status,external_account_id,provider_metadata,scopes")
    .eq("organization_id", organizationId)
    .eq("id", destination.connection_id)
    .maybeSingle();

  if (connectionError) {
    throw new Error(`Activation readiness connection lookup failed: ${connectionError.message}`);
  }

  const provider = connection?.provider === "meta"
    ? "meta"
    : connection?.provider === "google"
      ? "google"
      : "unsupported";
  const config = objectConfig(destination.config);
  const scopes = stringSet(connection?.scopes);
  const reasons: string[] = [];
  const connectionReady = Boolean(connection && connection.status === "connected");
  const audienceIdReady = numericId(destination.external_audience_id);

  if (!connection) reasons.push("connection_not_found");
  else if (!connectionReady) reasons.push("connection_not_connected");
  if (destination.status !== "active") reasons.push("destination_not_active");
  if (!audienceIdReady) reasons.push("external_audience_id_missing_or_invalid");

  let addSpecificReady = false;
  let removeSpecificReady = false;

  if (provider === "meta") {
    if (destination.destination_kind !== "custom_audience") {
      reasons.push("meta_destination_kind_must_be_custom_audience");
    }

    const kindReady = destination.destination_kind === "custom_audience";
    const adsManagementReady = scopes.has("ads_management");

    if (!adsManagementReady) {
      reasons.push("meta_ads_management_scope_missing");
    }

    addSpecificReady = kindReady && adsManagementReady;
    removeSpecificReady = kindReady && adsManagementReady;
  } else if (provider === "google") {
    if (destination.destination_kind !== "customer_match") {
      reasons.push("google_destination_kind_must_be_customer_match");
    }
    const operatingAccountId = String(
      config.operatingAccountId ?? connection?.external_account_id ?? "",
    ).replace(/\D/g, "");
    const termsAccepted = config.customerMatchTermsAccepted === true;
    const kindReady = destination.destination_kind === "customer_match";

    if (!operatingAccountId) reasons.push("google_operating_account_missing");
    if (!termsAccepted) reasons.push("google_customer_match_terms_not_recorded");

    addSpecificReady = kindReady && Boolean(operatingAccountId) && termsAccepted;
    // Removal is privacy-protective; do not block it solely because an add-only
    // Customer Match terms flag is missing.
    removeSpecificReady = kindReady && Boolean(operatingAccountId);
  } else {
    reasons.push("unsupported_provider");
  }

  const baseReady = connectionReady && destination.status === "active" && audienceIdReady;

  return {
    destinationId: destination.id,
    organizationId,
    provider,
    destinationKind: destination.destination_kind,
    connectionReady,
    destinationReady: baseReady,
    addReady: baseReady && addSpecificReady,
    removeReady: baseReady && removeSpecificReady,
    dryRunOnly: true,
    transportEnabled: false,
    reasons: [...new Set(reasons)],
  };
}
