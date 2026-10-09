import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentOrganizationId } from "@/lib/workspace";

type ServerSupabaseClient =
  Awaited<ReturnType<typeof createClient>>;

export type ProviderVisibility = {
  organizationId: string;
  googleConnected: boolean;
  metaConnected: boolean;
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

  /*
   * integration_connections is intentionally not exposed through
   * the ordinary authenticated-user RLS path.
   *
   * The organization boundary is resolved first through the
   * authenticated user's workspace membership. Only after that
   * authorization succeeds do we use the server-only admin client
   * for this narrow connection-status lookup.
   */
  const admin = createAdminClient();

  const {
    data,
    error,
  } = await admin
    .from("integration_connections")
    .select("provider,status")
    .eq("organization_id", organizationId)
    .eq("status", "connected")
    .in("provider", ["google", "meta"]);

  if (error) {
    throw new Error(
      `Unable to resolve connected integrations: ${error.message}`,
    );
  }

  const providers = new Set(
    (data ?? []).map((row) =>
      String(row.provider ?? "")
        .trim()
        .toLowerCase(),
    ),
  );

  return {
    organizationId,
    googleConnected:
      providers.has("google"),
    metaConnected:
      providers.has("meta"),
  };
}