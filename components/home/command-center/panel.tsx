import Link from "next/link";
import type { ReactNode } from "react";

import type { Chip, ChipTone } from "@/lib/home-command-center";

const CHIP_TONES: Record<ChipTone, string> = {
  up: "bg-emerald-50 text-emerald-800",
  down: "bg-rose-50 text-rose-700",
  warn: "bg-amber-50 text-amber-800",
  flat: "bg-brand-50 text-copy-muted",
};

export function ToneChip({ chip, className = "" }: { chip: Chip; className?: string }) {
  return (
    <span className={`inline-flex w-fit items-center rounded-full px-2 py-1 text-[11px] font-bold ${CHIP_TONES[chip.tone]} ${className}`}>
      {chip.text}
    </span>
  );
}

export function Panel({
  id,
  icon,
  title,
  badge,
  action,
  controls,
  children,
  className = "",
}: {
  id: string;
  icon: ReactNode;
  title: string;
  badge?: Chip | null;
  action?: { href: string; label: string };
  /** Toggle buttons shown at the right of the header (client panels). */
  controls?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-labelledby={id}
      className={`flex min-w-0 flex-col gap-3 rounded-[18px] border border-line bg-surface p-4 shadow-card sm:p-[18px] ${className}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="text-brand-700" aria-hidden="true">{icon}</span>
          <h2 id={id} className="truncate text-[15px] font-bold text-copy-strong">{title}</h2>
          {badge ? <ToneChip chip={badge} /> : null}
        </div>
        {controls}
        {action ? (
          <Link href={action.href} className="shrink-0 text-[13px] font-semibold text-brand-700 hover:text-brand-800">
            {action.label} →
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex gap-0.5 rounded-[10px] bg-brand-50 p-[3px]">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={`min-h-8 rounded-lg px-3 text-xs font-bold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700 ${active ? "bg-brand-700 text-white" : "text-copy-muted hover:text-copy-strong"}`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function BarRow({
  label,
  value,
  display,
  max,
  muted = false,
}: {
  label: string;
  value: number;
  display?: string;
  max: number;
  muted?: boolean;
}) {
  const width = max > 0 && value > 0 ? Math.max(2, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(60px,96px)_44px] items-center gap-2.5 text-[13px]">
      <span className="truncate text-copy-strong" title={label}>{label}</span>
      <span className="block h-2 overflow-hidden rounded-full bg-brand-50">
        <span
          className={`block h-full rounded-full ${muted ? "bg-brand-100" : "bg-brand-600"}`}
          style={{ width: `${width}%` }}
        />
      </span>
      <span className="text-right font-bold tabular-nums text-copy-strong">{display ?? value.toLocaleString("en-IN")}</span>
    </div>
  );
}
