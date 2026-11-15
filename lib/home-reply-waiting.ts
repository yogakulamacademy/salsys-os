/**
 * Computes an evidence-backed reply-duration breakdown for the executive Home.
 * Counts must be complete, nonnegative safe integers and long waits cannot
 * exceed all conversations awaiting a reply. Invalid evidence stays unknown.
 * This is a time-bucket observation, not an SLA-breach or risk score.
 */
export type HomeReplyWaitingBreakdown = {
  older: number;
  recent: number;
  percentOverHour: number;
};

export function calculateHomeReplyWaitingBreakdown(
  total: number,
  waitingOverHour: number,
): HomeReplyWaitingBreakdown | null {
  if (
    !Number.isSafeInteger(total) ||
    total <= 0 ||
    !Number.isSafeInteger(waitingOverHour) ||
    waitingOverHour < 0 ||
    waitingOverHour > total
  ) {
    return null;
  }

  return {
    older: waitingOverHour,
    recent: total - waitingOverHour,
    percentOverHour: waitingOverHour / total * 100,
  };
}
