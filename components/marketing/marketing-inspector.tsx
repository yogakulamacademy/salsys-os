"use client";

import Link from "next/link";
import { ArrowRight, CheckCircle2, CircleAlert, X } from "lucide-react";
import { useEffect } from "react";

export type MarketingInspectorMetric = {
  label: string;
  value: string;
  note?: string;
};

export type MarketingInspectorEvidence = {
  label: string;
  value: string;
  detail?: string;
  tone?: "positive" | "watch" | "risk" | "neutral";
};

export type MarketingInspectorAction = {
  label: string;
  href: string;
  detail?: string;
  primary?: boolean;
};

export function MarketingInspector({
  open,
  onClose,
  eyebrow = "Marketing inspector",
  title,
  subtitle,
  statusLabel,
  statusTone = "neutral",
  whatHappened,
  whyItMatters,
  metrics = [],
  evidence = [],
  recommendedAction,
  actions = [],
  related = [],
}: {
  open: boolean;
  onClose: () => void;
  eyebrow?: string;
  title: string;
  subtitle?: string;
  statusLabel?: string;
  statusTone?: "positive" | "watch" | "risk" | "neutral";
  whatHappened: string;
  whyItMatters: string;
  metrics?: MarketingInspectorMetric[];
  evidence?: MarketingInspectorEvidence[];
  recommendedAction?: string;
  actions?: MarketingInspectorAction[];
  related?: MarketingInspectorAction[];
}) {
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  const resolveHref = (href: string) => {
    if (eyebrow !== "Campaign evidence") return href;
    const campaign = encodeURIComponent(title);
    if (href === "/paid-media-leads") return `/paid-media-leads?campaign=${campaign}`;
    if (href === "/attribution") return `/attribution?q=${campaign}`;
    return href;
  };

  return (
    <div className="fixed inset-0 z-[90]">
      <button
        type="button"
        aria-label="Close inspector"
        className="absolute inset-0 bg-[#102d27]/20 backdrop-blur-[2px]"
        onClick={onClose}
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`${title} inspector`}
        className="absolute inset-y-0 right-0 flex w-full max-w-[560px] flex-col border-l border-[#dce5dd] bg-[#fbfcfa] shadow-[-24px_0_70px_rgba(16,45,39,.13)] sm:w-[92vw]"
      >
        <header className="border-b border-[#e3e9e3] bg-white/95 px-5 py-5 backdrop-blur sm:px-6">
          <div className="flex items-start gap-4">
            <div className="min-w-0 flex-1">
              <div className="text-[9px] font-black uppercase tracking-[.16em] text-[#8a978a]">{eyebrow}</div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <h2 className="min-w-0 text-[21px] font-semibold leading-tight tracking-[-.03em] text-[#102d27]">{title}</h2>
                {statusLabel ? <StatusPill label={statusLabel} tone={statusTone} /> : null}
              </div>
              {subtitle ? <p className="mt-2 text-[11px] leading-5 text-[#758279]">{subtitle}</p> : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-[#e1e6dd] bg-white text-[#758279] transition hover:border-[#cbd8cd] hover:bg-[#f2f6ef] hover:text-[#153d33]"
              aria-label="Close inspector"
            >
              <X size={16} />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          {metrics.length ? (
            <section className="grid gap-2 sm:grid-cols-2">
              {metrics.slice(0, 6).map((metric) => (
                <div key={metric.label} className="rounded-xl border border-[#e2e8e1] bg-white p-3.5">
                  <div className="text-[8px] font-black uppercase tracking-[.11em] text-[#8a978a]">{metric.label}</div>
                  <div className="mt-1.5 text-lg font-semibold tracking-[-.025em] text-[#102d27]">{metric.value}</div>
                  {metric.note ? <div className="mt-1 text-[9px] leading-4 text-[#758279]">{metric.note}</div> : null}
                </div>
              ))}
            </section>
          ) : null}

          <InspectorSection title="What happened">
            <p>{whatHappened}</p>
          </InspectorSection>

          <InspectorSection title="Why it matters">
            <p>{whyItMatters}</p>
          </InspectorSection>

          {evidence.length ? (
            <InspectorSection title="Evidence">
              <div className="space-y-2">
                {evidence.map((item) => (
                  <EvidenceRow key={`${item.label}-${item.value}`} item={item} />
                ))}
              </div>
            </InspectorSection>
          ) : null}

          {recommendedAction ? (
            <InspectorSection title="Recommended action">
              <div className="rounded-xl border border-[#cfe0d5] bg-[#f1f7f2] p-4 text-[11px] leading-5 text-[#355e4f]">
                {recommendedAction}
              </div>
            </InspectorSection>
          ) : null}

          {related.length ? (
            <InspectorSection title="Related records">
              <div className="grid gap-2">
                {related.map((item) => (
                  <Link key={`${item.href}-${item.label}`} href={resolveHref(item.href)} className="group flex items-center justify-between gap-3 rounded-xl border border-[#e2e8e1] bg-white px-3.5 py-3 transition hover:border-[#c9d8cb] hover:bg-[#f8faf7]">
                    <span>
                      <span className="block text-[11px] font-semibold text-[#203b32]">{item.label}</span>
                      {item.detail ? <span className="mt-0.5 block text-[9px] text-[#758279]">{item.detail}</span> : null}
                    </span>
                    <ArrowRight size={13} className="text-[#8a978a] transition group-hover:translate-x-0.5 group-hover:text-[#153d33]" />
                  </Link>
                ))}
              </div>
            </InspectorSection>
          ) : null}
        </div>

        {actions.length ? (
          <footer className="border-t border-[#e3e9e3] bg-white px-5 py-4 sm:px-6">
            <div className="flex flex-wrap gap-2">
              {actions.map((action, index) => (
                <Link
                  key={`${action.href}-${action.label}`}
                  href={resolveHref(action.href)}
                  title={action.detail}
                  className={action.primary || index === 0 ? "btn-primary" : "btn-secondary"}
                >
                  {action.label} <ArrowRight size={13} />
                </Link>
              ))}
            </div>
          </footer>
        ) : null}
      </aside>
    </div>
  );
}

function InspectorSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-5 border-t border-[#e7ece6] pt-5">
      <h3 className="text-[9px] font-black uppercase tracking-[.13em] text-[#8a978a]">{title}</h3>
      <div className="mt-2 text-[11px] leading-5 text-[#56675d]">{children}</div>
    </section>
  );
}

