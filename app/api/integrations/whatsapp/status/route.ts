import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentWorkspaceContext } from "@/lib/workspace";

export const dynamic = "force-dynamic";

const privateHeaders = { "Cache-Control": "private, no-store" };

export async function GET() {
  try {
    const workspace = await getCurrentWorkspaceContext();
    const organizationId = workspace?.activeOrganizationId;

    if (!organizationId) {
      return NextResponse.json(
        { ok: false, error: "Unable to resolve the active workspace." },
        { status: 401, headers: privateHeaders },
      );
    }

    // integration_connections and whatsapp_accounts are intentionally not
    // exposed through end-user RLS. Read only the non-secret state needed by
    // the UI after the signed-in workspace has been resolved.
    const admin = createAdminClient();
    const [{ data: connection, error: connectionError }, { data: account, error: accountError }] =
      await Promise.all([
        admin
          .from("integration_connections")
          .select("id,status,last_verified_at,updated_at")
          .eq("organization_id", organizationId)
          .eq("provider", "whatsapp")
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        admin
          .from("whatsapp_accounts")
          .select("connection_id,active,is_default")
          .eq("organization_id", organizationId)
          .eq("active", true)
          .eq("is_default", true)
          .limit(1)
          .maybeSingle(),
      ]);

    if (connectionError || accountError) {
      console.error("WhatsApp connection-state read failed", connectionError || accountError);
      return NextResponse.json(
        { ok: false, error: "WhatsApp connection state is temporarily unavailable." },
        { status: 503, headers: privateHeaders },
      );
    }

    const connected = Boolean(
      connection?.id &&
        connection.status === "connected" &&
        account?.active === true &&
        account?.is_default === true &&
        account.connection_id === connection.id,
    );

    return NextResponse.json(
      {
        ok: true,
        state: connected ? "connected" : "disconnected",
        verifiedAt: connection?.last_verified_at ?? null,
        reason: connected
          ? null
          : !connection
            ? "connection_missing"
            : connection.status !== "connected"
              ? "connection_inactive"
              : !account
                ? "sender_missing"
                : "sender_mismatch",
      },
      { headers: privateHeaders },
    );
  } catch (error) {
    console.error("WhatsApp connection-state request failed", error);
    return NextResponse.json(
      { ok: false, error: "Unable to verify WhatsApp connection state." },
      { status: 500, headers: privateHeaders },
    );
  }
}
