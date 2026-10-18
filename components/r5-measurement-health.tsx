import { CheckCircle2, CircleAlert, Gauge, Link2, WalletCards } from "lucide-react";

import type { R5MeasurementHealth } from "@/lib/r5-measurement-health";

export function R5MeasurementHealthPanel({
  health,
}: {
  health: R5MeasurementHealth | null;
}) {
  if (!health) return null;

  return (
    <section className="card-pad mt-4 rounded-2xl border border-slate-100 bg-white">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="eyebrow">Measurement health</div>
          <div className="section-title mt-1">R5 integrity & coverage</div>
          <p className="mt-2 max-w-3xl text-xs leading-5 text-slate-400">
            Internal consistency is checked separately from attribution coverage. Coverage tells us how much evidence is known; it does not prove causal impact.
          </p>
        </div>

        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${
            health.integrityOk
              ? "bg-emerald-50 text-emerald-700"
              : "bg-amber-50 text-amber-700"
          }`}
        >
          {health.integrityOk ? <CheckCircle2 size={14} /> : <CircleAlert size={14} />}
          {health.integrityOk
            ? "Integrity checks healthy"
            : `${health.hardIssueCount} integrity issue${health.hardIssueCount === 1 ? "" : "s"}`}
        </span>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <HealthMetric
          icon={<Link2 size={16} />}
          label="Lead facts"
          value={`${health.attributionFactCount}/${health.leadCount}`}
          note="canonical attribution facts"
        />
        <HealthMetric
          icon={<Gauge size={16} />}
          label="Attribution model rows"
          value={`${health.attributionModelRowCount}/${health.expectedAttributionModelRowCount}`}
          note="4 observed model views per Lead"
        />
        <HealthMetric
          icon={<WalletCards size={16} />}
          label="Revenue status rows"
          value={`${health.revenueStatusRowCount}/${health.leadCount}`}
          note="Lead-level payment state coverage"
        />
        <HealthMetric
          icon={<CheckCircle2 size={16} />}
          label="Revenue reconciliation"
          value={
            health.revenueReconciliationIssueCount === 0
              ? "Matched"
              : `${health.revenueReconciliationIssueCount} mismatch${health.revenueReconciliationIssueCount === 1 ? "" : "es"}`
          }
          note="payment ledger vs canonical revenue"
        />
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <CoverageBar label="First-touch evidence" value={health.firstTouchCoveragePct} />
        <CoverageBar label="Last-touch evidence" value={health.lastTouchCoveragePct} />
      </div>

      {health.revenueReconciliation.length > 0 && (
        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-100">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-400">
              <tr>
                <th className="px-3 py-2.5 font-semibold">Currency</th>
                <th className="px-3 py-2.5 text-right font-semibold">Ledger</th>
                <th className="px-3 py-2.5 text-right font-semibold">Reported</th>
                <th className="px-3 py-2.5 text-right font-semibold">Difference</th>
              </tr>
            </thead>
            <tbody>
              {health.revenueReconciliation.map((row) => (
                <tr key={row.currency} className="border-t border-slate-100 text-slate-600">
                  <td className="px-3 py-2.5 font-semibold text-slate-700">{row.currency}</td>
                  <td className="px-3 py-2.5 text-right">{formatNumber(row.ledger_actual)}</td>
                  <td className="px-3 py-2.5 text-right">{formatNumber(row.reported_actual)}</td>
                  <td className={`px-3 py-2.5 text-right font-semibold ${row.difference === 0 ? "text-emerald-700" : "text-amber-700"}`}>
                    {formatNumber(row.difference)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function HealthMetric({
  icon,
  label,
  value,
  note,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
      <div className="flex items-center gap-2 text-slate-400">
        {icon}
        <span className="text-[11px] font-semibold uppercase tracking-wide">{label}</span>
      </div>
      <div className="mt-2 text-lg font-semibold text-slate-800">{value}</div>
      <div className="mt-1 text-[11px] leading-4 text-slate-400">{note}</div>
    </div>
  );
}

function CoverageBar({ label, value }: { label: string; value: number }) {
  const bounded = Math.max(0, Math.min(100, value));

  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="font-semibold text-slate-600">{label}</span>
        <span className="font-semibold text-slate-800">{bounded.toFixed(2)}%</span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
        <div
          className="h-full rounded-full bg-slate-500"
          style={{ width: `${bounded}%` }}
        />
      </div>
    </div>
  );
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}
