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
      <p className="text-[11px] leading-5 text-copy-muted">
        Of leads acquired in {periodLabel}, how many reached a recorded qualifying stage before the period ended?
      </p>

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
          <p className="text-[30px] font-semibold tracking-[-0.04em] text-copy-strong">
            {rate!.toFixed(1)}%
          </p>
          <p className="mt-1 text-[11px] text-copy-subtle">Reached a qualifying milestone by the cutoff</p>
          <div
            role="img"
            aria-label={milestoneCount + " out of " + cohortTotal + " acquired leads reached a qualifying milestone before the period ended"}
            className="mt-4 flex h-3 w-full overflow-hidden rounded-full bg-surface-muted"
          >
            <div className="h-full bg-brand-700" style={{ width: rate + "%" }} />
            <div className="h-full bg-slate-300 dark:bg-slate-700" style={{ width: 100 - rate! + "%" }} />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
            <div>
              <p className="font-semibold tabular-nums text-copy-strong">{milestoneCount.toLocaleString("en-IN")}</p>
              <p className="text-[11px] text-copy-muted">Milestone recorded</p>
            </div>
            <div>
              <p className="font-semibold tabular-nums text-copy-strong">{withoutMilestone.toLocaleString("en-IN")}</p>
              <p className="text-[11px] text-copy-muted">No milestone by cutoff</p>
            </div>
          </div>
        </div>
      )}

      <p className="mt-4 border-t border-line pt-3 text-[10px] leading-4 text-copy-subtle">
        Historical milestone rate, not an end-to-end conversion funnel or evidence of lead quality.
        A lead advancing after the cutoff is not counted in this period.
      </p>
      <Link href={href} className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700 hover:text-brand-800">
        Examine sources and cohort <ArrowRight size={13} />
      </Link>
    </div>
  );
}
