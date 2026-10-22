import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

import { getLead } from "@/lib/data";
import { getLeadInspectorData } from "@/lib/lead-inspector-data";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const privateHeaders = { "Cache-Control": "private, no-store" };

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const payload = await getLeadInspectorData(id);

    if (!payload) {
      return NextResponse.json(
        { ok: false, error: "Lead not found or access denied." },
        { status: 404, headers: privateHeaders },
      );
    }

    return NextResponse.json(
      { ok: true, data: payload },
      { headers: privateHeaders },
    );
  } catch (error) {
    console.error("Lead Inspector request failed", error);
    return NextResponse.json(
      { ok: false, error: "Unable to load the Lead Inspector right now." },
      { status: 500, headers: privateHeaders },
    );
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  if (!sameOrigin(request)) {
    return NextResponse.json(
      { ok: false, error: "Invalid request origin." },
      { status: 403, headers: privateHeaders },
    );
  }

  try {
    const { id } = await context.params;
    const lead = await getLead(id);

    // Preserve the exact Lead-level permission boundary used by the rest of
    // the CRM before invoking canonical task mutation RPCs.
    if (!lead) {
      return NextResponse.json(
        { ok: false, error: "Lead not found or access denied." },
        { status: 404, headers: privateHeaders },
      );
    }

    const body = (await request.json().catch(() => null)) as
      | {
          action?: unknown;
          title?: unknown;
          dueAt?: unknown;
          description?: unknown;
          taskId?: unknown;
        }
      | null;

    const action = text(body?.action);
    const supabase = await createClient();

    if (action === "complete_followup") {
      const taskId = text(body?.taskId);
      if (!taskId) {
        return NextResponse.json(
          { ok: false, error: "A follow-up task is required." },
          { status: 400, headers: privateHeaders },
        );
      }

      // Bind the requested task to the lead in this route before calling the
      // canonical completion RPC. This prevents a task ID from another lead
      // being completed through a mismatched Conversation URL.
      const { data: task, error: taskError } = await supabase
        .from("tasks")
        .select("id,lead_id,status")
        .eq("id", taskId)
        .eq("lead_id", id)
        .maybeSingle();

      if (taskError || !task) {
        return NextResponse.json(
          { ok: false, error: taskError?.message ?? "Follow-up not found or access denied." },
          { status: 404, headers: privateHeaders },
        );
      }

      if (task.status === "completed") {
        return NextResponse.json(
          { ok: true, data: task },
          { headers: privateHeaders },
        );
      }

      const { data, error } = await supabase.rpc("complete_followup_task", {
        p_task_id: taskId,
      });

      if (error) {
        return NextResponse.json(
          { ok: false, error: error.message },
          { status: 400, headers: privateHeaders },
        );
      }

      revalidateConversationPaths(id);
      return NextResponse.json(
        { ok: true, data },
        { headers: privateHeaders },
      );
    }

    if (action !== "create_followup") {
      return NextResponse.json(
        { ok: false, error: "Unsupported Inspector action." },
        { status: 400, headers: privateHeaders },
      );
    }

    const title = text(body?.title);
    const description = text(body?.description);
    const rawDueAt = text(body?.dueAt);
    const dueAt = rawDueAt ? new Date(rawDueAt) : null;

    if (!title || !dueAt || Number.isNaN(dueAt.getTime())) {
      return NextResponse.json(
        { ok: false, error: "Follow-up title and a valid due time are required." },
        { status: 400, headers: privateHeaders },
      );
    }

    // The quick scheduler is for future work. Keep a small clock-skew margin
    // while preventing accidental creation of already-overdue tasks.
    if (dueAt.getTime() < Date.now() - 60_000) {
      return NextResponse.json(
        { ok: false, error: "Choose a follow-up time in the future." },
        { status: 400, headers: privateHeaders },
      );
    }

    if (title.length > 240 || (description?.length ?? 0) > 4000) {
      return NextResponse.json(
        { ok: false, error: "Follow-up details are too long." },
        { status: 400, headers: privateHeaders },
      );
    }

    const { data, error } = await supabase.rpc("create_followup_task", {
      p_lead_id: id,
      p_title: title,
      p_due_at: dueAt.toISOString(),
      p_description: description,
    });

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 400, headers: privateHeaders },
      );
    }

    revalidateConversationPaths(id);

    return NextResponse.json(
      { ok: true, data },
      { headers: privateHeaders },
    );
  } catch (error) {
    console.error("Lead Inspector action failed", error);
    return NextResponse.json(
      { ok: false, error: "Unable to complete the Inspector action right now." },
      { status: 500, headers: privateHeaders },
    );
  }
}

function revalidateConversationPaths(leadId: string) {
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/leads");
  revalidatePath("/follow-ups");
  revalidatePath("/conversations");
  revalidatePath("/admissions");
  revalidatePath("/pipeline");
  revalidatePath("/funnel");
  revalidatePath("/dashboard");
}

function sameOrigin(request: NextRequest) {
  return request.headers.get("origin") === request.nextUrl.origin;
}

function text(value: unknown) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized || null;
}
