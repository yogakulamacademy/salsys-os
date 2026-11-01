import { NextRequest, NextResponse } from "next/server";

import {
  getAvailableRecommendationFeedbackEvents,
  isRecommendationFeedbackEvent,
  normalizeRecommendationLifecycle,
} from "@/lib/intelligence/recommendation-lifecycle";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceContext } from "@/lib/workspace";

export const dynamic = "force-dynamic";

const privateHeaders = { "Cache-Control": "private, no-store" };
const PRIVILEGED_ROLES = new Set(["owner", "admin", "manager"]);
const MAX_NOTE_LENGTH = 500;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SIGNAL_IDS = [
  "reply_backlog",
  "overdue_followups",
  "first_touch_needed",
  "payment_pending",
] as const;

type JsonRecord = Record<string, unknown>;

type RecommendationRow = {
  id: string;
  state: string;
  accepted_at: string | null;
  dismissed_at: string | null;
  acted_at: string | null;
  completed_at: string | null;
  updated_at: string | null;
};

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return json({ ok: false, error: "Invalid request origin." }, 403);
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return json({ ok: false, error: "Authentication required." }, 401);
    }

    const workspace = await getCurrentWorkspaceContext(supabase);
    const activeWorkspace = workspace.activeWorkspace;

    if (!activeWorkspace?.organizationId) {
      return json({ ok: false, error: "Unable to resolve the active workspace." }, 401);
    }

    if (!PRIVILEGED_ROLES.has(activeWorkspace.role)) {
      return json({ ok: false, error: "Privileged workspace access is required." }, 403);
    }

    const payload = await readJson(request);
    const recommendationId = textValue(payload.recommendationId);
    const eventType = payload.eventType;
    const rawNote = payload.note;

    if (!UUID_PATTERN.test(recommendationId)) {
      return json({ ok: false, error: "A valid recommendation is required." }, 400);
    }

    if (!isRecommendationFeedbackEvent(eventType)) {
      return json({ ok: false, error: "Unsupported recommendation action." }, 400);
    }

    if (rawNote != null && typeof rawNote !== "string") {
      return json({ ok: false, error: "Recommendation note must be text." }, 400);
    }

    const note = typeof rawNote === "string" ? rawNote.trim() : "";
    if (note.length > MAX_NOTE_LENGTH) {
      return json(
        {
          ok: false,
          error: `Recommendation note must be ${MAX_NOTE_LENGTH} characters or fewer.`,
        },
        400,
      );
    }

    const organizationId = activeWorkspace.organizationId;
    const db = supabase as any;
    const before = await readHomeRecommendation(db, organizationId, recommendationId);

    if (before.error) {
      console.error("R10 recommendation feedback pre-read failed", before.error);
      return json({ ok: false, error: "Recommendation feedback is temporarily unavailable." }, 503);
    }

    if (!before.row) {
      return json({ ok: false, error: "Recommendation not found in this workspace." }, 404);
    }

    const { data: recorded, error: feedbackError } = await db.rpc(
      "record_system_intelligence_recommendation_feedback_v1",
      {
        p_recommendation_id: recommendationId,
        p_event_type: eventType,
        p_note: note || null,
      },
    );

    if (feedbackError || recorded !== true) {
      const afterFailure = await readHomeRecommendation(
        db,
        organizationId,
        recommendationId,
      );
      const status = feedbackErrorStatus(feedbackError);
      const message = feedbackErrorMessage(feedbackError, status);

      if (status >= 500) {
        console.error("R10 recommendation feedback RPC failed", feedbackError);
      }

      return json(
        {
          ok: false,
          error: message,
          recommendation: afterFailure.row
            ? recommendationSnapshot(afterFailure.row)
            : null,
        },
        status,
      );
    }

    const after = await readHomeRecommendation(db, organizationId, recommendationId);
    if (after.error || !after.row) {
      console.error("R10 recommendation feedback read-back failed", after.error);
      return json({ ok: false, error: "Recommendation state could not be verified." }, 503);
    }

    return json({
      ok: true,
      recommendation: recommendationSnapshot(after.row),
    });
  } catch (error) {
    console.error("R10 recommendation feedback request failed", error);
    return json({ ok: false, error: "Recommendation feedback is temporarily unavailable." }, 500);
  }
}

async function readHomeRecommendation(
  db: any,
  organizationId: string,
  recommendationId: string,
): Promise<{ row: RecommendationRow | null; error: unknown }> {
  const { data, error } = await db
    .from("system_intelligence_recommendations")
    .select("id,state,accepted_at,dismissed_at,acted_at,completed_at,updated_at")
    .eq("id", recommendationId)
    .eq("organization_id", organizationId)
    .eq("surface", "home")
    .eq("source_version", "r10-p1")
    .eq("category", "crm_operations")
    .eq("role_scope", "owner_admin_manager")
    .in("signal_id", [...SIGNAL_IDS])
    .maybeSingle();

  return {
    row: data ? (data as RecommendationRow) : null,
    error,
  };
}

function recommendationSnapshot(row: RecommendationRow) {
  const lifecycleState = normalizeRecommendationLifecycle(row);
  return {
    id: String(row.id),
    lifecycleState,
    acceptedAt: row.accepted_at ?? null,
    dismissedAt: row.dismissed_at ?? null,
    actedAt: row.acted_at ?? null,
    completedAt: row.completed_at ?? null,
    updatedAt: row.updated_at ?? null,
    availableActions: getAvailableRecommendationFeedbackEvents(lifecycleState),
  };
}

async function readJson(request: NextRequest): Promise<JsonRecord> {
  try {
    const value = await request.json();
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as JsonRecord)
      : {};
  } catch {
    return {};
  }
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: privateHeaders });
}

function textValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function feedbackErrorStatus(error: unknown) {
  if (hasDatabaseError(error, "INTELLIGENCE_RECOMMENDATION_NOT_FOUND")) return 404;
  if (
    hasDatabaseError(error, "INTELLIGENCE_TRANSITION_INVALID") ||
    hasDatabaseError(error, "INTELLIGENCE_ACTION_ALREADY_COMPLETED")
  ) {
    return 409;
  }
  if (hasDatabaseError(error, "INTELLIGENCE_FEEDBACK_EVENT_INVALID")) return 400;
  if (hasDatabaseError(error, "INTELLIGENCE_PRIVILEGED_ROLE_REQUIRED")) return 403;
  if (hasDatabaseError(error, "AUTHENTICATED_TENANT_REQUIRED")) return 401;
  return 503;
}

function feedbackErrorMessage(error: unknown, status: number) {
  if (status === 404) return "Recommendation not found in this workspace.";
  if (status === 409) {
    return "This recommendation changed before your action was applied. The latest state is shown.";
  }
  if (status === 400) return "That recommendation action is not valid.";
  if (status === 401) return "Authentication required.";
  if (status === 403) return "Privileged workspace access is required.";
  return "Recommendation feedback is temporarily unavailable.";
}

function hasDatabaseError(error: unknown, needle: string) {
  if (!error || typeof error !== "object") return false;
  const source = error as {
    message?: unknown;
    details?: unknown;
    hint?: unknown;
    code?: unknown;
  };
  return [source.message, source.details, source.hint, source.code]
    .map((value) => String(value ?? ""))
    .some((value) => value.includes(needle));
}
