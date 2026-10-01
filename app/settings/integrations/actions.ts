"use server";

import { revalidatePath } from "next/cache";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import { createAdminClient } from "@/lib/supabase/admin";

import { decryptIntegrationSecret } from "@/lib/integrations/crypto";

import { revokeGoogleToken } from "@/lib/integrations/google";

import { getGoogleAccessTokenForConnection } from "@/lib/integrations/google-connection";

import { discoverGoogleAssets } from "@/lib/integrations/google-assets";

function textValue(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();

  return value || null;
}

async function requireAdmin() {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect("/login");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, role, active")
    .eq("id", user.id)
    .maybeSingle();

  if (
    profileError ||
    !profile ||
    profile.active !== true ||
    profile.role !== "admin"
  ) {
    redirect("/dashboard");
  }

  return user;
}

function integrationsUrl(key: "notice" | "error", value: string) {
  const params = new URLSearchParams({
    [key]: value,
  });

  return "/settings/integrations?" + params.toString();
}

export async function disconnectIntegrationAction(formData: FormData) {
  const user = await requireAdmin();

  const connectionId = textValue(formData, "connection_id");

  if (!connectionId) {
    redirect(integrationsUrl("error", "Connection is missing."));
  }

  const admin = createAdminClient();

  const { data: connection, error: connectionError } = await admin
    .from("integration_connections")
    .select(
      "id, provider, account_name, access_token_ciphertext, refresh_token_ciphertext",
    )
    .eq("id", connectionId)
    .maybeSingle();

  if (connectionError || !connection) {
    redirect(
      integrationsUrl(
        "error",
        connectionError?.message ?? "Connection not found.",
      ),
    );
  }

  let providerRevocationConfirmed = true;

  if (connection.provider === "google") {
    const encryptedToken =
      connection.refresh_token_ciphertext || connection.access_token_ciphertext;

    if (encryptedToken) {
      try {
        const token = decryptIntegrationSecret(encryptedToken);

        providerRevocationConfirmed = await revokeGoogleToken(token);
      } catch {
        providerRevocationConfirmed = false;
      }
    }
  }

  const { error: updateError } = await admin
    .from("integration_connections")
    .update({
      status: "disconnected",
      access_token_ciphertext: null,
      refresh_token_ciphertext: null,
      token_expires_at: null,
      last_error: null,
    })
    .eq("id", connectionId);

  if (updateError) {
    redirect(integrationsUrl("error", updateError.message));
  }

  await admin
    .from("integration_assets")
    .delete()
    .eq("connection_id", connectionId);

  await admin.from("integration_audit_log").insert({
    connection_id: connectionId,
    provider: connection.provider,
    event_type: "disconnected",
    actor_user_id: user.id,
    detail: {
      account_name: connection.account_name,
      provider_revocation_confirmed: providerRevocationConfirmed,
    },
  });

  revalidatePath("/settings/integrations");

  redirect(
    integrationsUrl(
      "notice",
      providerRevocationConfirmed
        ? "Integration disconnected."
        : "Integration disconnected from the CRM. Provider revocation could not be confirmed.",
    ),
  );
}

