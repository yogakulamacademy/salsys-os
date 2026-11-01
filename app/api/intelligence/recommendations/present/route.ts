import { NextRequest, NextResponse } from "next/server";

import {
  normalizeRecommendationLifecycle,
  parseRecommendationEpisodeSequence,
  type RecommendationLifecycle,
} from "@/lib/intelligence/recommendation-lifecycle";
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
  priority_score: number | string | null;
  max_priority_score: number | string | null;
};

type EpisodeRow = {
  signal_id: SignalId;
  is_active: boolean;
  episode_sequence: number | string;
  recommendation_key: string | null;
};

type PersistedRecommendationRow = {
  id: string;
  recommendation_key: string;
  signal_id: string;
  state: string;
  score: number | string;
  action_text: string;
  reason_text: string;
  baseline_value: number | string | null;
  target_lead_count: number | string;
  accepted_at: string | null;
  dismissed_at: string | null;
  acted_at: string | null;
  completed_at: string | null;
  updated_at: string | null;
};

type RecommendationConfig = {
  signalId: SignalId;
  title: string;
  actionText: string;
  reasonText: (baseline: number, targets: number) => string;
  baselineMetric: string;
  evidenceLabel: string;
  href: string;
};

type PresentedRecommendation = {
  id: string;
  signalId: SignalId;
  episodeSequence: number;
  title: string;
  score: number;
  actionText: string;
  reasonText: string;
  baselineValue: number;
  targetLeadCount: number;
  evidenceLabel: string;
  href: string;
  lifecycleState: RecommendationLifecycle;
  acceptedAt: string | null;
  dismissedAt: string | null;
  actedAt: string | null;
  completedAt: string | null;
};

const recommendationConfigs: RecommendationConfig[] = [
  {
    signalId: "payment_pending",
    title: "Reconcile payment-pending opportunities",
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
    actionText: "Start the first outbound touch for new CRM opportunities with no recorded message or contact.",
    reasonText: (baseline, targets) =>
      `${baseline.toLocaleString("en-IN")} new opportunit${baseline === 1 ? "y has" : "ies have"} no recorded message or first contact. The working set starts with the oldest ${targets.toLocaleString("en-IN")} lead${targets === 1 ? "" : "s"}.`,
    baselineMetric: "needs_first_touch",
    evidenceLabel: "Observed CRM contact history",
    href: "/leads?view=unassigned",
  },
];

