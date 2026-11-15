import Link from "next/link";
import { ArrowRight, Globe2 } from "lucide-react";

import type { HomeGeographyCoverage } from "@/lib/home-geography-coverage";

/**
 * Country-field completeness for the selected lead-acquisition cohort.
 * It is NOT country validation, geolocation, a map, or geographic demand.
 */
export function HomeGeographyReadiness({
  coverage,
  periodLabel,
}: {
  coverage: HomeGeographyCoverage | null;
  periodLabel: string;
}) {
  const valid = coverage !== null &&
    Number.isSafeInteger(coverage.cohortLeads) &&
    Number.isSafeInteger(coverage.countryFieldPopulated) &&
    Number.isSafeInteger(coverage.countryFieldMissing) &&
    coverage.cohortLeads >= 0 &&
    coverage.countryFieldPopulated >= 0 &&
    coverage.countryFieldMissing === coverage.cohortLeads - coverage.countryFieldPopulated;

  return (
    <section aria-label="Geographic data readiness" className="min-w-0 rounded-2xl border border-line bg-surface p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-copy-strong">
            <Globe2 size={16} aria-hidden="true" /> Geographic data readiness
          </h2>
          <p className="mt-1 text-xs leading-5 text-copy-muted">
            Country field completeness for leads acquired in {periodLabel}
          </p>
        </div>
        <Link href="/leads" className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold text-brand-700">
          Review leads <ArrowRight size={12} />
        </Link>
      </div>

      {!valid ? (
        <div data-evidence-state="unavailable" className="mt-4 rounded-xl bg-surface-muted p-3">
          <p className="text-xs font-semibold text-copy-strong">Geographic coverage unavailable</p>
          <p className="mt-1 text-[11px] leading-5 text-copy-muted">
            Selected-period lead evidence is unavailable. No geographic distribution has been inferred.
          </p>
        </div>
      ) : coverage.cohortLeads === 0 ? (
        <div data-evidence-state="empty" className="mt-4 rounded-xl bg-surface-muted p-3">
          <p className="text-xs font-semibold text-copy-strong">No leads in the selected cohort</p>
          <p className="mt-1 text-[11px] text-copy-muted">A country-field completion rate cannot be calculated.</p>
        </div>
      ) : (
        <div data-evidence-state="available" className="mt-4 space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <div>
              <p className="text-2xl font-semibold tabular-nums text-copy-strong">
                {coverage.populatedPercent?.toFixed(1) ?? "—"}%
              </p>
              <p className="text-[11px] text-copy-muted">Country field populated</p>
            </div>
            <p className="text-xs tabular-nums text-copy-muted">
              {coverage.countryFieldPopulated.toLocaleString("en-IN")} / {coverage.cohortLeads.toLocaleString("en-IN")} leads
            </p>
          </div>
          <div role="img" aria-label={coverage.countryFieldPopulated + " out of " + coverage.cohortLeads + " acquired leads have a nonblank country field"} className="h-2.5 overflow-hidden rounded-full bg-surface-muted">
            <div className="h-full bg-brand-700" style={{ width: (coverage.populatedPercent ?? 0) + "%" }} />
          </div>
          <p className="text-[11px] leading-5 text-copy-muted">
            {coverage.countryFieldMissing.toLocaleString("en-IN")} leads have no declared country in CRM.
          </p>
        </div>
      )}
      <p className="mt-4 border-t border-line pt-3 text-[10px] leading-4 text-copy-subtle">
        A filled field is not a verified country. Free-text entries may contain cities or regions.
        No world-map distribution or location-based demand claims are shown without validated country data.
      </p>
    </section>
  );
}
