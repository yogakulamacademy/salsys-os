import Link from "next/link";
import {
  ArrowRight,
  CircleAlert,
  CircleCheck,
  Gauge,
  Sparkles,
} from "lucide-react";

export type DecisionBriefSignal = {
  label: string;
  value: string;
  detail: string;
  tone?: "positive" | "watch" | "neutral" | "risk";
};

export type DecisionBriefAction = {
  label: string;
  href: string;
  detail?: string;
};

export function ExecutiveDecisionBrief({
  eyebrow = "Salsys decision brief",
  title,
  summary,
  confidenceLabel,
  confidenceDetail,
  signals,
  actions = [],
}: {
  eyebrow?: string;
  title: string;
  summary: string;
  confidenceLabel: string;
  confidenceDetail: string;
  signals: DecisionBriefSignal[];
  actions?: DecisionBriefAction[];
}) {
  return (
    <section className="relative overflow-hidden rounded-[18px] border border-slate-200 bg-white shadow-[0_16px_45px_rgba(20,43,35,.045)]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-[radial-gradient(circle_at_18%_0%,rgba(33,101,81,.12),transparent_38%),radial-gradient(circle_at_82%_0%,rgba(216,232,220,.55),transparent_34%)]" />

      <div className="relative grid gap-0 xl:grid-cols-[minmax(0,1.15fr)_minmax(350px,.85fr)]">
        <div className="p-5 sm:p-6 xl:p-7">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#cfe0d5] bg-[#f3f8f4] px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.13em] text-[#216551]">
              <Sparkles size={11} /> {eyebrow}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/80 px-2.5 py-1 text-[9px] font-bold text-slate-500 backdrop-blur">
              <Gauge size={11} /> {confidenceLabel}
            </span>
          </div>

          <h2 className="mt-4 max-w-3xl text-[22px] font-semibold leading-[1.18] tracking-[-0.035em] text-slate-950 sm:text-[26px]">
            {title}
          </h2>
          <p className="mt-3 max-w-3xl text-[12px] leading-6 text-slate-500 sm:text-[13px]">
            {summary}
          </p>

          <div className="mt-5 flex flex-wrap gap-2">
            {actions.slice(0, 3).map((action, index) => (
              <Link
                key={`${action.href}-${action.label}`}
                href={action.href}
                title={action.detail}
                className={index === 0 ? "btn-primary" : "btn-secondary"}
              >
                {action.label}
                <ArrowRight size={13} />
              </Link>
            ))}
          </div>

          <div className="mt-5 flex items-start gap-2 border-t border-slate-100 pt-4 text-[10px] leading-5 text-slate-400">
            <CircleCheck size={13} className="mt-0.5 shrink-0 text-[#5f8e74]" />
            <span>{confidenceDetail}</span>
          </div>
        </div>

        <div className="relative border-t border-slate-100 bg-[#f8faf8]/75 p-3 sm:p-4 xl:border-l xl:border-t-0">
          <div className="grid h-full gap-2 sm:grid-cols-2 xl:grid-cols-1">
            {signals.slice(0, 4).map((signal) => (
              <SignalCard key={signal.label} signal={signal} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function SignalCard({ signal }: { signal: DecisionBriefSignal }) {
  const tone = signal.tone ?? "neutral";
  const icon = tone === "risk" || tone === "watch" ? CircleAlert : CircleCheck;
  const Icon = icon;

  const toneClass =
    tone === "positive"
      ? "border-emerald-100 bg-emerald-50/55 text-emerald-700"
      : tone === "risk"
        ? "border-rose-100 bg-rose-50/55 text-rose-700"
        : tone === "watch"
          ? "border-amber-100 bg-amber-50/60 text-amber-700"
          : "border-slate-200 bg-white text-slate-500";

  return (
    <article className={`group rounded-xl border p-3.5 transition duration-200 hover:-translate-y-[1px] hover:shadow-[0_8px_22px_rgba(20,43,35,.05)] ${toneClass}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[9px] font-black uppercase tracking-[0.1em] opacity-70">{signal.label}</div>
          <div className="mt-1.5 truncate text-lg font-semibold tracking-[-0.025em] text-slate-950">{signal.value}</div>
        </div>
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-white/80 shadow-[0_1px_3px_rgba(20,43,35,.05)]">
          <Icon size={13} />
        </span>
      </div>
      <p className="mt-1.5 text-[10px] leading-4 text-slate-500">{signal.detail}</p>
    </article>
  );
}
