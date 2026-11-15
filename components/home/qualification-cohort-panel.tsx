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
    <div className="p-4 sm:p-5" data-testid="home-qualification-cohort">
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
        <div className="mt-4" data-evidence-state="available">
          <div className="grid items-center gap-4 sm:grid-cols-[minmax(0,145px)_minmax(0,1fr)]">
            <div
              role="img"
              aria-label={milestoneCount + " out of " + cohortTotal + " acquired leads reached a qualifying milestone before the period ended"}
              className="relative mx-auto grid aspect-square w-[140px] place-items-center"
            >
              <svg viewBox="0 0 120 120" aria-hidden="true" focusable="false" className="absolute inset-0 h-full w-full">
                <circle cx="60" cy="60" r="46" fill="none" strokeWidth="10" stroke="currentColor" className="text-violet-100 dark:text-violet-900/50" />
                <circle cx="60" cy="60" r="46" fill="none" strokeWidth="10" stroke="currentColor" className="text-brand-700" strokeDasharray={String(2 * Math.PI * 46 * rate! / 100) + " " + String(2 * Math.PI * 46)} transform="rotate(-90 60 60)" />
              </svg>
              <div className="relative z-10 text-center">
                <p className="text-[30px] font-semibold tracking-[-0.04em] text-copy-strong">{rate!.toFixed(1)}%</p>
                <p className="text-[11px] text-copy-muted">Qualified</p>
              </div>
            </div>
            <div className="grid gap-3 text-xs">
              <div>
                <p className="text-[21px] font-semibold tabular-nums text-copy-strong">{milestoneCount.toLocaleString("en-IN")}</p>
                <p className="text-[11px] text-copy-muted">Milestone reached</p>
              </div>
              <div className="border-t border-line pt-3">
                <p className="text-[21px] font-semibold tabular-nums text-copy-strong">{withoutMilestone.toLocaleString("en-IN")}</p>
                <p className="text-[11px] text-copy-muted">No milestone by cutoff</p>
              </div>
            </div>
          </div>
        </div>
      )}

      <details className="mt-4 border-t border-line pt-3 text-[10px] leading-4 text-copy-subtle">
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
