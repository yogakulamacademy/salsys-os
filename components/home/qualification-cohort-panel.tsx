import Link from "next/link";
import { ArrowRight } from "lucide-react";

type QualificationCohortPanelProps = {
  total: number | null;
  qualified: number | null;
  periodLabel: string;
  href: string;
};

/**
 * A single acquisition cohort's recorded qualification milestone share,
 * NOT a sequential sales funnel or point-in-time CRM stage distribution.
 */
export function QualificationCohortPanel({
  total, qualified, periodLabel, href,
}: QualificationCohortPanelProps) {
  const available =
    total != null && qualified != null &&
    Number.isSafeInteger(total) && Number.isSafeInteger(qualified) &&
    total >= 0 && qualified >= 0 && qualified <= total;

  const cohortTotal = available ? Number(total) : 0;
  const milestoneCount = available ? Number(qualified) : 0;
  const rate = available && cohortTotal > 0 ? (milestoneCount / cohortTotal) * 100 : null;
  const withoutMilestone = cohortTotal - milestoneCount;

  return (
    <div className="px-4 pb-3 pt-1 sm:px-5" data-testid="home-qualification-cohort">
      <p className="text-[11px] leading-5 text-copy-muted">Acquired leads · {periodLabel}</p>

      {!available ? (
        <div className="mt-4 rounded-xl border border-line bg-surface-muted p-4" data-evidence-state="unavailable">
          <p className="text-sm font-semibold text-copy-strong">Qualification history unavailable</p>
          <p className="mt-1 text-xs leading-5 text-copy-muted">
            Acquisition and stage-history records must reconcile before a milestone rate can be shown.
          </p>
        </div>
      ) : cohortTotal === 0 ? (
        <div className="mt-4 rounded-xl border border-line bg-surface-muted p-4" data-evidence-state="empty">
          <p className="text-sm font-semibold text-copy-strong">No acquired leads in this period</p>
          <p className="mt-1 text-xs leading-5 text-copy-muted">
            There is no cohort from which to calculate a qualification rate.
          </p>
        </div>
      ) : (
        <div className="mt-3 space-y-3" data-evidence-state="available">
          <div role="img" aria-label={milestoneCount + " of " + cohortTotal + " leads reached a qualifying milestone by the period cutoff"} className="relative h-2.5 overflow-hidden rounded-full bg-violet-100">
            <div className="h-full rounded-full bg-brand-700" style={{width: rate + "%"}} />
          </div>
          <div className="grid grid-cols-[1fr_1fr_auto] items-center gap-3 text-[11px]">
            <div><p className="text-lg font-bold tabular-nums text-copy-strong">{milestoneCount.toLocaleString("en-IN")}</p><p className="text-copy-muted">Recorded</p></div>
            <div className="text-right"><p className="text-lg font-bold tabular-nums text-copy-strong">{withoutMilestone.toLocaleString("en-IN")}</p><p className="text-copy-muted">Remaining</p></div>
            <div className="rounded-xl bg-brand-50 px-3 py-2 text-center"><p className="text-xl font-bold text-brand-700">{rate!.toFixed(1)}%</p><p className="text-copy-muted">Qualified</p></div>
          </div>
        </div>
      )}

      <details className="mt-2 border-t border-line pt-2 text-[10px] leading-4 text-copy-subtle">
        <summary className="cursor-pointer font-medium text-brand-700">How qualification is measured</summary>
        <p className="mt-2">
          Historical milestone rate, not an end-to-end conversion funnel or evidence of lead quality.
          A lead advancing after the cutoff is not counted in this period.
        </p>
      </details>
      <Link href={href} className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700 hover:text-brand-800">
        Examine sources and cohort <ArrowRight size={13} />
      </Link>
    </div>
  );
}
