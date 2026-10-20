import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CircleGauge,
  Lightbulb,
  Sparkles,
} from "lucide-react";

import type {
  CommercialIntelligenceBrief,
  IntelligenceTone,
  RevenueAttributionReconciliation,
} from "@/lib/commercial-intelligence";

export function CommercialIntelligencePanel({
  brief,
}: {
  brief: CommercialIntelligenceBrief;
}) {
  return (
    <section className="card-pad mt-4 overflow-hidden border border-violet-100 bg-white shadow-sm">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.12em] text-violet-600">
            <Sparkles size={14} />
            SalsysOS decision intelligence
          </div>

          <h2 className="mt-2 text-lg font-semibold text-slate-900">
            {brief.title}
          </h2>

          <p className="mt-1 text-sm leading-6 text-slate-500">
            {brief.summary}
          </p>
        </div>

        <div className="min-w-[220px] rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[.08em] text-slate-400">
                {brief.readinessLabel}
              </div>
              <div className="mt-1 text-2xl font-semibold text-slate-900">
                {Math.round(brief.readinessScore)}/100
              </div>
            </div>
            <CircleGauge size={22} className="text-violet-600" />
          </div>
          <p className="mt-2 text-[11px] leading-5 text-slate-500">
            {brief.readinessDetail}
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {brief.signals.map((signal) => (
          <div
            key={`${signal.label}-${signal.value}`}
            className={`rounded-2xl border p-4 ${toneClasses(signal.tone)}`}
          >
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.08em]">
              {toneIcon(signal.tone)}
              {signal.label}
            </div>
            <div className="mt-2 text-lg font-semibold text-slate-900">
              {signal.value}
            </div>
            <p className="mt-1 text-xs leading-5 text-slate-600">
              {signal.detail}
            </p>
          </div>
        ))}
      </div>

      {brief.actions.length > 0 && (
        <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <Lightbulb size={16} className="text-violet-600" />
            Recommended next actions
          </div>

          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            {brief.actions.map((action) => {
              const body = (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-800">
                        {action.title}
                      </div>
                      <p className="mt-1 text-xs leading-5 text-slate-500">
                        {action.detail}
                      </p>
                    </div>
                    {action.href && (
                      <ArrowRight size={15} className="mt-0.5 shrink-0 text-slate-400" />
                    )}
                  </div>
                </>
              );

              const classes = `rounded-xl border p-3 transition ${actionToneClasses(
                action.tone,
              )}`;

              return action.href ? (
                <Link key={action.title} href={action.href} className={classes}>
                  {body}
                </Link>
              ) : (
                <div key={action.title} className={classes}>
                  {body}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-4 border-t border-slate-100 pt-3 text-[11px] leading-5 text-slate-400">
        <span className="font-semibold text-slate-500">Method:</span>{" "}
        {brief.methodology}
      </div>
    </section>
  );
}

export function RevenueAttributionReconciliationCard({
  reconciliation,
}: {
  reconciliation: RevenueAttributionReconciliation;
}) {
  const aligned = reconciliation.status === "aligned";
  const review = reconciliation.status === "review";

  return (
    <section className="card-pad mt-4 border border-slate-200 bg-white">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <div className="eyebrow">Commercial reconciliation</div>
          <div className="mt-1 flex items-center gap-2 text-base font-semibold text-slate-900">
            {aligned ? (
              <CheckCircle2 size={18} className="text-emerald-600" />
            ) : review ? (
              <AlertTriangle size={18} className="text-amber-600" />
            ) : (
              <CircleGauge size={18} className="text-slate-400" />
            )}
            {reconciliation.headline}
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            {reconciliation.detail}
          </p>
        </div>

        <div
          className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
            aligned
              ? "bg-emerald-50 text-emerald-700"
              : review
                ? "bg-amber-50 text-amber-700"
                : "bg-slate-100 text-slate-600"
          }`}
        >
          {aligned ? "Aligned" : review ? "Review" : "Insufficient evidence"}
        </div>
      </div>

      {reconciliation.currencies.length > 0 && (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {reconciliation.currencies.map((row) => (
            <div
              key={row.currency}
              className="rounded-xl border border-slate-200 bg-slate-50/60 p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-slate-800">
                  {row.currency}
                </div>
                <span
                  className={`text-xs font-semibold ${
                    row.aligned ? "text-emerald-600" : "text-amber-600"
                  }`}
                >
                  {row.aligned ? "reconciled" : "difference detected"}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                <ReconciliationMetric
                  label="Revenue truth"
                  value={formatCurrency(row.revenueActual, row.currency)}
                />
                <ReconciliationMetric
                  label="Attributed"
                  value={formatCurrency(row.attributedRevenue, row.currency)}
                />
                <ReconciliationMetric
                  label="Difference"
                  value={formatCurrency(row.difference, row.currency)}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function ReconciliationMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-[.06em] text-slate-400">
        {label}
      </div>
      <div className="mt-1 font-semibold text-slate-800">{value}</div>
    </div>
  );
}

function toneIcon(tone: IntelligenceTone) {
  if (tone === "positive") {
    return <CheckCircle2 size={14} />;
  }
  if (tone === "risk" || tone === "watch") {
    return <AlertTriangle size={14} />;
  }
  return <CircleGauge size={14} />;
}

function toneClasses(tone: IntelligenceTone) {
  if (tone === "positive") {
    return "border-emerald-100 bg-emerald-50/60 text-emerald-700";
  }
  if (tone === "risk") {
    return "border-rose-100 bg-rose-50/60 text-rose-700";
  }
  if (tone === "watch") {
    return "border-amber-100 bg-amber-50/60 text-amber-700";
  }
  return "border-slate-200 bg-slate-50/60 text-slate-600";
}

function actionToneClasses(tone: IntelligenceTone) {
  if (tone === "risk") {
    return "border-rose-100 bg-white hover:border-rose-200 hover:bg-rose-50/40";
  }
  if (tone === "watch") {
    return "border-amber-100 bg-white hover:border-amber-200 hover:bg-amber-50/40";
  }
  if (tone === "positive") {
    return "border-emerald-100 bg-white hover:border-emerald-200 hover:bg-emerald-50/40";
  }
  return "border-slate-200 bg-white hover:border-violet-200 hover:bg-violet-50/30";
}

function formatCurrency(value: number, currency: string) {
  if (currency === "INR") {
    return `₹${value.toLocaleString("en-IN", {
      maximumFractionDigits: 2,
    })}`;
  }

  if (currency === "USD") {
    return `$${value.toLocaleString("en-US", {
      maximumFractionDigits: 2,
    })}`;
  }

  return `${currency} ${value.toLocaleString("en-US", {
    maximumFractionDigits: 2,
  })}`;
}
