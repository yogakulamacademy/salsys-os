import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

import {
  decryptIntegrationSecret,
} from "@/lib/integrations/crypto";


type WhatsAppAccountRow = {
  id: string;
  organization_id: string;
  connection_id: string | null;
  phone_number_id: string;
  display_phone_number: string | null;
  active: boolean;
  is_default: boolean;
};


type WhatsAppConnectionRow = {
  id: string;
  organization_id: string;
  provider: string;
  auth_mode: string;
  status: string;
  external_account_id: string | null;
  account_name: string | null;
  access_token_ciphertext: string | null;
  provider_metadata: Record<string, unknown> | null;
};


export type WhatsAppRuntimeConnection = {
  organizationId: string;
  connectionId: string;
  phoneNumberId: string;
  displayPhoneNumber: string | null;
  wabaId: string;
  accessToken: string;
};


function requiredOrganizationId(
  organizationId: string,
) {
  const normalized =
    organizationId?.trim();

  if (!normalized) {
    throw new Error(
      "Unable to resolve WhatsApp connection: organizationId is required.",
    );
  }

  return normalized;
}




async function loadConfiguredRuntime(
  organizationId: string,
): Promise<WhatsAppRuntimeConnection | null> {
  const admin =
    createAdminClient();

  const {
    data: rawAccounts,
    error: accountError,
  } =
    await admin
      .from("whatsapp_accounts")
      .select(
        [
          "id",
          "organization_id",
          "connection_id",
          "phone_number_id",
          "display_phone_number",
          "active",
          "is_default",
        ].join(","),
      )
      .eq(
        "organization_id",
        organizationId,
      )
      .eq(
        "active",
        true,
      )
      .eq(
        "is_default",
        true,
      )
      .limit(2);


  if (accountError) {
    throw new Error(
      `Unable to load WhatsApp account: ${accountError.message}`,
    );
  }


  const accounts =
    (rawAccounts ?? []) as unknown as
      WhatsAppAccountRow[];


  if (accounts.length === 0) {
    return null;
  }


  if (accounts.length > 1) {
    throw new Error(
      "Multiple default WhatsApp senders are configured for this workspace.",
    );
  }


  const account =
    accounts[0];


  if (
    !account ||
    account.organization_id !==
      organizationId ||
    !account.connection_id
  ) {
    throw new Error(
      "The default WhatsApp sender is not correctly bound to this workspace.",
    );
  }


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
          "auth_mode",
          "status",
          "external_account_id",
          "account_name",
          "access_token_ciphertext",
          "provider_metadata",
        ].join(","),
      )
      .eq(
        "id",
        account.connection_id,
      )
      .eq(
        "organization_id",
        organizationId,
      )
      .maybeSingle();


  if (
    connectionError ||
    !rawConnection
  ) {
    throw new Error(
      connectionError?.message ??
        "WhatsApp connection not found.",
    );
  }


  const connection =
    rawConnection as unknown as
      WhatsAppConnectionRow;


  if (
    connection.organization_id !==
    organizationId
  ) {
    throw new Error(
      "WhatsApp connection not found.",
    );
  }


  if (
    connection.provider !==
      "whatsapp" ||
    connection.status !==
      "connected"
  ) {
    throw new Error(
      "WhatsApp connection is not active for this workspace.",
    );
  }


  const wabaId =
    connection.external_account_id?.trim();


  if (!wabaId) {
    throw new Error(
      "WhatsApp Business Account ID is missing from this workspace connection.",
    );
  }


  const encryptedToken =
    connection
      .access_token_ciphertext;


  if (!encryptedToken) {
    throw new Error(
      "WhatsApp connection does not contain an encrypted access token.",
    );
  }


  return {
    organizationId,
    connectionId:
      connection.id,
    phoneNumberId:
      account.phone_number_id,
    displayPhoneNumber:
      account.display_phone_number,
    wabaId,
    accessToken:
      decryptIntegrationSecret(
        encryptedToken,
      ),
  };
}



export async function getWhatsAppRuntimeForOrganization(
  organizationId: string,
): Promise<WhatsAppRuntimeConnection> {
  const resolvedOrganizationId =
    requiredOrganizationId(
      organizationId,
    );

  const configured =
    await loadConfiguredRuntime(
      resolvedOrganizationId,
    );

  if (configured) {
    return configured;
  }

  throw new Error(
    "WhatsApp is not connected for this workspace.",
  );
}