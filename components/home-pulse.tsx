"use client";

import Link from "next/link";
import { ArrowUpRight, CircleDollarSign, GitBranch, Radio } from "lucide-react";
import { useMemo, useState } from "react";

type PipelinePoint = {
  stage: string;
  label: string;
  value: number;
};

type SourcePoint = {
  source: string;
  leads: number;
  qualified: number;
  share: number;
};

type RevenuePoint = {
  currency: string;
  pipeline: number;
  weighted: number;
  collected: number;
  outstanding: number;
  opportunities: number;
};

type PulseView = "pipeline" | "sources" | "revenue";

export function HomePulse({
  pipeline,
  sources,
  revenue,
}: {
  pipeline: PipelinePoint[];
  sources: SourcePoint[];
  revenue: RevenuePoint[];
}) {
  const [view, setView] = useState<PulseView>("pipeline");

  const maxPipeline = useMemo(
    () => Math.max(1, ...pipeline.map((item) => item.value)),
    [pipeline],
  );
  const maxSource = useMemo(
    () => Math.max(1, ...sources.map((item) => item.leads)),
    [sources],
  );

  return (
    <section className="overflow-hidden rounded-panel border border-line bg-surface shadow-card">
      <div className="flex flex-col gap-3 border-b border-line px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-copy-subtle">
            Business pulse
          </div>
          <div className="mt-1 text-[15px] font-semibold tracking-[-0.02em] text-copy-strong">
            Explore what is moving
          </div>
        </div>

        <div className="flex rounded-ui border border-line bg-surface-soft p-1">
          <PulseTab
            active={view === "pipeline"}
            onClick={() => setView("pipeline")}
            label="Pipeline"
            icon={<GitBranch size={13} />}
          />
          <PulseTab
            active={view === "sources"}
            onClick={() => setView("sources")}
            label="Sources"
            icon={<Radio size={13} />}
          />
          <PulseTab
            active={view === "revenue"}
            onClick={() => setView("revenue")}
            label="Revenue"
            icon={<CircleDollarSign size={13} />}
          />
        </div>
      </div>

      <div className="p-4 sm:p-5">
        {view === "pipeline" ? (
          <div className="space-y-3">
            {pipeline.map((item) => {
              const width = item.value ? Math.max(5, (item.value / maxPipeline) * 100) : 0;
              return (
                <Link
                  key={item.stage}
                  href="/pipeline"
                  className="group grid grid-cols-[92px_1fr_42px] items-center gap-3 rounded-ui px-2 py-1.5 transition hover:bg-surface-soft"
                >
                  <span className="truncate text-[11px] font-semibold text-copy-muted">
                    {item.label}
                  </span>
                  <span className="h-2 overflow-hidden rounded-full bg-surface-muted">
                    <span
                      className="block h-full rounded-full bg-brand-600 transition-all duration-300 group-hover:bg-brand-700"
                      style={{ width: `${width}%` }}
                    />
                  </span>
                  <span className="text-right text-[12px] font-semibold tabular-nums text-copy-strong">
                    {item.value.toLocaleString("en-IN")}
                  </span>
                </Link>
              );
            })}
            <Link
              href="/funnel"
              className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-brand-700 hover:underline"
            >
              Explore conversion funnel <ArrowUpRight size={12} />
            </Link>
          </div>
        ) : null}

        {view === "sources" ? (
          <div className="space-y-3">
            {sources.length ? (
              sources.slice(0, 7).map((item) => {
                const width = item.leads ? Math.max(5, (item.leads / maxSource) * 100) : 0;
                const qualification = item.leads
                  ? Math.round((item.qualified / item.leads) * 100)
                  : 0;
                return (
                  <Link
                    key={item.source}
                    href="/analytics"
                    className="group grid grid-cols-[110px_1fr_88px] items-center gap-3 rounded-ui px-2 py-1.5 transition hover:bg-surface-soft"
                  >
                    <span className="truncate text-[11px] font-semibold text-copy-muted">
                      {item.source || "Unknown"}
                    </span>
                    <span className="h-2 overflow-hidden rounded-full bg-surface-muted">
                      <span
                        className="block h-full rounded-full bg-[#4D8E83] transition-all duration-300 group-hover:bg-brand-700"
                        style={{ width: `${width}%` }}
                      />
                    </span>
                    <span className="text-right text-[10px] font-semibold text-copy-subtle">
                      {item.leads.toLocaleString("en-IN")} · {qualification}% Q+
                    </span>
                  </Link>
                );
              })
            ) : (
              <EmptyState label="No source evidence yet" />
            )}
            <Link
              href="/attribution"
              className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-brand-700 hover:underline"
            >
              Inspect attribution <ArrowUpRight size={12} />
            </Link>
          </div>
        ) : null}

        {view === "revenue" ? (
          <div>
            {revenue.length ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {revenue.map((item) => (
                  <Link
                    key={item.currency}
                    href="/revenue"
                    className="rounded-panel border border-line p-4 transition hover:border-line-strong hover:bg-brand-50"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-copy-subtle">
                        {item.currency}
                      </span>
                      <ArrowUpRight size={13} className="text-copy-subtle" />
                    </div>
                    <div className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-copy-strong">
                      {formatMoney(item.collected, item.currency)}
                    </div>
                    <div className="mt-1 text-[11px] text-copy-muted">Collected</div>
                    <div className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-3">
                      <MiniMetric label="Outstanding" value={formatMoney(item.outstanding, item.currency)} />
                      <MiniMetric label="Open pipeline" value={formatMoney(item.pipeline, item.currency)} />
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState label="No recorded revenue evidence yet" />
            )}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function PulseTab({
  active,
  onClick,
  label,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-[8px] px-2.5 py-1.5 text-[11px] font-semibold transition ${
        active
          ? "bg-surface text-brand-700 shadow-sm"
          : "text-copy-muted hover:text-copy-strong"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-copy-subtle">{label}</div>
      <div className="mt-1 truncate text-[12px] font-semibold text-copy-strong">{value}</div>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="rounded-panel border border-dashed border-line px-4 py-10 text-center text-[12px] font-semibold text-copy-subtle">
      {label}
    </div>
  );
}

function formatMoney(value: number, currency: string) {
  const code = String(currency || "").toUpperCase();
  if (code === "INR") {
    return `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
  }
  if (code === "USD") {
    return `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  }
  return `${code || ""} ${value.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`.trim();
}
