import Link from "next/link";
import { ArrowRight } from "lucide-react";

export type ActionCardItem = {
  count: number;
  title: string;
  detail: string;
  cta: string;
  href: string;
  tone: "money" | "attention" | "danger" | "brand" | "neutral";
};

const TONE: Record<ActionCardItem["tone"], string> = {
  money: "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300",
  attention: "bg-orange-50 text-orange-700 dark:bg-orange-950/30 dark:text-orange-300",
  danger: "bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300",
  brand: "bg-brand-50 text-brand-700 dark:bg-brand-950/30 dark:text-brand-300",
  neutral: "bg-surface-muted text-copy-strong",
};

/** "Do this now" cards used across the CRM pages (owner-approved mockups, 20 Nov 2026). */
export function ActionCards({ items, label = "Do this now" }: { items: ActionCardItem[]; label?: string }) {
  if (!items.length) return null;
  return (
    <section aria-label={label} className={`grid gap-3 sm:grid-cols-2 ${items.length >= 5 ? "lg:grid-cols-3 xl:grid-cols-5" : items.length === 4 ? "xl:grid-cols-4" : "xl:grid-cols-3"}`}>
      {items.map((card) => (
        <Link
          key={card.title}
          href={card.href}
          className="group flex min-w-0 items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3.5 transition hover:border-brand-300 hover:shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
        >
          <span className={`grid h-12 min-w-[56px] shrink-0 place-items-center rounded-xl px-2 text-[22px] font-bold tabular-nums ${TONE[card.tone]}`}>
            {card.count.toLocaleString("en-IN")}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[14px] font-semibold text-copy-strong">{card.title}</span>
            <span className="block truncate text-[12px] text-copy-muted">{card.detail}</span>
          </span>
          <span className="inline-flex shrink-0 items-center gap-1 text-[13px] font-semibold text-brand-700 dark:text-brand-300">
            {card.cta} <ArrowRight size={14} className="transition group-hover:translate-x-0.5" aria-hidden />
          </span>
        </Link>
      ))}
    </section>
  );
}

/** Two-letter initials for an avatar. */
export function initialsOf(name: string | null | undefined) {
  const parts = String(name ?? "").replace(/[^\p{L}\p{N}\s._]/gu, " ").split(/[\s._]+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts.length === 1 ? parts[0].slice(0, 1) : parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
