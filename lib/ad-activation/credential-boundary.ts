import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { AD_ACTIVATION_TRANSPORT_ENABLED } from "@/lib/ad-activation/transport-policy";

export type AdActivationCredentialReadiness = {
  organizationId: string;
  connectionId: string;
  provider: "meta" | "google" | "unsupported";
  connectionReady: boolean;
  credentialConfigured: boolean;
  credentialSource: "encrypted_connection" | "vercel_env" | "oauth_refresh" | "unknown";
  transportEnabled: false;
  reasons: string[];
};

type IntegrationConnectionCredentialRow = {
  id: string;
  organization_id: string | null;
  provider: string;
  status: string;
  access_token_ciphertext: string | null;
  refresh_token_ciphertext: string | null;
  provider_metadata: Record<string, unknown> | null;
};

function metadataRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * Inspect whether a provider connection has a usable credential source without
 * decrypting or returning any credential material.
 */
export async function assessAdActivationCredentialReadiness(input: {
  organizationId: string;
  connectionId: string;
}): Promise<AdActivationCredentialReadiness> {
  const organizationId = input.organizationId.trim();
  const connectionId = input.connectionId.trim();

  if (!organizationId || !connectionId) {
    throw new Error("organizationId and connectionId are required for credential readiness.");
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("integration_connections")
    .select("id,organization_id,provider,status,access_token_ciphertext,refresh_token_ciphertext,provider_metadata")
    .eq("organization_id", organizationId)
    .eq("id", connectionId)
    .maybeSingle();

  if (error) {
    throw new Error(`Activation credential readiness lookup failed: ${error.message}`);
  }

  if (!data) {
    return {
      organizationId,
      connectionId,
      provider: "unsupported",
      connectionReady: false,
      credentialConfigured: false,
      credentialSource: "unknown",
      transportEnabled: false,
      reasons: ["connection_not_found"],
    };
  }

  const connection = data as unknown as IntegrationConnectionCredentialRow;
  const provider = connection.provider === "meta"
    ? "meta"
    : connection.provider === "google"
      ? "google"
      : "unsupported";
  const connectionReady = connection.status === "connected";
  const metadata = metadataRecord(connection.provider_metadata);
  const configuredSource = String(metadata.credential_source ?? "").trim();

  let credentialConfigured = false;
  let credentialSource: AdActivationCredentialReadiness["credentialSource"] = "unknown";
  const reasons: string[] = [];

  if (!connectionReady) reasons.push("connection_not_connected");
  if (provider === "unsupported") reasons.push("provider_not_supported");

  if (provider === "meta") {
    if (Boolean(connection.access_token_ciphertext?.trim())) {
      credentialConfigured = true;
      credentialSource = "encrypted_connection";
    } else if (configuredSource === "vercel_env") {
      credentialConfigured = Boolean(process.env.META_ACCESS_TOKEN?.trim());
      credentialSource = "vercel_env";
    }
  }

  if (provider === "google") {
    if (Boolean(connection.access_token_ciphertext?.trim())) {
      credentialConfigured = true;
      credentialSource = "encrypted_connection";
    } else if (Boolean(connection.refresh_token_ciphertext?.trim())) {
      credentialConfigured = true;
      credentialSource = "oauth_refresh";
    }
  }

  if (!credentialConfigured) reasons.push("credential_not_configured");
  if (AD_ACTIVATION_TRANSPORT_ENABLED !== false) reasons.push("transport_policy_drift");

  return {
    organizationId,
    connectionId,
    provider,
    connectionReady,
    credentialConfigured,
    credentialSource,
    transportEnabled: false,
    reasons,
  };
}
