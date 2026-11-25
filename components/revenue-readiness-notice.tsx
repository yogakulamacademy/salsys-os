import Link from "next/link";

import { getRevenueReadiness } from "@/lib/revenue-readiness";

// One plain line about how far to trust the open-enquiry numbers (owner-approved
// mockup "Readiness", 25 Nov 2026). It sits inside "Detailed numbers" on Revenue
// and at the top of the Revenue sub-pages, not above the whole page. Website
// checkouts are covered by the Revenue briefing, so they are not repeated here.

const n = (x: number) => x.toLocaleString("en-IN");

export async function RevenueReadinessNotice({ showAction = true }: { showAction?: boolean } = {}) {
  const r = await getRevenueReadiness();

  if (!r.available) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-line bg-surface-muted/50 px-4 py-3 text-[13px] text-copy-muted" aria-label="Open enquiry readiness">
        <span className="size-2 shrink-0 rounded-full bg-slate-400" />
        Couldn’t check how many open enquiries have a course price, so read the totals below as rough.
      </div>
    );
  }

  if (r.unvaluedLeads === 0 && r.undatedLeads === 0) return null;

  const parts: string[] = [];
  if (r.unvaluedLeads > 0) parts.push(`${n(r.unvaluedLeads)} of ${n(r.openLeads)} open enquiries have no course price yet, so the totals leave them out.`);
  if (r.undatedLeads >= r.openLeads && r.openLeads > 0) parts.push("The month-by-month forecast stays empty because no enquiry has an expected joining month.");
  else if (r.undatedLeads > 0) parts.push(`${n(r.undatedLeads)} have no expected joining month, so the month-by-month forecast leaves them out.`);

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 sm:flex-row sm:items-center dark:border-amber-900/50 dark:bg-amber-950/20" aria-label="Open enquiry readiness">
      <span className="hidden size-2 shrink-0 rounded-full bg-orange-700 sm:block" />
      <p className="min-w-0 flex-1 text-[13.5px] leading-5 text-amber-950 dark:text-amber-100">
        <strong>Read these numbers as rough.</strong> {parts.join(" ")}
      </p>
      {showAction && r.unvaluedLeads > 0 ? (
        <Link href="/revenue/valuation" className="btn-primary shrink-0">Add the {n(r.unvaluedLeads)} prices</Link>
      ) : null}
    </div>
  );
}
