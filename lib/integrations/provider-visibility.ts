import "server-only";

import { createClient } from "@/lib/supabase/server";

type ServerSupabaseClient =
  Awaited<ReturnType<typeof createClient>>;

export type ProviderVisibility = {
  organizationId: string;
  googleConnected: boolean;
  metaConnected: boolean;
};

type ProviderVisibilityRpc = {
  organization_id?: string | null;
  google_connected?: boolean | null;
  meta_connected?: boolean | null;
};

export async function getProviderVisibility(
  suppliedClient?: ServerSupabaseClient,
): Promise<ProviderVisibility> {
  const supabase =
    suppliedClient ?? (await createClient());

  const {
    data,
    error,
  } = await supabase.rpc(
    "get_current_provider_visibility_v1",
  );

  if (error) {
    throw new Error(
      `Unable to resolve connected integrations: ${error.message}`,
    );
  }

  const payload =
    (data ?? {}) as ProviderVisibilityRpc;

  if (!payload.organization_id) {
    throw new Error(
      "Unable to resolve integration visibility: no active organization was returned.",
    );
  }

  return {
    organizationId: payload.organization_id,
    googleConnected:
      payload.google_connected === true,
    metaConnected:
      payload.meta_connected === true,
  };
}
