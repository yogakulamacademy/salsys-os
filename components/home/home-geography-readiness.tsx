import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Globe2, LockKeyhole } from "lucide-react";

import type { HomeGeographyCoverage } from "@/lib/home-geography-coverage";

/**
 * Geographically accurate shoreline backdrop derived from GSHHG coastlines,
 * locally stored at /world-coastlines.svg. This is NOT a lead distribution:
 * free-text country-field coverage is not verified geographic evidence.
 * Projection is equirectangular, with original aspect ratio preserved.
 */
function LockedWorldMap() {
  return (
    <div data-testid="home-world-map-disabled" data-map-state="locked" className="home-geography-map relative flex w-full min-w-0 flex-col justify-center overflow-hidden rounded-xl border border-violet-100 bg-violet-50/30 p-2 dark:border-violet-900/40 dark:bg-violet-950/20">
      <div className="relative h-[150px] w-full min-w-0 sm:h-[174px] lg:h-[188px]">
        <Image
          src="/world-coastlines.svg"
          alt=""
          fill
          unoptimized
          sizes="(max-width: 900px) 90vw, 50vw"
          className="object-contain"
          aria-hidden="true"
        />
      </div>
      <div className="relative z-10 mt-1 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center">
        <LockKeyhole size={13} aria-hidden="true" className="shrink-0 text-brand-700" />
        <p className="text-[11px] font-semibold text-copy-strong">Map unavailable</p>
        <span className="text-[10px] text-copy-muted">Country-level plotting awaits validated location data</span>
      </div>
    </div>
  );
}

/** Field completeness is not a valid-country count or a map-unlock threshold. */
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
    coverage.countryFieldMissing === coverage.cohortLeads - coverage.countryFieldPopulated &&
    (coverage.cohortLeads === 0
      ? coverage.populatedPercent === null
      : coverage.populatedPercent !== null &&
        Number.isFinite(coverage.populatedPercent) &&
        coverage.populatedPercent >= 0 && coverage.populatedPercent <= 100);
  const cohort = valid ? coverage.cohortLeads : null;
  const populated = valid ? coverage.countryFieldPopulated : null;
  const missing = valid ? coverage.countryFieldMissing : null;
  const completion = valid ? coverage.populatedPercent : null;

  return (
    <section aria-label="Geographic data readiness" className="min-w-0 overflow-hidden rounded-2xl border border-line bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-copy-strong">
            <Globe2 size={16} aria-hidden="true" className="text-brand-700" /> Geographic data readiness
          </h2>
          <p className="mt-1 text-[11px] text-copy-muted">Selected acquisition cohort · {periodLabel}</p>
        </div>
        <Link href="/leads" className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-700 hover:text-brand-800">
          Review leads <ArrowRight size={12} />
        </Link>
      </div>

      <div className="mt-3 grid min-w-0 gap-3 min-[900px]:grid-cols-[minmax(205px,0.72fr)_minmax(0,1.28fr)] min-[900px]:items-center">
        <div className="min-w-0">
          {cohort === null ? (
            <div data-evidence-state="unavailable">
              <p className="text-[26px] font-semibold tabular-nums text-copy-strong">—</p>
              <p className="text-[11px] text-copy-muted">Geographic coverage unavailable</p>
            </div>
          ) : cohort === 0 ? (
            <div data-evidence-state="empty">
              <p className="text-[26px] font-semibold tabular-nums text-copy-strong">—</p>
              <p className="text-[11px] text-copy-muted">No leads in the selected cohort</p>
            </div>
          ) : (
            <div data-evidence-state="available">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <p className="text-[26px] font-semibold tabular-nums tracking-tight text-brand-700">{completion!.toFixed(1)}% <span className="text-base">coverage</span></p>
                  <p className="text-[11px] text-copy-muted">Country field populated (not validated)</p>
                </div>
                <span className="text-xs font-semibold tabular-nums text-copy-strong">{populated!.toLocaleString("en-IN")} / {cohort.toLocaleString("en-IN")}</span>
              </div>
              <div role="img" aria-label={populated + " of " + cohort + " acquired leads have a nonblank country field"} className="mt-2 h-2 overflow-hidden rounded-full bg-surface-muted">
                <div className="h-full rounded-full bg-brand-700" style={{ width: completion + "%" }} />
              </div>
              <p className="mt-2 text-[11px] text-copy-subtle">{missing!.toLocaleString("en-IN")} leads missing country</p>
            </div>
          )}
          <details className="group mt-4 border-t border-line pt-3">
            <summary className="cursor-pointer text-[11px] font-medium text-brand-700 focus-visible:outline-2 focus-visible:outline-brand-700">Why is the map locked?</summary>
            <p className="mt-2 text-[11px] leading-5 text-copy-muted">
              A filled field is not a verified country. Free-text entries may contain cities or regions.
              No world-map distribution or location-based demand claims are shown without validated country data.
            </p>
          </details>
        </div>
        <LockedWorldMap />
      </div>
    </section>
  );
}
