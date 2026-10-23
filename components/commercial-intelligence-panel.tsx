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
    <section className="ui-panel mt-4 overflow-hidden p-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--app-brand-700)]">
            <Sparkles size={14} />
            SalsysOS decision intelligence
          </div>

          <h2 className="mt-2 text-[20px] font-semibold text-[var(--app-text-strong)]">
            {brief.title}
          </h2>

          <p className="mt-1.5 text-[14px] leading-6 text-[var(--app-text-muted)]">
            {brief.summary}
          </p>
        </div>

        <div className="min-w-[230px] rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface-soft)] px-4 py-3.5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--app-text-subtle)]">
                {brief.readinessLabel}
              </div>
              <div className="mt-1 text-[26px] font-semibold tracking-[-0.03em] text-[var(--app-text-strong)]">
                {Math.round(brief.readinessScore)}/100
              </div>
            </div>
            <CircleGauge size={22} className="text-[var(--app-brand-700)]" />
          </div>
          <p className="mt-2 text-[12px] leading-5 text-[var(--app-text-muted)]">
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
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em]">
              {toneIcon(signal.tone)}
              {signal.label}
            </div>
            <div className="mt-2 text-[18px] font-semibold text-[var(--app-text-strong)]">
              {signal.value}
            </div>
            <p className="mt-1 text-[12px] leading-5 text-[var(--app-text-muted)]">
              {signal.detail}
            </p>
          </div>
        ))}
      </div>

      {brief.actions.length > 0 && (
        <div className="mt-5 rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface-soft)] p-4">
          <div className="flex items-center gap-2 text-[14px] font-semibold text-[var(--app-text-strong)]">
            <Lightbulb size={16} className="text-[var(--app-brand-700)]" />
            Recommended next actions
          </div>

          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            {brief.actions.map((action) => {
              const body = (
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[14px] font-semibold text-[var(--app-text-strong)]">
                      {action.title}
                    </div>
                    <p className="mt-1 text-[12px] leading-5 text-[var(--app-text-muted)]">
                      {action.detail}
                    </p>
                  </div>
                  {action.href && (
                    <ArrowRight size={15} className="mt-0.5 shrink-0 text-[var(--app-text-subtle)]" />
                  )}
                </div>
              );

              const classes = `rounded-xl border p-3.5 transition ${actionToneClasses(
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

      <div className="mt-4 border-t border-[var(--app-border)] pt-3 text-[12px] leading-5 text-[var(--app-text-subtle)]">
        <span className="font-semibold text-[var(--app-text-muted)]">Method:</span>{" "}
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
    <section className="ui-panel mt-4 p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <div className="ui-page-kicker">Commercial reconciliation</div>
          <div className="mt-1.5 flex items-center gap-2 text-[16px] font-semibold text-[var(--app-text-strong)]">
            {aligned ? (
              <CheckCircle2 size={18} className="text-emerald-600" />
            ) : review ? (
              <AlertTriangle size={18} className="text-amber-600" />
            ) : (
              <CircleGauge size={18} className="text-[var(--app-text-subtle)]" />
            )}
            {reconciliation.headline}
          </div>
          <p className="mt-2 text-[14px] leading-6 text-[var(--app-text-muted)]">
            {reconciliation.detail}
          </p>
        </div>

        <div
          className={`rounded-full px-3 py-1.5 text-[12px] font-semibold ${
            aligned
              ? "bg-emerald-50 text-emerald-700"
              : review
                ? "bg-amber-50 text-amber-700"
                : "bg-[var(--app-surface-muted)] text-[var(--app-text-muted)]"
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
              className="rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-soft)] p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="text-[14px] font-semibold text-[var(--app-text-strong)]">
                  {row.currency}
                </div>
                <span
                  className={`text-[12px] font-semibold ${
                    row.aligned ? "text-emerald-600" : "text-amber-600"
                  }`}
                >
                  {row.aligned ? "reconciled" : "difference detected"}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
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
      <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--app-text-subtle)]">
        {label}
      </div>
      <div className="mt-1 text-[13px] font-semibold text-[var(--app-text-strong)]">{value}</div>
    </div>
  );
}

function toneIcon(tone: IntelligenceTone) {
  if (tone === "positive") return <CheckCircle2 size={14} />;
  if (tone === "risk" || tone === "watch") return <AlertTriangle size={14} />;
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
  return "border-[var(--app-border)] bg-[var(--app-surface-soft)] text-[var(--app-text-muted)]";
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
  return "border-[var(--app-border)] bg-white hover:border-[var(--app-border-strong)] hover:bg-[var(--app-brand-50)]";
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
