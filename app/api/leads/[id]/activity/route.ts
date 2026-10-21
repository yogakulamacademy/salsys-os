import { NextResponse } from "next/server";

import { getLead } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const privateHeaders = { "Cache-Control": "private, no-store" };

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;

    // Reuse the CRM's authoritative lead-access boundary before reading the
    // activity stream. A denied lead is indistinguishable from a missing one.
    const lead = await getLead(id);
    if (!lead) {
      return NextResponse.json(
        { ok: false, error: "Lead not found or access denied." },
        { status: 404, headers: privateHeaders },
      );
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("activities")
      .select(
        "id,activity_type,channel,actor_type,actor_id,title,details,metadata,occurred_at,created_at",
      )
      .eq("lead_id", id)
      .order("occurred_at", { ascending: false })
      .limit(60);

    if (error) {
      return NextResponse.json(
        { ok: false, error: "Activity is temporarily unavailable." },
        { status: 503, headers: privateHeaders },
      );
    }

    return NextResponse.json(
      { ok: true, data: data ?? [] },
      { headers: privateHeaders },
    );
  } catch (error) {
    console.error("Conversation activity request failed", error);
    return NextResponse.json(
      { ok: false, error: "Unable to load conversation activity right now." },
      { status: 500, headers: privateHeaders },
    );
  }
}
