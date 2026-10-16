import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { decryptIntegrationSecret } from "@/lib/integrations/crypto";

type InstagramConnectionRow = {
  id: string;
  organization_id: string;
  provider: string;
  status: string;
  external_account_id: string | null;
  account_name: string | null;
  access_token_ciphertext: string | null;
  token_expires_at: string | null;
  scopes: string[] | null;
};

export type InstagramRuntimeConnection = {
  organizationId: string;
  connectionId: string;
  accountId: string;
  accountName: string | null;
  accessToken: string;
};

function required(value: string, label: string) {
  const normalized = value?.trim();

  if (!normalized) {
    throw new Error(`${label} is required.`);
  }

  return normalized;
}

export async function getInstagramRuntimeForOrganization(
  organizationId: string,
  accountId: string,
): Promise<InstagramRuntimeConnection> {
  const resolvedOrganizationId = required(
    organizationId,
    "Instagram organizationId",
  );
  const resolvedAccountId = required(accountId, "Instagram accountId");

  const admin = createAdminClient();

  const { data: rawConnections, error } = await admin
    .from("integration_connections")
    .select(
      [
        "id",
        "organization_id",
        "provider",
        "status",
        "external_account_id",
        "account_name",
        "access_token_ciphertext",
        "token_expires_at",
        "scopes",
      ].join(","),
    )
    .eq("organization_id", resolvedOrganizationId)
    .eq("provider", "instagram")
    .eq("status", "connected")
    .eq("external_account_id", resolvedAccountId)
    .limit(2);

  if (error) {
    throw new Error(`Unable to load Instagram connection: ${error.message}`);
  }

  const connections = (rawConnections ?? []) as unknown as InstagramConnectionRow[];

  if (connections.length === 0) {
    throw new Error(
      "Instagram is not connected for this workspace/account. Reconnect Instagram in Settings → Integrations.",
    );
  }

  if (connections.length > 1) {
    throw new Error(
      "Multiple active Instagram connections were found for the same workspace/account.",
    );
  }

  const connection = connections[0];

  if (
    !connection ||
    connection.organization_id !== resolvedOrganizationId ||
    connection.provider !== "instagram" ||
    connection.status !== "connected" ||
    connection.external_account_id !== resolvedAccountId
  ) {
    throw new Error("Instagram connection does not match this workspace.");
  }

  const scopes = Array.isArray(connection.scopes) ? connection.scopes : [];

  if (!scopes.includes("instagram_business_manage_messages")) {
    throw new Error(
      "Instagram messaging permission is missing. Reconnect Instagram and grant message access.",
    );
  }

  if (connection.token_expires_at) {
    const expiresAt = new Date(connection.token_expires_at).getTime();

    if (Number.isFinite(expiresAt) && expiresAt <= Date.now()) {
      throw new Error(
        "Instagram access has expired. Reconnect Instagram in Settings → Integrations.",
      );
    }
  }

  const encryptedToken = connection.access_token_ciphertext?.trim();

  if (!encryptedToken) {
    throw new Error("Instagram connection does not contain an access token.");
  }

  return {
    organizationId: resolvedOrganizationId,
    connectionId: connection.id,
    accountId: resolvedAccountId,
    accountName: connection.account_name,
    accessToken: decryptIntegrationSecret(encryptedToken),
  };
}
