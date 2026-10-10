import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

import {
  decryptIntegrationSecret,
  encryptIntegrationSecret,
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


function legacyWhatsAppEnvironment() {
  const accessToken =
    process.env.WA_ACCESS_TOKEN?.trim();

  const phoneNumberId =
    process.env.WA_PHONE_NUMBER_ID?.trim();

  const wabaId =
    (
      process.env.WA_BUSINESS_ACCOUNT_ID ||
      process.env.WA_WABA_ID
    )?.trim();

  if (
    !accessToken ||
    !phoneNumberId ||
    !wabaId
  ) {
    return null;
  }

  return {
    accessToken,
    phoneNumberId,
    wabaId,
  };
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


async function bootstrapLegacyConnection(
  organizationId: string,
): Promise<WhatsAppRuntimeConnection | null> {
  const legacy =
    legacyWhatsAppEnvironment();


  /*
   * No implicit partial fallback.
   *
   * All legacy values must exist together before migration can
   * even be considered.
   */
  if (!legacy) {
    return null;
  }


  const admin =
    createAdminClient();


  /*
   * Never bootstrap the global legacy credential into an
   * arbitrary tenant.
   *
   * The legacy phone number must already be mapped to this
   * exact organization by the tenant-safe inbound routing table.
   */
  const {
    data: rawAccount,
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
        "phone_number_id",
        legacy.phoneNumberId,
      )
      .eq(
        "active",
        true,
      )
      .maybeSingle();


  if (accountError) {
    throw new Error(
      `Unable to verify the legacy WhatsApp account mapping: ${accountError.message}`,
    );
  }


  if (!rawAccount) {
    return null;
  }


  const account =
    rawAccount as unknown as
      WhatsAppAccountRow;


  if (
    account.organization_id !==
      organizationId ||
    account.phone_number_id !==
      legacy.phoneNumberId
  ) {
    return null;
  }


  /*
   * Automatic bootstrap is allowed only when this organization
   * has no WhatsApp integration connection yet.
   *
   * Once a WhatsApp connection exists, an invalid/disconnected
   * configuration must be fixed explicitly rather than silently
   * resurrected from the old environment credential.
   */
  const {
    data: existingConnections,
    error: existingError,
  } =
    await admin
      .from("integration_connections")
      .select(
        "id",
      )
      .eq(
        "organization_id",
        organizationId,
      )
      .eq(
        "provider",
        "whatsapp",
      )
      .limit(1);


  if (existingError) {
    throw new Error(
      `Unable to inspect existing WhatsApp connections: ${existingError.message}`,
    );
  }


  if (
    (existingConnections ?? [])
      .length > 0
  ) {
    return null;
  }


  const now =
    new Date().toISOString();


  const encryptedToken =
    encryptIntegrationSecret(
      legacy.accessToken,
    );


  const {
    data: rawConnection,
    error: insertError,
  } =
    await admin
      .from(
        "integration_connections",
      )
      .insert({
        organization_id:
          organizationId,

        provider:
          "whatsapp",

        auth_mode:
          "system_user",

        status:
          "connected",

        external_account_id:
          legacy.wabaId,

        account_name:
          account.display_phone_number
            ? `WhatsApp ${account.display_phone_number}`
            : "WhatsApp Business",

        scopes: [
          "whatsapp_business_management",
          "whatsapp_business_messaging",
        ],

        access_token_ciphertext:
          encryptedToken,

        provider_metadata: {
          credential_source:
            "encrypted_connection",

          migrated_from:
            "legacy_vercel_env",

          phone_number_id:
            legacy.phoneNumberId,

          waba_id:
            legacy.wabaId,
        },

        connected_at:
          now,

        last_verified_at:
          now,

        last_error:
          null,
      })
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
      .single();


  if (
    insertError ||
    !rawConnection
  ) {
    throw new Error(
      insertError?.message ??
        "Unable to create the tenant WhatsApp connection.",
    );
  }


  const connection =
    rawConnection as unknown as
      WhatsAppConnectionRow;


  if (
    connection.organization_id !==
      organizationId ||
    connection.provider !==
      "whatsapp"
  ) {
    throw new Error(
      "Created WhatsApp connection failed the tenant ownership check.",
    );
  }


  /*
   * Current Conversations UX supports one default outbound
   * WhatsApp sender per workspace.
   */
  const {
    error: clearDefaultError,
  } =
    await admin
      .from("whatsapp_accounts")
      .update({
        is_default:
          false,
      })
      .eq(
        "organization_id",
        organizationId,
      )
      .eq(
        "is_default",
        true,
      );


  if (clearDefaultError) {
    throw new Error(
      `Unable to clear the previous WhatsApp default sender: ${clearDefaultError.message}`,
    );
  }


  const {
    data: boundRows,
    error: bindError,
  } =
    await admin
      .from("whatsapp_accounts")
      .update({
        connection_id:
          connection.id,

        is_default:
          true,
      })
      .eq(
        "id",
        account.id,
      )
      .eq(
        "organization_id",
        organizationId,
      )
      .eq(
        "phone_number_id",
        legacy.phoneNumberId,
      )
      .eq(
        "active",
        true,
      )
      .select(
        "id",
      );


  if (
    bindError ||
    (boundRows ?? []).length !== 1
  ) {
    throw new Error(
      bindError?.message ??
        "Unable to bind the WhatsApp phone number to its tenant connection.",
    );
  }


  /*
   * Reload through the normal resolver so the bootstrap path
   * never bypasses the same validation used during steady state.
   */
  return loadConfiguredRuntime(
    organizationId,
  );
}


export async function getWhatsAppRuntimeForOrganization(
  organizationId: string,
  options?: {
    allowLegacyBootstrap?: boolean;
  },
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


  if (
    options?.allowLegacyBootstrap ===
    true
  ) {
    const bootstrapped =
      await bootstrapLegacyConnection(
        resolvedOrganizationId,
      );


    if (bootstrapped) {
      return bootstrapped;
    }
  }


  throw new Error(
    "WhatsApp is not connected for this workspace.",
  );
}