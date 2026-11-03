import Link from "next/link";
import {
  ArrowRight,
  Clock3,
  CreditCard,
  ListFilter,
  UserRoundX,
  UsersRound,
} from "lucide-react";
import type { LeadsWorkspaceSummary } from "@/lib/leads-data";

type LeadsOverviewProps = {
  summary: LeadsWorkspaceSummary;
};

/**
 * Overview uses only the server's authoritative Leads workspace summary,
 * never client-page counts or invented historical trends.
 */
export function LeadsOverview({ summary }: LeadsOverviewProps) {
  const cards = [
    {
      label: "Total leads",
      value: summary.all,
      detail: "Across this workspace",
      icon: UsersRound,
      href: "/leads",
      tone: "text-brand-700 dark:text-brand-300",
      surface: "bg-brand-50 dark:bg-brand-950/30",
    },
    {
      label: "Unassigned",
      value: summary.unassigned,
      detail: "Need an owner",
      icon: UserRoundX,
      href: "/leads?view=unassigned",
      tone: "text-indigo-700 dark:text-indigo-300",
      surface: "bg-indigo-50 dark:bg-indigo-950/30",
    },
    {
      label: "Stuck leads",
      value: summary.stuck,
      detail: "Beyond stage threshold",
      icon: ListFilter,
      href: "/leads?view=stuck",
      tone: "text-orange-700 dark:text-orange-300",
      surface: "bg-orange-50 dark:bg-orange-950/25",
    },
    {
      label: "Overdue follow-ups",
      value: summary.followupOverdue,
      detail: "Past due",
      icon: Clock3,
      href: "/leads?view=followup_overdue",
      tone: "text-amber-700 dark:text-amber-300",
      surface: "bg-amber-50 dark:bg-amber-950/30",
    },
    {
      label: "Payment pending",
      value: summary.paymentPending,
      detail: "In payment stage",
      icon: CreditCard,
      href: "/leads?view=payment_pending",
      tone: "text-emerald-700 dark:text-emerald-300",
      surface: "bg-emerald-50 dark:bg-emerald-950/25",
    },
  ];

  const urgent = [
    summary.followupOverdue > 0
      ? {
          text: summary.followupOverdue.toLocaleString("en-IN") + " overdue follow-ups",
          detail: "Open the due queue",
          href: "/leads?view=followup_overdue",
        }
      : null,
    summary.unassigned > 0
      ? {
          text: summary.unassigned.toLocaleString("en-IN") + " unassigned leads",
          detail: "Review ownership",
          href: "/leads?view=unassigned",
        }
      : null,
  ].filter((value): value is { text: string; detail: string; href: string } => value != null);

  return (
    <div className="space-y-2.5" data-testid="leads-overview">
      <section aria-label="Leads overview" className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5">
        {cards.map(({ label, value, detail, icon: Icon, href, surface, tone }) => (
          <Link
            key={label}
            href={href}
            className="group flex min-h-[106px] min-w-0 flex-col justify-between rounded-2xl border border-line bg-surface p-3 transition hover:border-brand-300 hover:shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
          >
            <div className="flex items-center gap-2.5">
              <span className={"grid h-8 w-8 shrink-0 place-items-center rounded-lg " + surface + " " + tone}>
                <Icon size={17} aria-hidden />
              </span>
              <span className="min-w-0 text-[11px] font-semibold text-copy-muted">{label}</span>
            </div>
            <div className="mt-2 flex items-end justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[23px] font-semibold leading-none tracking-[-0.035em] tabular-nums text-copy-strong">
                  {value.toLocaleString("en-IN")}
                </div>
                <p className="mt-1 text-[10px] leading-4 text-copy-subtle">{detail}</p>
              </div>
              <ArrowRight size={14} className="mb-1 shrink-0 text-copy-subtle transition group-hover:translate-x-0.5 group-hover:text-brand-700" aria-hidden />
            </div>
          </Link>
        ))}
      </section>

      {urgent.length > 0 ? (
        <section aria-label="Focus now" className="flex flex-col gap-2.5 rounded-xl border border-brand-100 bg-brand-50/45 px-3.5 py-2.5 sm:flex-row sm:items-center dark:border-brand-900/45 dark:bg-brand-950/15">
          <div className="inline-flex shrink-0 items-center gap-2 text-xs font-semibold text-brand-700 dark:text-brand-300 sm:border-r sm:border-line sm:pr-3">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand-100 dark:bg-brand-900/50">
              <ListFilter size={14} aria-hidden />
            </span>
            Focus now
          </div>
          <div className="grid min-w-0 flex-1 gap-2 lg:grid-cols-2">
            {urgent.map((item) => (
              <Link
                href={item.href}
                key={item.href}
                className="flex min-w-0 items-center gap-2.5 rounded-lg bg-surface/85 px-3 py-2.5 text-[11px] transition hover:bg-surface hover:text-brand-700"
              >
                <span className="min-w-0 flex-1 font-semibold text-copy-strong">{item.text}<span className="ml-2 font-normal text-copy-muted">{item.detail}</span></span>
                <ArrowRight size={13} className="shrink-0 text-brand-700" aria-hidden />
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
