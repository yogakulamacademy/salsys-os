import "server-only";

import { createClient } from "@/lib/supabase/server";
import { requireCurrentOrganizationId } from "@/lib/workspace";

export type BookingActivityRow = {
  touchpointId: string;
  leadId: string;
  leadName: string;
  leadCode: string;
  bookingReference: string;
  occurredAt: string;
  source: string | null;
};

export type BookingActivityPayload = {
  rows: BookingActivityRow[];
  total30d: number;
  warning: string | null;
};

export async function getRecentBookingActivity(
  limit = 8,
): Promise<BookingActivityPayload> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error("Unable to load booking activity: user is not authenticated.");
  }

  const organizationId = await requireCurrentOrganizationId(supabase, user.id);
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data: touchpoints, error: touchpointError, count } = await supabase
    .from("touchpoints")
    .select("id,lead_id,occurred_at,source,metadata", { count: "exact" })
    .eq("organization_id", organizationId)
    .eq("event_type", "booking.completed")
    .gte("occurred_at", since)
    .not("lead_id", "is", null)
    .order("occurred_at", { ascending: false })
    .limit(Math.max(1, Math.min(limit, 20)));

  if (touchpointError) {
    return {
      rows: [],
      total30d: 0,
      warning: `Booking activity could not be loaded: ${touchpointError.message}`,
    };
  }

  const leadIds = Array.from(
    new Set(
      (touchpoints ?? [])
        .map((row) => String(row.lead_id ?? "").trim())
        .filter(Boolean),
    ),
  );

  if (leadIds.length === 0) {
    return { rows: [], total30d: Number(count ?? 0), warning: null };
  }

  const { data: leads, error: leadError } = await supabase
    .from("leads")
    .select("id,display_name,lead_code")
    .eq("organization_id", organizationId)
    .in("id", leadIds);

  if (leadError) {
    return {
      rows: [],
      total30d: Number(count ?? 0),
      warning: `Booking activity loaded, but Lead details could not be resolved: ${leadError.message}`,
    };
  }

  const leadById = new Map(
    (leads ?? []).map((lead) => [
      String(lead.id),
      {
        name: String(lead.display_name ?? "").trim() || "Unnamed lead",
        code: String(lead.lead_code ?? "").trim(),
      },
    ]),
  );

  const rows: BookingActivityRow[] = [];

  for (const row of touchpoints ?? []) {
    const leadId = String(row.lead_id ?? "").trim();
    const lead = leadById.get(leadId);
    if (!lead) continue;

    const metadata =
      row.metadata && typeof row.metadata === "object"
        ? (row.metadata as Record<string, unknown>)
        : {};
    const bookingReference = String(metadata.booking_reference ?? "").trim();

    rows.push({
      touchpointId: String(row.id),
      leadId,
      leadName: lead.name,
      leadCode: lead.code,
      bookingReference: bookingReference || "Booking reference unavailable",
      occurredAt: String(row.occurred_at ?? ""),
      source: row.source ? String(row.source) : null,
    });
  }

  return {
    rows,
    total30d: Number(count ?? 0),
    warning: null,
  };
}
