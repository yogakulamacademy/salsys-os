import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

import { getLead } from "@/lib/data";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const privateHeaders = { "Cache-Control": "private, no-store" };
const MAX_INTERNAL_NOTE_LENGTH = 4000;

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

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return NextResponse.json(
      { ok: false, error: "Invalid request origin." },
      { status: 403, headers: privateHeaders },
    );
  }

  try {
    const { id } = await context.params;
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { ok: false, error: "Authentication is required." },
        { status: 401, headers: privateHeaders },
      );
    }

    // Internal notes are mutations, so require the stronger can_work_lead()
    // permission rather than relying only on read access.
    const { data: canWorkLead, error: accessError } = await supabase.rpc(
      "can_work_lead",
      { p_lead_id: id },
    );

    if (accessError || canWorkLead !== true) {
      return NextResponse.json(
        { ok: false, error: "Lead not found or access denied." },
        { status: 403, headers: privateHeaders },
      );
    }

    const body = (await request.json().catch(() => null)) as
      | { type?: unknown; body?: unknown }
      | null;
    const type = typeof body?.type === "string" ? body.type.trim() : "";
    const note = typeof body?.body === "string" ? body.body.trim() : "";

    if (type !== "internal_note") {
      return NextResponse.json(
        { ok: false, error: "Unsupported activity action." },
        { status: 400, headers: privateHeaders },
      );
    }

    if (!note) {
      return NextResponse.json(
        { ok: false, error: "Write an internal note before saving." },
        { status: 400, headers: privateHeaders },
      );
    }

    if (note.length > MAX_INTERNAL_NOTE_LENGTH) {
      return NextResponse.json(
        { ok: false, error: `Internal notes are limited to ${MAX_INTERNAL_NOTE_LENGTH} characters.` },
        { status: 400, headers: privateHeaders },
      );
    }

    // activities currently permits direct authenticated inserts only for a
    // narrow payment audit policy. We therefore use the server-only admin
    // client only after the signed-in actor has passed can_work_lead(). The
    // activity remains lead-scoped and is readable only through existing
    // can_access_lead() RLS.
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("activities")
      .insert({
        lead_id: id,
        activity_type: "internal_note",
        actor_type: "human",
        actor_id: user.id,
        title: "Internal note",
        details: note,
        metadata: {
          source: "conversations",
          visibility: "internal",
        },
      })
      .select(
        "id,activity_type,channel,actor_type,actor_id,title,details,metadata,occurred_at,created_at",
      )
      .single();

    if (error) {
      return NextResponse.json(
        { ok: false, error: "Unable to save the internal note." },
        { status: 500, headers: privateHeaders },
      );
    }

    revalidatePath(`/leads/${id}`);
    revalidatePath("/conversations");

    return NextResponse.json(
      { ok: true, data },
      { headers: privateHeaders },
    );
  } catch (error) {
    console.error("Conversation internal note failed", error);
    return NextResponse.json(
      { ok: false, error: "Unable to save the internal note right now." },
      { status: 500, headers: privateHeaders },
    );
  }
}
