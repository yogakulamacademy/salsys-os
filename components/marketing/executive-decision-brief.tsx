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
    <section className="relative overflow-hidden rounded-[18px] border border-line bg-surface shadow-card">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-44 bg-[radial-gradient(circle_at_18%_0%,rgba(109,76,255,.16),transparent_40%),radial-gradient(circle_at_82%_0%,rgba(239,235,255,.92),transparent_36%)] dark:bg-[radial-gradient(circle_at_18%_0%,rgba(124,92,255,.16),transparent_40%),radial-gradient(circle_at_82%_0%,rgba(55,48,86,.35),transparent_36%)]" />

      <div className="relative grid gap-0 xl:grid-cols-[minmax(0,1.15fr)_minmax(350px,.85fr)]">
        <div className="p-5 sm:p-6 xl:p-7">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-100 bg-brand-50 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.13em] text-brand-700">
              <Sparkles size={11} /> {eyebrow}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface/80 px-2.5 py-1 text-[9px] font-semibold text-copy-muted backdrop-blur">
              <Gauge size={11} /> {confidenceLabel}
            </span>
          </div>

          <h2 className="mt-4 max-w-3xl text-[22px] font-semibold leading-[1.18] tracking-[-0.035em] text-copy-strong sm:text-[26px]">
            {title}
          </h2>
          <p className="mt-3 max-w-3xl text-[12px] leading-6 text-copy-muted sm:text-[13px]">
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

          <div className="mt-5 flex items-start gap-2 border-t border-line pt-4 text-[10px] leading-5 text-copy-subtle">
            <CircleCheck size={13} className="mt-0.5 shrink-0 text-brand-600" />
            <span>{confidenceDetail}</span>
          </div>
        </div>

        <div className="relative border-t border-line bg-surface-soft/80 p-3 sm:p-4 xl:border-l xl:border-t-0">
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
      ? "border-emerald-100 bg-emerald-50/55 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/15 dark:text-emerald-300"
      : tone === "risk"
        ? "border-rose-100 bg-rose-50/55 text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/15 dark:text-rose-300"
        : tone === "watch"
          ? "border-amber-100 bg-amber-50/60 text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/15 dark:text-amber-300"
          : "border-line bg-surface text-copy-muted";

  return (
    <article className={`group rounded-xl border p-3.5 transition duration-200 hover:-translate-y-[1px] hover:shadow-card ${toneClass}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[9px] font-bold uppercase tracking-[0.1em] opacity-70">{signal.label}</div>
          <div className="mt-1.5 truncate text-lg font-semibold tracking-[-0.025em] text-copy-strong">{signal.value}</div>
        </div>
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-line bg-surface/90 shadow-card">
          <Icon size={13} />
        </span>
      </div>
      <p className="mt-1.5 text-[10px] leading-4 text-copy-muted">{signal.detail}</p>
    </article>
  );
}
