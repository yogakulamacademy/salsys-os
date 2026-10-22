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
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-900">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
            Business pulse
          </div>
          <div className="mt-1 text-sm font-black tracking-[-0.02em] text-slate-900 dark:text-white">
            Explore what is moving
          </div>
        </div>

        <div className="flex rounded-xl bg-slate-100 p-1 dark:bg-slate-900">
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
                  className="group grid grid-cols-[92px_1fr_42px] items-center gap-3 rounded-lg px-2 py-1.5 transition hover:bg-slate-50 dark:hover:bg-slate-900/70"
                >
                  <span className="truncate text-[11px] font-bold text-slate-600 dark:text-slate-300">
                    {item.label}
                  </span>
                  <span className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-900">
                    <span
                      className="block h-full rounded-full bg-violet-500 transition-all duration-300 group-hover:bg-violet-600"
                      style={{ width: `${width}%` }}
                    />
                  </span>
                  <span className="text-right text-xs font-black tabular-nums text-slate-800 dark:text-slate-100">
                    {item.value.toLocaleString("en-IN")}
                  </span>
                </Link>
              );
            })}
            <Link
              href="/funnel"
              className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-violet-600 hover:underline dark:text-violet-300"
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
                    className="group grid grid-cols-[110px_1fr_88px] items-center gap-3 rounded-lg px-2 py-1.5 transition hover:bg-slate-50 dark:hover:bg-slate-900/70"
                  >
                    <span className="truncate text-[11px] font-bold text-slate-600 dark:text-slate-300">
                      {item.source || "Unknown"}
                    </span>
                    <span className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-900">
                      <span
                        className="block h-full rounded-full bg-sky-500 transition-all duration-300 group-hover:bg-sky-600"
                        style={{ width: `${width}%` }}
                      />
                    </span>
                    <span className="text-right text-[10px] font-semibold text-slate-400">
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
              className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-violet-600 hover:underline dark:text-violet-300"
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
                    className="rounded-xl border border-slate-200 p-4 transition hover:border-violet-200 hover:bg-violet-50/30 dark:border-slate-800 dark:hover:border-violet-900 dark:hover:bg-violet-950/10"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
                        {item.currency}
                      </span>
                      <ArrowUpRight size={13} className="text-slate-300" />
                    </div>
                    <div className="mt-2 text-2xl font-black tracking-[-0.04em] text-slate-900 dark:text-white">
                      {formatMoney(item.collected, item.currency)}
                    </div>
                    <div className="mt-1 text-[11px] text-slate-500">Collected</div>
                    <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-3 dark:border-slate-900">
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
      className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[10px] font-bold transition ${
        active
          ? "bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white"
          : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
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
      <div className="text-[9px] font-bold uppercase tracking-[0.08em] text-slate-400">{label}</div>
      <div className="mt-1 truncate text-xs font-black text-slate-800 dark:text-slate-100">{value}</div>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-200 px-4 py-10 text-center text-xs font-semibold text-slate-400 dark:border-slate-800">
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
