import Link from "next/link";
import { ArrowLeft, ArrowRight, BarChart3, ShieldAlert } from "lucide-react";

import { isMockMode } from "@/lib/data";
import { getDashboardPeriodAnalytics, resolveDashboardPeriod } from "@/lib/dashboard-period-data";
import { getHomeV1MetricTruth, type HomeV1MetricTruth } from "@/lib/home-v1-metric-truth";
import {
  buildHomeSourceSignals,
  reconcileHomeSourceQualification,
} from "@/lib/home-source-intelligence";

type SourcePageProps = {
  searchParams: Promise<{
    period?: string | string[];
    from?: string | string[];
    to?: string | string[];
  }>;
};

export default async function SourceIntelligencePage({ searchParams }: SourcePageProps) {
  const query = await searchParams;
  const period = resolveDashboardPeriod(query);
  const mock = isMockMode();

  const [analytics, truth] = await Promise.all([
    mock ? Promise.resolve(null) : getDashboardPeriodAnalytics(query),
    mock
      ? Promise.resolve<HomeV1MetricTruth>({ qualification: null, pipeline: null })
      : getHomeV1MetricTruth(period),
  ]);

  const available = analytics?.available.leads === true;
  const total = available ? analytics!.leads.current : null;
  const qualification = available && truth.qualification &&
    truth.qualification.cohortLeads === total &&
    truth.qualification.historyCovered === truth.qualification.cohortLeads
      ? truth.qualification
      : null;

  const sourceMix = available ? analytics!.sources : [];
  const verified = qualification
    ? reconcileHomeSourceQualification(
        sourceMix, qualification.sources,
        qualification.cohortLeads, qualification.qualifiedLeads,
      )
    : null;

  const displayedSources = verified ?? sourceMix;
  const signals = buildHomeSourceSignals(total, sourceMix, qualification?.qualifiedLeads ?? null);
  const queryParams = new URLSearchParams(
    period.preset === "custom"
      ? { period: "custom", from: period.startDate, to: period.endDate }
      : { period: period.preset },
  );
  const scopedHome = "/home?" + queryParams.toString();

  return (
    <div className="space-y-5 pb-8">
      <Link href={scopedHome} className="inline-flex items-center gap-2 text-xs font-semibold text-copy-muted hover:text-brand-700">
        <ArrowLeft size={14} /> Back to Home
      </Link>
      <header className="space-y-1">
        <div className="text-xs font-semibold uppercase tracking-[0.12em] text-brand-700">Growth intelligence · lead cohort</div>
        <h1 className="text-[28px] font-semibold tracking-tight text-copy-strong">Acquisition sources</h1>
        <p className="text-sm text-copy-muted">Selected period: {period.label} · UTC reporting days</p>
        <p className="max-w-3xl text-xs leading-5 text-copy-muted">
          Sources are grouped from recorded first-touch labels. Lead volume and documented qualification milestones use the same creation-period cohort.
          Source labels do not establish paid versus organic traffic, customer intent, or causal influence.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card title="Leads in cohort" value={total == null ? "—" : total.toLocaleString("en-IN")} />
        <Card title="Qualified by period end" value={qualification ? qualification.qualifiedLeads.toLocaleString("en-IN") : "—"} />
        <Card title="Recorded milestone rate" value={qualification && qualification.cohortLeads > 0
          ? (100 * qualification.qualifiedLeads / qualification.cohortLeads).toFixed(1) + "%"
          : "—"} />
      </div>

      {!available ? (
        <div className="rounded-xl border border-line p-5 text-sm text-copy-muted">
          Acquisition evidence is unavailable. No figures have been substituted from current/all-time records.
        </div>
      ) : (
        <section className="rounded-2xl border border-line bg-surface">
          <div className="border-b border-line p-4 sm:p-5">
            <h2 className="text-sm font-semibold text-copy-strong">Source contribution and recorded qualification</h2>
            <p className="mt-1 text-xs text-copy-muted">
              {verified
                ? "Historical qualification totals reconcile to the acquisition cohort and all normalized source groups."
                : "Source-level qualification is unavailable until history and acquisition totals reconcile. Lead volumes remain observable."}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-left text-sm">
              <thead className="bg-surface-muted text-xs text-copy-muted">
                <tr><th className="px-4 py-3">First-touch channel</th><th className="px-4 py-3 text-right">Leads</th><th className="px-4 py-3 text-right">Lead share</th><th className="px-4 py-3 text-right">Qualified</th><th className="px-4 py-3 text-right">Milestone rate</th></tr>
              </thead>
              <tbody>
                {displayedSources.map((row) => (
                  <tr key={row.source} className="border-t border-line text-copy-strong">
                    <td className="px-4 py-3 font-medium">{row.source}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{row.leads.toLocaleString("en-IN")}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{total && total > 0 ? (100 * row.leads / total).toFixed(1) + "%" : "—"}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{verified ? row.qualified.toLocaleString("en-IN") : "—"}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{verified && row.conversionRate != null ? row.conversionRate.toFixed(1) + "%" : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!displayedSources.length && <p className="p-4 text-sm text-copy-muted">No acquisition records in this period.</p>}
          </div>
        </section>
      )}
      {signals.length > 0 && (
        <section className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-copy-strong"><ShieldAlert size={17} /> Evidence-based observations</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {signals.map((signal) => (
              <div key={signal.title} className="rounded-xl border border-line bg-surface-muted p-4">
                <h3 className="text-xs font-semibold text-copy-strong">{signal.title}</h3>
                <p className="mt-1 text-xs leading-5 text-copy-muted">{signal.detail}</p>
                <Link href={signal.href} className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700">
                  {signal.actionLabel} <ArrowRight size={13} />
                </Link>
              </div>
            ))}
          </div>
        </section>
      )}
      <section className="rounded-xl border border-line bg-surface-muted p-4">
        <div className="flex items-center gap-2 text-xs font-semibold text-copy-strong"><BarChart3 size={15} /> Revenue interpretation</div>
        <p className="mt-1 text-xs leading-6 text-copy-muted">
          This is not a source-to-cash conversion report. Collections are financial events that may come from earlier acquisition cohorts.
          The currently recorded payment ledger also lacks settled payment evidence.
          Source-attributed collections will remain unavailable until verified lead-payment links, attribution definitions, and financial reconciliation exist.
        </p>
        <Link href="/revenue" className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700">Review ledger context <ArrowRight size={13} /></Link>
      </section>
    </div>
  );
}

function Card({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="text-xs text-copy-muted">{title}</div>
      <div className="mt-2 text-[26px] font-semibold tracking-tight text-copy-strong">{value}</div>
    </div>
  );
}
