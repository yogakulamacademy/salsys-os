import type { ReactNode } from "react";

import { MetricInvestigatorCard } from "@/components/intelligence/metric-investigator-card";
import { ToneChip } from "@/components/home/command-center/panel";
import { sparklinePoints, type Chip } from "@/lib/home-command-center";
import type { MetricEvidenceState } from "@/lib/metric-definitions";

const CHIP_TO_TONE = { up: "positive", down: "critical", warn: "warning", flat: "neutral" } as const;

/**
 * A compact headline metric. Clicking it opens the shared metric investigator
 * (definition, evidence state and next checks), so definitions stay reachable
 * on touch screens and by keyboard without crowding the card with text.
 */
export function KpiCard({
  icon,
  label,
  value,
  chip,
  trend,
  href,
  definition,
  evidenceLabel,
  evidenceState,
  muted = false,
  emptyText,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  chip: Chip;
  trend: number[] | null;
  href: string;
  definition: string;
  evidenceLabel: string;
  evidenceState: MetricEvidenceState;
  muted?: boolean;
  /** Shown instead of a bare "—" when the value is unknown or zero-evidence. */
  emptyText?: string;
}) {
  const spark = trend && trend.length ? sparklinePoints(trend, 110, 44) : null;
  return (
    <MetricInvestigatorCard
      className="flex min-w-0 flex-col gap-2.5 rounded-[18px] border border-line bg-surface p-4 shadow-card transition hover:border-brand-100 hover:shadow-panel sm:p-[18px]"
      label={label}
      value={value}
      detail={chip.text}
      href={href}
      definition={definition}
      evidenceLabel={evidenceLabel}
      evidenceState={evidenceState}
      deltaDirection="neutral"
      tone={CHIP_TO_TONE[chip.tone]}
    >
      <span className="flex items-center gap-2.5">
        <span className="grid h-[34px] w-[34px] place-items-center rounded-[10px] bg-brand-50 text-brand-700" aria-hidden="true">
          {icon}
        </span>
        <span className="text-sm font-bold text-copy-strong">{label}</span>
      </span>
      <span className="flex items-end justify-between gap-2">
        <span className="flex min-w-0 flex-col gap-2">
          {value === "—" && emptyText ? (
            <span className="flex h-[30px] items-end text-lg font-bold leading-none text-copy-subtle">{emptyText}</span>
          ) : (
            <span className={`text-[30px] font-extrabold leading-none tracking-[-0.02em] tabular-nums ${muted ? "text-copy-subtle" : "text-copy-strong"}`}>
              {value}
            </span>
          )}
          <ToneChip chip={chip} />
        </span>
        {spark ? (
          <svg width="110" height="44" viewBox="0 0 110 44" aria-hidden="true" className="shrink-0">
            <polygon points={spark.area} className="fill-brand-50" />
            <polyline points={spark.line} fill="none" className="stroke-brand-600" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          </svg>
        ) : null}
      </span>
    </MetricInvestigatorCard>
  );
}
