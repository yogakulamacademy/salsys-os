import Link from "next/link";
import { ArrowRight, CalendarClock, CircleDollarSign, WalletCards } from "lucide-react";

import { getRevenueReadiness } from "@/lib/revenue-readiness";

export async function RevenueReadinessNotice() {
  const readiness = await getRevenueReadiness();

  if (!readiness.available) {
    return (
      <section className="rounded-panel border border-amber-200 bg-amber-50/70 px-4 py-4 shadow-card dark:border-amber-900/60 dark:bg-amber-950/20 sm:px-5">
        <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-700 dark:text-amber-300">
          Revenue readiness unavailable
        </div>
        <p className="mt-1 text-[12px] leading-5 text-copy-muted">
          {readiness.warning || "Revenue readiness could not be verified."} Forecast evidence should not be treated as complete until this check is available.
        </p>
      </section>
    );
  }

  const valuedLeads = Math.max(readiness.openLeads - readiness.unvaluedLeads, 0);
  const datedLeads = Math.max(readiness.openLeads - readiness.undatedLeads, 0);
  const hasGap = readiness.unvaluedLeads > 0 || readiness.undatedLeads > 0;
  const hasPendingPayments = readiness.pendingPaymentRequests > 0;

  if (!hasGap && !hasPendingPayments) return null;

  return (
    <section className="rounded-panel border border-line bg-surface px-4 py-4 shadow-card sm:px-5">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-brand-700">
            Revenue forecast readiness
          </div>
          <div className="mt-1 text-sm font-semibold text-copy-strong">
            {hasGap
              ? "Commercial forecast coverage is incomplete."
              : "Forecast inputs are complete; payment requests still need action."}
          </div>
          <p className="mt-1 max-w-3xl text-[11px] leading-5 text-copy-muted">
            Missing commercial value and expected close dates are reported as missing evidence, not inferred. Pending payment requests are workflow items only and never count as collected revenue until payment evidence is marked paid.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Link href="/admissions?view=pipeline" className="btn-secondary">
            Complete pipeline <ArrowRight size={13} />
          </Link>
          <Link href="/admissions?view=payments" className="btn-secondary">
            Payment queue <WalletCards size={13} />
          </Link>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <ReadinessMetric
          icon={<CircleDollarSign size={15} />}
          label="Commercial value coverage"
          value={`${valuedLeads.toLocaleString("en-IN")} / ${readiness.openLeads.toLocaleString("en-IN")}`}
          detail={
            readiness.unvaluedLeads > 0
              ? `${readiness.unvaluedLeads.toLocaleString("en-IN")} open leads still need an explicit value.`
              : "All open leads have explicit commercial value."
          }
        />
        <ReadinessMetric
          icon={<CalendarClock size={15} />}
          label="Expected close coverage"
          value={`${datedLeads.toLocaleString("en-IN")} / ${readiness.openLeads.toLocaleString("en-IN")}`}
          detail={
            readiness.undatedLeads > 0
              ? `${readiness.undatedLeads.toLocaleString("en-IN")} open leads still need an expected close date.`
              : "All open leads have an expected close date."
          }
        />
        <ReadinessMetric
          icon={<WalletCards size={15} />}
          label="Pending payment requests"
          value={readiness.pendingPaymentRequests.toLocaleString("en-IN")}
          detail="Pending requests stay outside collected revenue until canonical paid evidence exists."
        />
      </div>

      {readiness.valuedUndatedLeads > 0 ? (
        <div className="mt-3 border-t border-line pt-3 text-[11px] leading-5 text-copy-muted">
          {readiness.valuedUndatedLeads.toLocaleString("en-IN")} valued open {readiness.valuedUndatedLeads === 1 ? "lead is" : "leads are"} missing an expected close date, so monthly forecast timing is incomplete even though commercial value is known.
        </div>
      ) : null}
    </section>
  );
}

function ReadinessMetric({
  icon,
  label,
  value,
  detail,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-ui border border-line bg-surface-soft px-3.5 py-3">
      <div className="flex items-center gap-2 text-[11px] font-semibold text-copy-muted">
        <span className="text-brand-700">{icon}</span>
        {label}
      </div>
      <div className="mt-2 text-xl font-semibold tracking-[-0.03em] text-copy-strong">
        {value}
      </div>
      <p className="mt-1 text-[10px] leading-4 text-copy-muted">{detail}</p>
    </div>
  );
}