const recommendationConfigBySignal = new Map(
  recommendationConfigs.map((config) => [config.signalId, config] as const),
);

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
      .from("v_r10_command_center_recommendation_candidates_v2")
      .select(
        "organization_id,signal_id,lead_id,signal_at,target_rank,baseline_value,priority_score,max_priority_score",
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
    const recommendations: PresentedRecommendation[] = [];
    const unavailableSignals: SignalId[] = [];

    for (const config of recommendationConfigs) {
      const rows = candidateGroups.get(config.signalId) ?? [];
      const baseline = rows.length ? safeNumber(rows[0].baseline_value) : 0;
      const score = rows.length
        ? clampPriority(safeNumber(rows[0].max_priority_score))
        : 0;
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
        unavailableSignals.push(config.signalId);
        console.error(
          `R10 recommendation episode resolution failed for ${config.signalId}`,
          episodeError,
        );
        continue;
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
        unavailableSignals.push(config.signalId);
        console.error("R10 recommendation state read failed", existingError);
        continue;
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
          p_score: score,
          p_action_text: config.actionText,
          p_reason_text: reasonText,
          p_baseline_metric: config.baselineMetric,
          p_baseline_value: baseline,
          p_desired_direction: "decrease",
          p_target_lead_ids: targetIds,
        },
      );

      if (touchError || !recommendationId) {
        if (hasDatabaseError(touchError, "INTELLIGENCE_EPISODE_TERMINAL")) {
          // A concurrent human lifecycle action won the race. Do not classify the
          // signal as unavailable and do not retry the touch. The committed-work
          // read below will return accepted/started work when appropriate.
          continue;
        }

        unavailableSignals.push(config.signalId);
        console.error(
          `R10 recommendation presentation failed for ${config.signalId}`,
          touchError,
        );
        continue;
      }

      recommendations.push({
        id: String(recommendationId),
        signalId: config.signalId,
        episodeSequence: safeNumber(episode.episode_sequence),
        title: config.title,
        score,
        actionText: config.actionText,
        reasonText,
        baselineValue: baseline,
        targetLeadCount: targetIds.length,
        evidenceLabel: config.evidenceLabel,
        href: config.href,
        lifecycleState: "active",
        acceptedAt: null,
        dismissedAt: null,
        actedAt: null,
        completedAt: null,
      });
    }

    const { data: committedData, error: committedError } = await db
      .from("system_intelligence_recommendations")
      .select(
        "id,recommendation_key,signal_id,state,score,action_text,reason_text,baseline_value,target_lead_count,accepted_at,dismissed_at,acted_at,completed_at,updated_at",
      )
      .eq("organization_id", organizationId)
      .eq("surface", "home")
      .eq("source_version", "r10-p1")
      .eq("category", "crm_operations")
      .eq("role_scope", "owner_admin_manager")
      .in(
        "signal_id",
        recommendationConfigs.map((config) => config.signalId),
      )
      .in("state", ["accepted", "acted"])
      .is("dismissed_at", null)
      .is("completed_at", null)
      .order("updated_at", { ascending: false });

    let committedUnavailable = false;
    if (committedError) {
      committedUnavailable = true;
      console.error("R10 committed recommendation read failed", committedError);
    } else {
      const seenIds = new Set(recommendations.map((row) => row.id));

      for (const row of (committedData ?? []) as PersistedRecommendationRow[]) {
        const signalId = String(row.signal_id ?? "") as SignalId;
        const config = recommendationConfigBySignal.get(signalId);
        if (!config || seenIds.has(String(row.id))) continue;

        if (row.state === "accepted" && !row.accepted_at) continue;
        if (row.state === "acted" && !row.acted_at) continue;

        const lifecycle = normalizeRecommendationLifecycle(row);
        if (lifecycle !== "accepted" && lifecycle !== "in_progress") continue;

        const episodeSequence = parseRecommendationEpisodeSequence(
          row.recommendation_key,
        );
        if (!episodeSequence) continue;

        recommendations.push({
          id: String(row.id),
          signalId,
          episodeSequence,
          title: config.title,
          score: clampPriority(safeNumber(row.score)),
          actionText: String(row.action_text ?? ""),
          reasonText: String(row.reason_text ?? ""),
          baselineValue: safeNumber(row.baseline_value),
          targetLeadCount: safeNumber(row.target_lead_count),
          evidenceLabel: config.evidenceLabel,
          href: config.href,
          lifecycleState: lifecycle,
          acceptedAt: row.accepted_at ?? null,
          dismissedAt: row.dismissed_at ?? null,
          actedAt: row.acted_at ?? null,
          completedAt: row.completed_at ?? null,
        });
        seenIds.add(String(row.id));
      }
    }

    recommendations.sort((left, right) => {
      const lifecycleDifference =
        lifecycleSortRank(left.lifecycleState) -
        lifecycleSortRank(right.lifecycleState);
      if (lifecycleDifference !== 0) return lifecycleDifference;
      return right.score - left.score;
    });

    const partial = unavailableSignals.length > 0 || committedUnavailable;

    if (recommendations.length === 0 && partial) {
      return NextResponse.json(
        { ok: false, error: "Recommended actions are temporarily unavailable." },
        { status: 503, headers: privateHeaders },
      );
    }

    return NextResponse.json(
      {
        ok: true,
        evidenceClass: "deterministic_crm",
        partial,
        unavailableSignals,
        committedUnavailable,
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

function clampPriority(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function lifecycleSortRank(lifecycle: RecommendationLifecycle) {
  if (lifecycle === "in_progress") return 0;
  if (lifecycle === "accepted") return 1;
  if (lifecycle === "active") return 2;
  return 3;
}

function hasDatabaseError(error: unknown, needle: string) {
  if (!error || typeof error !== "object") return false;
  const message = "message" in error ? String((error as { message?: unknown }).message ?? "") : "";
  const details = "details" in error ? String((error as { details?: unknown }).details ?? "") : "";
  return message.includes(needle) || details.includes(needle);
}
