import "server-only";

import { LINK_IDENTITY_WINDOW_MS } from "@/lib/dm-links";

type AdminClient = { from: (table: string) => any; rpc: (fn: string, args: Record<string, unknown>) => any };

/**
 * Link a website visitor to the lead whose tracked link they opened (DM-LINK).
 * The code must belong to the same business as the tracking source, must have
 * been opened by a person through /go (first_opened_at set) within the last 30
 * days, and must not be revoked. Uses the existing exact-session identity
 * handoff, so the visitor's earlier and later visits count for that lead.
 * Never throws: tracking must not fail because linking did.
 */
export async function linkVisitorFromTrackedLink(
  admin: AdminClient,
  input: { organizationId: string; code: string; visitorId: string | null; sessionKey: string | null; now?: Date },
): Promise<"linked" | "skipped"> {
  try {
    if (!input.visitorId || !input.sessionKey) return "skipped";
    const { data: link } = await admin
      .from("dm_tracked_links")
      .select("lead_id, organization_id, first_opened_at, revoked_at")
      .eq("code", input.code)
      .eq("organization_id", input.organizationId)
      .maybeSingle();
    if (!link?.lead_id || !link.first_opened_at || link.revoked_at) return "skipped";
    const openedAt = Date.parse(String(link.first_opened_at));
    const now = (input.now ?? new Date()).getTime();
    if (!Number.isFinite(openedAt) || now - openedAt > LINK_IDENTITY_WINDOW_MS) return "skipped";
    const { data, error } = await admin.rpc("attach_exact_session_identity_v1", {
      p_organization_id: input.organizationId,
      p_lead_id: link.lead_id,
      p_anonymous_visitor_id: input.visitorId,
      p_session_key: input.sessionKey,
      p_source_system: "dm-tracked-link-v1",
      p_metadata: { tracked_link_code: input.code },
    });
    if (error || (data && typeof data === "object" && (data as { ok?: unknown }).ok === false)) return "skipped";
    return "linked";
  } catch {
    return "skipped";
  }
}
