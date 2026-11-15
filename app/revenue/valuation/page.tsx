import Link from "next/link";
import { ArrowLeft, ArrowRight, CircleDollarSign, Info, ListChecks } from "lucide-react";

import { getCourseBatches, getCourses, isMockMode } from "@/lib/data";
import { isEducationCoreEnabledForCurrentSession } from "@/lib/education-access";
import {
  getOpportunityValuationQueue,
  type UnvaluedOpportunity,
} from "@/lib/home-opportunity-valuation";

type PriceReference = {
  id: string;
  batchCode: string;
  expectedValue?: number;
  currency?: string;
  startDate?: string;
};

export default async function ValuationReadinessPage() {
  const mock = isMockMode();
  const [queue, educationEnabled] = await Promise.all([
    getOpportunityValuationQueue(),
    mock ? Promise.resolve(false) : isEducationCoreEnabledForCurrentSession(),
  ]);
  const [courses, batches] = educationEnabled
    ? await Promise.all([getCourses(), getCourseBatches()])
    : [[], []];

  const courseNames = new Map<string, string>(
    courses.map((course): [string, string] => [course.id, course.name]),
  );
  const pricedBatches = new Map<string, PriceReference[]>();
  for (const batch of batches) {
    if (!(batch.expectedValue != null && batch.expectedValue > 0 && batch.currency)) continue;
    const existing = pricedBatches.get(batch.courseId) ?? [];
    existing.push({
      id: batch.id,
      batchCode: batch.batchCode,
      expectedValue: batch.expectedValue,
      currency: batch.currency,
      startDate: batch.startDate,
    });
    pricedBatches.set(batch.courseId, existing);
  }

  const count = queue.needsValuationCount;
  const coverage = queue.eligibleCount != null && count != null && queue.eligibleCount > 0
    ? Math.round(((queue.eligibleCount - count) / queue.eligibleCount) * 1000) / 10
    : null;

  const renderRows = (rows: UnvaluedOpportunity[]) =>
    rows.map((lead) => {
      const options = lead.courseId ? pricedBatches.get(lead.courseId) ?? [] : [];
      const preferred = lead.preferredBatchId
        ? options.find((batch) => batch.id === lead.preferredBatchId)
        : undefined;
      const suggestion = preferred ?? (options.length === 1 ? options[0] : null);
      return (
        <div key={lead.id} className="grid gap-3 border-t border-line py-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-center">
          <div className="min-w-0">
            <Link className="text-sm font-semibold text-copy-strong hover:text-brand-700" href={`/leads/${lead.id}`}>
              {lead.name}
            </Link>
            <p className="mt-1 text-[11px] text-copy-muted">
              {lead.code} · {lead.stage.replaceAll("_", " ")}
            </p>
          </div>
          <div className="min-w-0 text-xs leading-5 text-copy-muted">
            <p>{lead.courseId ? courseNames.get(lead.courseId) ?? "Linked offering" : "No offering linked"}</p>
            {suggestion ? (
              <p>
                Suggested reference: {suggestion.batchCode} · {formatMoney(suggestion.expectedValue!, suggestion.currency!)}
                <span className="block text-[11px]">Confirm the actual batch, package and negotiated amount before saving.</span>
              </p>
            ) : options.length > 1 ? (
              <p>{options.length} priced batches available. Select the correct one in Lead Edit.</p>
            ) : (
              <p>Price needs confirmation; no unambiguous priced batch reference.</p>
            )}
          </div>
          <Link href={`/leads/${lead.id}/edit`} className="inline-flex h-9 items-center gap-1.5 self-start rounded-ui border border-line px-3 text-xs font-semibold text-brand-700 hover:bg-surface-muted">
            Review value <ArrowRight size={13} />
          </Link>
        </div>
      );
    });

  return (
    <div className="space-y-5 pb-8">
      <Link href="/revenue" className="inline-flex items-center gap-2 text-xs font-semibold text-copy-muted hover:text-brand-700">
        <ArrowLeft size={14} /> Back to Revenue
      </Link>
      <header className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-[0.12em] text-brand-700">Revenue · Data quality</div>
        <h1 className="text-[28px] font-semibold tracking-tight text-copy-strong">Opportunity valuation</h1>
        <p className="max-w-3xl text-sm leading-6 text-copy-muted">
          Find open leads without a trustworthy potential value or currency. Choose an offering and batch, or confirm a manual commercial estimate in the existing Lead Edit flow.
        </p>
      </header>
      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label="Eligible open leads" value={queue.eligibleCount?.toLocaleString("en-IN") ?? "—"} />
        <Metric label="Need valuation" value={count?.toLocaleString("en-IN") ?? "—"} />
        <Metric label="Value coverage" value={coverage == null ? "—" : coverage + "%"} />
      </div>
      <div className="rounded-xl border border-line bg-surface-muted p-4 text-xs leading-6 text-copy-muted">
        <div className="flex items-center gap-2 font-semibold text-copy-strong"><Info size={15} /> Pricing is a reference, not a confirmed opportunity</div>
        <p className="mt-1">Course batches can have different prices, currencies, packages or negotiated offers. No amount is assigned automatically here. The authorized editor must review and save each lead. Valuation coverage is not a revenue forecast.</p>
        <p>Queue uses current open stages and excludes closed, lost, duplicate, unqualified and archived records. Items shown are limited to the latest 20 in each group; counts cover all matching records.</p>
      </div>
      {!queue.available ? (
        <div className="rounded-xl border border-line p-6 text-sm text-copy-muted">
          Valuation records are unavailable in the current environment.
        </div>
      ) : (
        <>
          <section className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-copy-strong">
              <ListChecks size={17} /> Prioritize qualified and payment-stage leads
            </h2>
            <p className="mt-1 text-xs text-copy-muted">These leads already show recorded commercial progress and need a confirmed value.</p>
            {queue.priority.length ? renderRows(queue.priority) : <p className="mt-4 text-xs text-copy-muted">No priority leads need valuation.</p>}
          </section>
          <section className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
            <h2 className="text-sm font-semibold text-copy-strong">Other recent leads needing valuation</h2>
            <p className="mt-1 text-xs text-copy-muted">New, contacted and engaged leads, newest first.</p>
            {queue.recent.length ? renderRows(queue.recent) : <p className="mt-4 text-xs text-copy-muted">No recent unvalued leads in this group.</p>}
          </section>
        </>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="flex items-center gap-2 text-xs text-copy-muted"><CircleDollarSign size={14} />{label}</div>
      <div className="mt-3 text-[27px] font-semibold tracking-tight text-copy-strong">{value}</div>
    </div>
  );
}

function formatMoney(value: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${currency} ${value.toLocaleString("en-IN")}`;
  }
}
