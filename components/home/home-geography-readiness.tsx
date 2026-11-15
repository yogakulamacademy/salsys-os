import Link from "next/link";
import { ArrowRight, Globe2, LockKeyhole } from "lucide-react";

import type { HomeGeographyCoverage } from "@/lib/home-geography-coverage";

/**
 * Decorative, disabled map silhouette. This is deliberately not a geographic
 * plot: a populated free-text country field is not a validated country.
 * A real map requires validation + independently reviewed data coverage.
 */
function LockedWorldMap() {
  return (
    <div data-testid="home-world-map-disabled" data-map-state="locked" className="relative flex min-h-48 items-center justify-center overflow-hidden rounded-xl bg-emerald-50/70 p-3 dark:bg-emerald-950/20">
      <svg aria-hidden="true" focusable="false" viewBox="0 0 800 350" className="absolute inset-0 h-full w-full fill-emerald-200/75 dark:fill-emerald-700/35" preserveAspectRatio="xMidYMid meet">
        <path d="M60 89 95 62 142 54 167 65 200 61 221 76 241 85 228 110 205 117 199 139 178 151 169 174 145 183 133 205 116 203 111 179 91 162 74 155 63 132 41 124 44 103Z" />
        <path d="M133 49 151 27 174 20 206 29 226 44 214 58 178 64Z" />
        <path d="M198 204 220 214 235 244 251 265 245 287 234 317 218 338 208 322 203 297 184 275 172 249 179 225Z" />
        <path d="M347 99 362 84 384 78 396 89 408 83 428 95 427 111 413 122 404 139 388 142 378 128 361 130Z" />
        <path d="M360 147 394 137 418 157 433 190 424 217 407 241 392 277 378 278 369 248 353 225 344 190Z" />
        <path d="M408 80 439 58 474 59 489 39 533 46 557 37 599 49 626 41 665 58 698 79 715 98 692 115 664 119 653 141 631 148 611 134 585 154 556 143 530 164 509 150 496 165 464 153 452 137 425 136 416 115Z" />
        <path d="M527 173 541 179 558 203 550 224 537 207Z M576 181 595 196 607 224 595 236 583 217Z" />
        <path d="M657 231 684 220 708 232 729 250 721 270 697 276 677 270 663 285 648 269Z" />
        <path d="M742 265 755 281 751 306 743 316 735 295Z M278 52 295 44 311 52 307 70 290 78Z" />
      </svg>
      <div className="relative z-10 flex max-w-[260px] flex-col items-center rounded-xl border border-line bg-surface/95 px-4 py-3 text-center shadow-sm">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-emerald-100 text-brand-700 dark:bg-emerald-900/50 dark:text-emerald-200">
          <LockKeyhole size={16} aria-hidden="true" />
        </span>
        <p className="mt-2 text-xs font-semibold text-copy-strong">Map unavailable</p>
        <p className="mt-1 text-[11px] leading-4 text-copy-muted">Disabled until validated country coverage is sufficient</p>
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

      <div className="mt-3 grid min-w-0 gap-4 lg:grid-cols-[minmax(220px,0.85fr)_minmax(0,1.15fr)] lg:items-center">
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
              <div role="img" aria-label={populated + " of " + cohort + " acquired leads have a nonblank country field"} className="mt-3 h-2 overflow-hidden rounded-full bg-surface-muted">
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
