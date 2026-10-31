import Link from "next/link";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Info,
  Minus,
} from "lucide-react";
import type { ReactNode } from "react";

import {
  resolveMetricDefinition,
  type MetricDeltaDirection,
} from "@/lib/metric-definitions";

type MetricTone = "neutral" | "positive" | "warning" | "critical";

export type DecisionMetricCardProps = {
  label: string;
  value: string;
  detail?: string;
  icon?: ReactNode;
  href?: string;
  delta?: number | null;
  comparisonLabel?: string;
  deltaDirection?: MetricDeltaDirection;
  tone?: MetricTone;
  statusLabel?: string;
  definition?: string;
  evidenceLabel?: string;
  trend?: number[];
};

const toneStyles: Record<MetricTone, { icon: string; status: string; trend: string }> = {
  neutral: {
    icon: "bg-brand-50 text-brand-700 dark:bg-brand-950/30 dark:text-brand-300",
    status: "bg-surface-muted text-copy-muted",
    trend: "text-brand-600 dark:text-brand-300",
  },
  positive: {
    icon: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300",
    status: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300",
    trend: "text-emerald-600 dark:text-emerald-300",
  },
  warning: {
    icon: "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300",
    status: "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300",
    trend: "text-amber-600 dark:text-amber-300",
  },
  critical: {
    icon: "bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300",
    status: "bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300",
    trend: "text-rose-600 dark:text-rose-300",
  },
};

export function DecisionMetricCard({
  label,
  value,
  detail,
  icon,
  href,
  delta,
  comparisonLabel = "vs previous period",
  deltaDirection,
  tone = "neutral",
  statusLabel,
  definition,
  evidenceLabel,
  trend,
}: DecisionMetricCardProps) {
  const canonical = resolveMetricDefinition(label);
  const effectiveDefinition = definition ?? canonical?.definition;
  const effectiveEvidenceLabel = evidenceLabel ?? canonical?.evidenceLabel;
  const effectiveDeltaDirection = deltaDirection ?? canonical?.deltaDirection ?? "neutral";
  const effectiveHref = href ?? canonical?.href;
  const styles = toneStyles[tone];
  const deltaState = getDeltaState(delta, effectiveDeltaDirection);
  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          {icon ? (
            <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${styles.icon}`}>
              {icon}
            </span>
          ) : null}
          <span className="min-w-0">
            <span className="flex items-center gap-1.5 text-[11px] font-semibold text-copy-muted">
              <span className="truncate">{label}</span>
              {effectiveDefinition ? (
                <span
                  className="inline-flex shrink-0 text-copy-subtle"
                  title={effectiveDefinition}
                  aria-label={`${label} definition: ${effectiveDefinition}`}
                >
                  <Info size={12} />
                </span>
              ) : null}
            </span>
            {effectiveEvidenceLabel ? (
              <span className="mt-0.5 block text-[9px] font-semibold uppercase tracking-[0.08em] text-copy-subtle">
                {effectiveEvidenceLabel}
              </span>
            ) : null}
          </span>
        </div>
        {effectiveHref ? (
          <ArrowRight
            size={14}
            className="mt-1 shrink-0 text-copy-subtle transition group-hover:translate-x-0.5 group-hover:text-brand-700"
          />
        ) : statusLabel ? (
          <span className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-semibold ${styles.status}`}>
            {statusLabel}
          </span>
        ) : null}
      </div>

      <div className="mt-4 flex min-w-0 items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[25px] font-semibold tracking-[-0.04em] text-copy-strong">
            {value}
          </div>
          {detail ? <div className="mt-1 text-xs leading-5 text-copy-muted">{detail}</div> : null}
        </div>
        {trend && trend.length > 1 ? (
          <MiniTrend points={trend} className={styles.trend} />
        ) : null}
      </div>

      {(delta !== undefined || statusLabel) ? (
        <div className="mt-3 flex min-h-5 flex-wrap items-center gap-2 border-t border-line pt-3">
          {delta !== undefined ? (
            <span className={`inline-flex items-center gap-1 text-[10px] font-semibold ${deltaState.className}`}>
              {deltaState.icon}
              {delta == null ? "No comparison" : `${Math.abs(delta).toFixed(1).replace(/\.0$/, "")}%`}
            </span>
          ) : null}
          {delta !== undefined ? (
            <span className="text-[10px] text-copy-subtle">{comparisonLabel}</span>
          ) : null}
          {statusLabel && effectiveHref ? (
            <span className={`ml-auto rounded-full px-2 py-1 text-[9px] font-semibold ${styles.status}`}>
              {statusLabel}
            </span>
          ) : null}
        </div>
      ) : null}
    </>
  );

  const className =
    "group block rounded-card border border-line bg-surface p-4 shadow-sm transition hover:border-line-strong hover:shadow-panel";

  return effectiveHref ? (
    <Link href={effectiveHref} className={className}>
      {content}
    </Link>
  ) : (
    <div className={className}>{content}</div>
  );
}

function getDeltaState(
  delta: number | null | undefined,
  direction: MetricDeltaDirection,
) {
  if (delta == null || delta === 0 || direction === "neutral") {
    return {
      className: "text-copy-muted",
      icon: <Minus size={12} />,
    };
  }

  const improved = direction === "higher_is_better" ? delta > 0 : delta < 0;
  return {
    className: improved ? "text-emerald-600" : "text-rose-600",
    icon: delta > 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />,
  };
}

function MiniTrend({ points, className }: { points: number[]; className: string }) {
  const clean = points.filter((point) => Number.isFinite(point));
  if (clean.length < 2) return null;

  const min = Math.min(...clean);
  const max = Math.max(...clean);
  const range = Math.max(1, max - min);
  const width = 86;
  const height = 32;
  const coords = clean
    .map((point, index) => {
      const x = (index / Math.max(1, clean.length - 1)) * width;
      const y = height - ((point - min) / range) * (height - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={`h-8 w-[86px] shrink-0 ${className}`}
      role="img"
      aria-label="Metric trend"
    >
      <polyline
        points={coords}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
