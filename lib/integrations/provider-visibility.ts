import "server-only";

import { createClient } from "@/lib/supabase/server";
import { requireCurrentOrganizationId } from "@/lib/workspace";

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
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error(
      "Unable to resolve integration visibility: user is not authenticated.",
    );
  }

  const organizationId =
    await requireCurrentOrganizationId(
      supabase,
      user.id,
    );

  const {
    data,
    error,
  } = await supabase.rpc(
    "get_provider_visibility",
    {
      p_organization_id: organizationId,
    },
  );

  if (error) {
    throw new Error(
      `Unable to resolve connected integrations: ${error.message}`,
    );
  }

  const payload =
    (data ?? {}) as ProviderVisibilityRpc;

  return {
    organizationId:
      payload.organization_id ?? organizationId,
    googleConnected:
      payload.google_connected === true,
    metaConnected:
      payload.meta_connected === true,
  };
}
