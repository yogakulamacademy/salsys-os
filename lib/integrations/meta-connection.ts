import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

import {
  decryptIntegrationSecret,
} from "@/lib/integrations/crypto";

type MetaConnectionRow = {
  id: string;
  organization_id: string | null;
  provider: string;
  status: string;
  access_token_ciphertext: string | null;
  provider_metadata: Record<string, unknown> | null;
};

type MetaConnectionTokenOptions = {
  organizationId: string;
};

function requireMetaEnvironmentToken() {
  const token =
    process.env.META_ACCESS_TOKEN?.trim();

  if (!token) {
    throw new Error(
      "META_ACCESS_TOKEN is not configured.",
    );
  }

  return token;
}

/**
 * Trusted low-level Meta token loader.
 *
 * Token retrieval is always scoped to the organization that owns
 * the integration connection.
 *
 * Supported credential sources:
 *
 *   1. encrypted access_token_ciphertext stored on the connection
 *   2. META_ACCESS_TOKEN when provider_metadata.credential_source
 *      explicitly equals "vercel_env"
 *
 * The environment fallback is intentionally NOT automatic.
 */
export async function getMetaAccessTokenForConnection(
  connectionId: string,
  options: MetaConnectionTokenOptions,
) {
  if (!connectionId?.trim()) {
    throw new Error(
      "Unable to load Meta connection: connectionId is required.",
    );
  }

  if (!options.organizationId?.trim()) {
    throw new Error(
      "Unable to load Meta connection: organizationId is required.",
    );
  }

  const admin =
    createAdminClient();

  const {
    data: rawConnection,
    error: connectionError,
  } =
    await admin
      .from("integration_connections")
      .select(
        [
          "id",
          "organization_id",
          "provider",
          "status",
          "access_token_ciphertext",
          "provider_metadata",
        ].join(","),
      )
      .eq(
        "id",
        connectionId,
      )
      .eq(
        "organization_id",
        options.organizationId,
      )
      .maybeSingle();

  if (
    connectionError ||
    !rawConnection
  ) {
    throw new Error(
      connectionError?.message ??
        "Meta connection not found.",
    );
  }

  const connection =
    rawConnection as unknown as
      MetaConnectionRow;

  if (!connection.organization_id) {
    throw new Error(
      "Meta connection is not assigned to an organization.",
    );
  }

  /*
   * Keep the ownership check explicit even though the database
   * query above is already organization-scoped.
   */
  if (
    connection.organization_id !==
      options.organizationId
  ) {
    throw new Error(
      "Meta connection not found.",
    );
  }

  if (
    connection.provider !== "meta" ||
    connection.status !== "connected"
  ) {
    throw new Error(
      "Meta connection is not active.",
    );
  }

  if (connection.access_token_ciphertext) {
    return decryptIntegrationSecret(
      connection.access_token_ciphertext,
    );
  }

  const credentialSource =
    connection.provider_metadata &&
    typeof connection.provider_metadata === "object"
      ? connection.provider_metadata[
          "credential_source"
        ]
      : null;

  /*
   * Environment fallback is allowed only when the connection
   * explicitly declares that this is its credential source.
   *
   * This prevents a missing database credential from silently
   * falling through to a global environment token.
   */
  if (credentialSource === "vercel_env") {
    return requireMetaEnvironmentToken();
  }

  throw new Error(
    "Meta connection does not have a supported credential source.",
  );
}

/**
 * Convenience wrapper for organization-scoped provider actions.
 */
export async function getMetaAccessTokenForOrganizationConnection(
  connectionId: string,
  organizationId: string,
) {
  return getMetaAccessTokenForConnection(
    connectionId,
    {
      organizationId,
    },
  );
}
