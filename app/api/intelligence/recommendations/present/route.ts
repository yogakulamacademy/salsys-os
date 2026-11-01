import { NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceContext } from "@/lib/workspace";

export const dynamic = "force-dynamic";

const privateHeaders = { "Cache-Control": "private, no-store" };
const PRIVILEGED_ROLES = new Set(["owner", "admin", "manager"]);
const TARGET_LIMIT = 50;

type SignalId =
  | "reply_backlog"
  | "overdue_followups"
  | "first_touch_needed"
  | "payment_pending";

type CandidateRow = {
  organization_id: string;
  signal_id: SignalId;
  lead_id: string;
  signal_at: string | null;
  target_rank: number | string;
  baseline_value: number | string;
};

type EpisodeRow = {
  signal_id: SignalId;
  is_active: boolean;
  episode_sequence: number | string;
  recommendation_key: string | null;
};

type RecommendationConfig = {
  signalId: SignalId;
  title: string;
  score: number;
  actionText: string;
  reasonText: (baseline: number, targets: number) => string;
  baselineMetric: string;
  evidenceLabel: string;
  href: string;
};

const recommendationConfigs: RecommendationConfig[] = [
  {
    signalId: "payment_pending",
    title: "Reconcile payment-pending opportunities",
    score: 95,
    actionText: "Review payment-pending opportunities and reconcile the next required step.",
    reasonText: (baseline, targets) =>
      `${baseline.toLocaleString("en-IN")} opportunities are currently at payment stage. The working set starts with ${targets.toLocaleString("en-IN")} oldest payment-stage lead${targets === 1 ? "" : "s"}.`,
    baselineMetric: "payment_pending",
    evidenceLabel: "Observed pipeline & payment state",
    href: "/admissions?view=payments",
  },
  {
    signalId: "overdue_followups",
    title: "Complete overdue follow-ups",
    score: 90,
    actionText: "Work the oldest overdue follow-ups first.",
    reasonText: (baseline, targets) =>
      `${baseline.toLocaleString("en-IN")} follow-up task${baseline === 1 ? " is" : "s are"} already due. The working set covers ${targets.toLocaleString("en-IN")} lead${targets === 1 ? "" : "s"} with the earliest overdue actions.`,
    baselineMetric: "overdue_followups",
    evidenceLabel: "Observed scheduled task evidence",
    href: "/follow-ups",
  },
  {
    signalId: "reply_backlog",
    title: "Work the oldest unanswered conversations",
    score: 85,
    actionText: "Reply to the oldest active conversations still waiting on your team.",
    reasonText: (baseline, targets) =>
      `${baseline.toLocaleString("en-IN")} active conversation${baseline === 1 ? " is" : "s are"} waiting for a reply. Start with the oldest ${targets.toLocaleString("en-IN")} lead${targets === 1 ? "" : "s"} in the bounded working set.`,
    baselineMetric: "needs_reply",
    evidenceLabel: "Observed conversation state",
    href: "/conversations",
  },
  {
    signalId: "first_touch_needed",
    title: "Make first contact with untouched new leads",
    score: 80,
    actionText: "Start the first outbound touch for new CRM opportunities with no recorded message or contact.",
    reasonText: (baseline, targets) =>
      `${baseline.toLocaleString("en-IN")} new opportunit${baseline === 1 ? "y has" : "ies have"} no recorded message or first contact. The working set starts with the oldest ${targets.toLocaleString("en-IN")} lead${targets === 1 ? "" : "s"}.`,
    baselineMetric: "needs_first_touch",
    evidenceLabel: "Observed CRM contact history",
    href: "/leads?view=unassigned",
  },
];

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return NextResponse.json(
      { ok: false, error: "Invalid request origin." },
      { status: 403, headers: privateHeaders },
    );
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { ok: false, error: "Authentication required." },
        { status: 401, headers: privateHeaders },
      );
    }

    const workspace = await getCurrentWorkspaceContext(supabase);
    const activeWorkspace = workspace.activeWorkspace;

    if (!activeWorkspace?.organizationId) {
      return NextResponse.json(
        { ok: false, error: "Unable to resolve the active workspace." },
        { status: 401, headers: privateHeaders },
      );
    }

    if (!PRIVILEGED_ROLES.has(activeWorkspace.role)) {
      return NextResponse.json(
        { ok: false, error: "Privileged workspace access is required." },
        { status: 403, headers: privateHeaders },
      );
    }

    const organizationId = activeWorkspace.organizationId;
    const db = supabase as any;

    const { data: candidateData, error: candidateError } = await db
      .from("v_r10_command_center_recommendation_candidates_v1")
      .select(
        "organization_id,signal_id,lead_id,signal_at,target_rank,baseline_value",
      )
      .eq("organization_id", organizationId)
      .lte("target_rank", TARGET_LIMIT)
      .order("signal_id", { ascending: true })
      .order("target_rank", { ascending: true });

    if (candidateError) {
      console.error("R10 recommendation candidate read failed", candidateError);
      return NextResponse.json(
        { ok: false, error: "Recommended actions are temporarily unavailable." },
        { status: 503, headers: privateHeaders },
      );
    }

    const candidateGroups = groupCandidates(
      (candidateData ?? []) as CandidateRow[],
    );
    const recommendations: Array<Record<string, unknown>> = [];

    for (const config of recommendationConfigs) {
      const rows = candidateGroups.get(config.signalId) ?? [];
      const baseline = rows.length ? safeNumber(rows[0].baseline_value) : 0;
      const targetIds = rows
        .map((row) => String(row.lead_id ?? "").trim())
        .filter(Boolean)
        .slice(0, TARGET_LIMIT);

      const { data: episodeData, error: episodeError } = await db.rpc(
        "resolve_system_intelligence_signal_episode_v1",
        {
          p_signal_id: config.signalId,
          p_is_active: baseline > 0,
          p_signal_value: baseline,
        },
      );

      if (episodeError) {
        console.error(
          `R10 recommendation episode resolution failed for ${config.signalId}`,
          episodeError,
        );
        return NextResponse.json(
          { ok: false, error: "Recommended actions are temporarily unavailable." },
          { status: 503, headers: privateHeaders },
        );
      }

      const episode = ((episodeData ?? [])[0] ?? null) as EpisodeRow | null;
      const recommendationKey = episode?.recommendation_key?.trim() ?? "";

      if (!episode?.is_active || !recommendationKey || baseline <= 0) {
        continue;
      }

      const { data: existing, error: existingError } = await db
        .from("system_intelligence_recommendations")
        .select("id,state,completed_at")
        .eq("organization_id", organizationId)
        .eq("recommendation_key", recommendationKey)
        .maybeSingle();

      if (existingError) {
        console.error("R10 recommendation state read failed", existingError);
        return NextResponse.json(
          { ok: false, error: "Recommended actions are temporarily unavailable." },
          { status: 503, headers: privateHeaders },
        );
      }

      if (
        existing &&
        (String(existing.state ?? "") !== "active" || existing.completed_at)
      ) {
        continue;
      }

      const reasonText = config.reasonText(baseline, targetIds.length);
      const { data: recommendationId, error: touchError } = await db.rpc(
        "touch_system_intelligence_recommendation_v2",
        {
          p_recommendation_key: recommendationKey,
          p_surface: "home",
          p_source_version: "r10-p1",
          p_signal_id: config.signalId,
          p_category: "crm_operations",
          p_role_scope: "owner_admin_manager",
          p_score: config.score,
          p_action_text: config.actionText,
          p_reason_text: reasonText,
          p_baseline_metric: config.baselineMetric,
          p_baseline_value: baseline,
          p_desired_direction: "decrease",
          p_target_lead_ids: targetIds,
        },
      );

      if (touchError || !recommendationId) {
        console.error(
          `R10 recommendation presentation failed for ${config.signalId}`,
          touchError,
        );
        return NextResponse.json(
          { ok: false, error: "Recommended actions are temporarily unavailable." },
          { status: 503, headers: privateHeaders },
        );
      }

      recommendations.push({
        id: String(recommendationId),
        signalId: config.signalId,
        episodeSequence: safeNumber(episode.episode_sequence),
        title: config.title,
        score: config.score,
        actionText: config.actionText,
        reasonText,
        baselineValue: baseline,
        targetLeadCount: targetIds.length,
        evidenceLabel: config.evidenceLabel,
        href: config.href,
      });
    }

    recommendations.sort((left, right) =>
      safeNumber(right.score) - safeNumber(left.score),
    );

    return NextResponse.json(
      {
        ok: true,
        evidenceClass: "deterministic_crm",
        recommendations,
      },
      { headers: privateHeaders },
    );
  } catch (error) {
    console.error("R10 recommendation presentation request failed", error);
    return NextResponse.json(
      { ok: false, error: "Recommended actions are temporarily unavailable." },
      { status: 500, headers: privateHeaders },
    );
  }
}

function groupCandidates(rows: CandidateRow[]) {
  const groups = new Map<SignalId, CandidateRow[]>();

  for (const row of rows) {
    if (!isSignalId(row.signal_id)) continue;
    const group = groups.get(row.signal_id) ?? [];
    group.push(row);
    groups.set(row.signal_id, group);
  }

  return groups;
}

function isSignalId(value: string): value is SignalId {
  return recommendationConfigs.some((config) => config.signalId === value);
}

function safeNumber(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}
