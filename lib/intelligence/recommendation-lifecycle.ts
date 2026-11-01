export const RECOMMENDATION_FEEDBACK_EVENTS = [
  "accepted",
  "dismissed",
  "action_started",
  "action_completed",
] as const;

export type RecommendationFeedbackEvent =
  (typeof RECOMMENDATION_FEEDBACK_EVENTS)[number];

export type RecommendationLifecycle =
  | "active"
  | "accepted"
  | "in_progress"
  | "completed"
  | "dismissed"
  | "expired";

export type RecommendationLifecycleRow = {
  state?: string | null;
  accepted_at?: string | null;
  dismissed_at?: string | null;
  acted_at?: string | null;
  completed_at?: string | null;
};

export function isRecommendationFeedbackEvent(
  value: unknown,
): value is RecommendationFeedbackEvent {
  return (
    typeof value === "string" &&
    RECOMMENDATION_FEEDBACK_EVENTS.includes(
      value as RecommendationFeedbackEvent,
    )
  );
}

export function normalizeRecommendationLifecycle(
  row: RecommendationLifecycleRow,
): RecommendationLifecycle {
  const state = String(row.state ?? "").trim();

  if (row.dismissed_at || state === "dismissed") return "dismissed";
  if (row.completed_at) return "completed";
  if (row.acted_at || state === "acted") return "in_progress";
  if (row.accepted_at || state === "accepted") return "accepted";
  if (state === "expired") return "expired";
  return "active";
}

export function getAvailableRecommendationFeedbackEvents(
  lifecycle: RecommendationLifecycle,
): RecommendationFeedbackEvent[] {
  if (lifecycle === "active") return ["accepted", "dismissed"];
  if (lifecycle === "accepted") return ["action_started", "dismissed"];
  if (lifecycle === "in_progress") return ["action_completed"];
  return [];
}

export function parseRecommendationEpisodeSequence(
  recommendationKey: unknown,
): number | null {
  if (typeof recommendationKey !== "string") return null;
  const match = recommendationKey.match(/^home:[a-z_]+:episode:(\d+)$/);
  if (!match) return null;

  const value = Number(match[1]);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}