function EvidenceRow({ item }: { item: MarketingInspectorEvidence }) {
  const tone = item.tone ?? "neutral";
  const Icon = tone === "risk" || tone === "watch" ? CircleAlert : CheckCircle2;
  const toneClass = tone === "positive"
    ? "border-emerald-100 bg-emerald-50/55 text-emerald-700"
    : tone === "risk"
      ? "border-rose-100 bg-rose-50/60 text-rose-700"
      : tone === "watch"
        ? "border-amber-100 bg-amber-50/65 text-amber-700"
        : "border-[#e2e8e1] bg-white text-[#66766c]";

  return (
    <div className={`flex items-start gap-3 rounded-xl border p-3 ${toneClass}`}>
      <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md bg-white/80"><Icon size={12} /></span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-[10px] font-semibold text-[#203b32]">{item.label}</span>
          <strong className="text-[10px] text-[#102d27]">{item.value}</strong>
        </div>
        {item.detail ? <p className="mt-1 text-[9px] leading-4 text-[#758279]">{item.detail}</p> : null}
      </div>
    </div>
  );
}

function StatusPill({ label, tone }: { label: string; tone: "positive" | "watch" | "risk" | "neutral" }) {
  const toneClass = tone === "positive"
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : tone === "risk"
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : tone === "watch"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-[#e1e6dd] bg-[#f6f8f4] text-[#66766c]";
  return <span className={`rounded-full border px-2 py-1 text-[8px] font-black uppercase tracking-[.08em] ${toneClass}`}>{label}</span>;
}
