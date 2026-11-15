import { ChevronDown, Database } from "lucide-react";

export type HomeReportingEvidence = {
  id: string;
  label: string;
  available: boolean;
  basis: "Period event" | "Period cohort" | "Current snapshot";
};

/**
 * Data availability is not a freshness, settlement, or completeness SLA.
 * This component never infers a source update timestamp from render time.
 */
export function HomeReportingCoverage({ items }: { items: HomeReportingEvidence[] }) {
  const returned = items.filter((item) => item.available).length;
  const incomplete = returned !== items.length;
  return (
    <section
      aria-label="Reporting coverage"
      data-testid="home-reporting-coverage"
      className="rounded-xl border border-line bg-surface px-3 py-2.5 sm:px-4"
    >
      <details className="group">
        <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-copy-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700">
          <Database size={15} aria-hidden="true" className="shrink-0 text-copy-subtle" />
          <span className="font-semibold text-copy-strong">
            {returned} of {items.length} reporting sources available
          </span>
          <span className="min-w-0 flex-1 text-[11px] text-copy-subtle">
            {incomplete ? "Selected-period evidence is incomplete." : "All reporting queries returned evidence."}
          </span>
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-brand-700">
            Inspect evidence <ChevronDown size={13} aria-hidden="true" className="transition-transform group-open:rotate-180" />
          </span>
        </summary>
        <div className="mt-3 border-t border-line pt-3">
          <ul className="grid gap-x-5 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => (
              <li key={item.id} className="flex min-w-0 items-start gap-2 text-[11px] leading-5">
                <span
                  aria-hidden="true"
                  className={"mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full " +
                    (item.available ? "bg-copy-muted" : "bg-amber-500")}
                />
                <span className="min-w-0">
                  <span className="font-medium text-copy-strong">{item.label}</span>
                  <span className="block text-copy-subtle">
                    {item.basis} · {item.available ? "Returned" : "Unavailable"}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] leading-5 text-copy-subtle">
            Availability means the scoped data query returned usable evidence, not that source systems are synchronized
            or transactions are externally reconciled. Source-update timestamps are not currently tracked here;
            data freshness and live synchronization are unverified. Period event metrics and current snapshots
            are not directly comparable.
          </p>
        </div>
      </details>
    </section>
  );
}
