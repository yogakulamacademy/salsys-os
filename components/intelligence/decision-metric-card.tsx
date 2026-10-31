import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  Info,
  Minus,
} from "lucide-react";
import type { ReactNode } from "react";

import { DecisionMetricLink } from "@/components/intelligence/decision-metric-link";
import {
  resolveMetricDefinition,
  type MetricDeltaDirection,
} from "@/lib/metric-definitions";

type MetricTone = "neutral" | "positive" | "warning" | "critical";
export type MetricEvidenceState = "observed" | "derived" | "partial" | "unknown";

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
  evidenceState?: MetricEvidenceState;
  trend?: number[];
};

const toneStyles: Record<
  MetricTone,
  { icon: string; status: string; trend: string; accent: string }
> = {
  neutral: {
    icon: "bg-brand-50 text-brand-700 dark:bg-brand-950/30 dark:text-brand-300",
    status: "bg-surface-muted text-copy-muted",
    trend: "text-brand-600 dark:text-brand-300",
    accent: "bg-brand-500/70",
  },
  positive: {
    icon: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300",
    status: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300",
    trend: "text-emerald-600 dark:text-emerald-300",
    accent: "bg-emerald-500/75",
  },
  warning: {
    icon: "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300",
    status: "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300",
    trend: "text-amber-600 dark:text-amber-300",
    accent: "bg-amber-500/75",
  },
  critical: {
    icon: "bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300",
    status: "bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300",
    trend: "text-rose-600 dark:text-rose-300",
    accent: "bg-rose-500/75",
  },
};

const evidenceStateStyles: Record<MetricEvidenceState, string> = {
  observed: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/25 dark:text-emerald-300",
  derived: "border-brand-200 bg-brand-50 text-brand-700 dark:border-brand-900/60 dark:bg-brand-950/25 dark:text-brand-300",
  partial: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/25 dark:text-amber-300",
  unknown: "border-line bg-surface-muted text-copy-muted",
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
  evidenceState = "observed",
  trend,
}: DecisionMetricCardProps) {
  const canonical = resolveMetricDefinition(label);
  const effectiveDefinition = definition ?? canonical?.definition;
  const effectiveEvidenceLabel = evidenceLabel ?? canonical?.evidenceLabel;
  const effectiveDeltaDirection =
    deltaDirection ?? canonical?.deltaDirection ?? "neutral";
  const effectiveHref = href ?? canonical?.href;
  const styles = toneStyles[tone];
  const deltaState = getDeltaState(delta, effectiveDeltaDirection);

  const content = (
    <>
      <span
        className={`absolute inset-x-0 top-0 h-[2px] ${styles.accent}`}
        aria-hidden="true"
      />

      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          {icon ? (
            <span
              className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${styles.icon}`}
            >
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
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {statusLabel ? (
            <span
              className={`rounded-full px-2 py-1 text-[9px] font-semibold ${styles.status}`}
            >
              {statusLabel}
            </span>
          ) : null}
          {effectiveHref ? (
            <ArrowRight
              size={14}
              className="text-copy-subtle transition group-hover:translate-x-0.5 group-hover:text-brand-700"
            />
          ) : null}
        </div>
      </div>

      <div className="mt-4 flex min-w-0 items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[26px] font-semibold tracking-[-0.045em] text-copy-strong">
            {value}
          </div>
          {detail ? (
            <div className="mt-1 text-xs leading-5 text-copy-muted">{detail}</div>
          ) : null}
        </div>

        {trend && trend.length > 1 ? (
          <MiniTrend points={trend} className={styles.trend} />
        ) : null}
      </div>

      {(delta !== undefined || effectiveEvidenceLabel) ? (
        <div className="mt-3 flex min-h-6 flex-wrap items-center gap-2 border-t border-line pt-3">
          {delta !== undefined ? (
            <span
              className={`inline-flex items-center gap-1 text-[10px] font-semibold ${deltaState.className}`}
              title={comparisonLabel}
            >
              {deltaState.icon}
              {delta == null
                ? "No baseline"
                : `${Math.abs(delta).toFixed(1).replace(/\.0$/, "")}%`}
              <span className="hidden sm:inline">· {deltaState.label}</span>
            </span>
          ) : null}

          {effectiveEvidenceLabel ? (
            <span
              className={`ml-auto inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[9px] font-semibold ${evidenceStateStyles[evidenceState]}`}
              title={effectiveDefinition}
            >
              {evidenceState === "observed" ? <CheckCircle2 size={10} /> : null}
              {effectiveEvidenceLabel}
            </span>
          ) : null}
        </div>
      ) : null}
    </>
  );

  const className =
    "group relative block overflow-hidden rounded-card border border-line bg-surface p-4 shadow-sm transition duration-200 hover:-translate-y-[1px] hover:border-line-strong hover:shadow-panel";

  return effectiveHref ? (
    <DecisionMetricLink
      href={effectiveHref}
      className={className}
      metricLabel={label}
      metricValue={value}
      metricDetail={detail}
      evidenceLabel={effectiveEvidenceLabel}
    >
      {content}
    </DecisionMetricLink>
  ) : (
    <div className={className}>{content}</div>
  );
}

function getDeltaState(
  delta: number | null | undefined,
  direction: MetricDeltaDirection,
) {
  if (delta == null) {
    return {
      className: "text-copy-muted",
      icon: <Minus size={12} />,
      label: "No comparison",
    };
  }

  if (delta === 0) {
    return {
      className: "text-copy-muted",
      icon: <Minus size={12} />,
      label: "Flat",
    };
  }

  if (direction === "neutral") {
    return {
      className: "text-copy-muted",
      icon: delta > 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />,
      label: "Changed",
    };
  }

  const improved = direction === "higher_is_better" ? delta > 0 : delta < 0;
  return {
    className: improved ? "text-emerald-600" : "text-rose-600",
    icon: delta > 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />,
    label: improved ? "Improved" : "Needs review",
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
      <line
        x1="0"
        y1={height - 2}
        x2={width}
        y2={height - 2}
        stroke="currentColor"
        strokeOpacity="0.12"
        strokeWidth="1"
      />
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