export async function discoverGoogleAssetsAction(formData: FormData) {
  const user = await requireAdmin();

  const connectionId = textValue(formData, "connection_id");

  if (!connectionId) {
    redirect(integrationsUrl("error", "Google connection is missing."));
  }

  const admin = createAdminClient();

  const { data: rawConnection, error: connectionError } = await admin
    .from("integration_connections")
    .select("id, provider, status, account_name")
    .eq("id", connectionId)
    .maybeSingle();

  const connection = rawConnection as unknown as {
    id: string;
    provider: string;
    status: string;
    account_name: string | null;
  } | null;

  if (
    connectionError ||
    !connection ||
    connection.provider !== "google" ||
    connection.status !== "connected"
  ) {
    redirect(
      integrationsUrl(
        "error",
        connectionError?.message ?? "Active Google connection not found.",
      ),
    );
  }

  let successMessage: string | null = null;

  let failureMessage: string | null = null;

  try {
    const accessToken = await getGoogleAccessTokenForConnection(connectionId);

    const discovery = await discoverGoogleAssets(accessToken);

    if (discovery.assets.length) {
      const rows = discovery.assets.map((asset) => ({
        connection_id: connectionId,
        asset_type: asset.asset_type,
        external_id: asset.external_id,
        name: asset.name,
        status: "available",
        metadata: asset.metadata,
        discovered_at: new Date().toISOString(),
      }));

      const { error: upsertError } = await admin
        .from("integration_assets")
        .upsert(rows, {
          onConflict: "connection_id,asset_type,external_id",
        });

      if (upsertError) {
        throw new Error(upsertError.message);
      }
    }

    await admin
      .from("integration_connections")
      .update({
        last_verified_at: new Date().toISOString(),
        last_error: discovery.warnings.length
          ? discovery.warnings.join(" | ")
          : null,
      })
      .eq("id", connectionId);

    await admin.from("integration_audit_log").insert({
      connection_id: connectionId,
      provider: "google",
      event_type: "assets_discovered",
      actor_user_id: user.id,
      detail: {
        discovered_count: discovery.assets.length,
        warnings: discovery.warnings,
      },
    });

    successMessage = discovery.warnings.length
      ? `Discovered ${discovery.assets.length} Google assets. ${discovery.warnings.join(" ")}`
      : `Discovered ${discovery.assets.length} Google assets.`;
  } catch (error) {
    failureMessage =
      error instanceof Error ? error.message : "Google asset discovery failed.";

    await admin
      .from("integration_connections")
      .update({
        last_error: failureMessage.slice(0, 1000),
      })
      .eq("id", connectionId);
  }

  revalidatePath("/settings/integrations");

  if (failureMessage) {
    redirect(integrationsUrl("error", failureMessage));
  }

  redirect(
    integrationsUrl(
      "notice",
      successMessage ?? "Google asset discovery completed.",
    ),
  );
}

export async function selectGoogleAssetAction(formData: FormData) {
  const user = await requireAdmin();

  const connectionId = textValue(formData, "connection_id");

  const assetId = textValue(formData, "asset_id");

  if (!connectionId || !assetId) {
    redirect(integrationsUrl("error", "Google asset selection is incomplete."));
  }

  const admin = createAdminClient();

  const { data: rawAsset, error: assetError } = await admin
    .from("integration_assets")
    .select("id, connection_id, asset_type, external_id, name")
    .eq("id", assetId)
    .eq("connection_id", connectionId)
    .maybeSingle();

  const asset = rawAsset as unknown as {
    id: string;
    connection_id: string;
    asset_type: string;
    external_id: string;
    name: string | null;
  } | null;

  if (
    assetError ||
    !asset ||
    !["ga4_property", "search_console_site", "google_ads_customer"].includes(
      asset.asset_type,
    )
  ) {
    redirect(
      integrationsUrl(
        "error",
        assetError?.message ?? "Google asset not found.",
      ),
    );
  }

  const { error: resetError } = await admin
    .from("integration_assets")
    .update({
      is_selected: false,
      status: "available",
    })
    .eq("connection_id", connectionId)
    .eq("asset_type", asset.asset_type);

  if (resetError) {
    redirect(integrationsUrl("error", resetError.message));
  }

  const { error: selectError } = await admin
    .from("integration_assets")
    .update({
      is_selected: true,
      status: "selected",
    })
    .eq("id", asset.id);

  if (selectError) {
    redirect(integrationsUrl("error", selectError.message));
  }

  await admin.from("integration_audit_log").insert({
    connection_id: connectionId,
    provider: "google",
    event_type: "asset_selected",
    actor_user_id: user.id,
    detail: {
      asset_type: asset.asset_type,
      external_id: asset.external_id,
      name: asset.name,
    },
  });

  revalidatePath("/settings/integrations");

  redirect(integrationsUrl("notice", "Google asset selected."));
}
