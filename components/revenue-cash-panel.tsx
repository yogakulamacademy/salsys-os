import type { ReactNode } from "react";
import Link from "next/link";
import { AlertTriangle, CalendarClock, CheckCircle2, Hourglass } from "lucide-react";

import type { CashSummary, CurrencyCash, DueItem } from "@/lib/revenue-cash";

function money(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${currency} ${Math.round(amount).toLocaleString("en-IN")}`;
  }
}

function monthLabel(month: string) {
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
}

function dateLabel(iso: string | null) {
  return iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" }) : "No date";
}

function Tile({ label, value, hint, tone, icon }: { label: string; value: string; hint?: string; tone?: "good" | "warn" | "bad"; icon: ReactNode }) {
  const color = tone === "bad" ? "text-rose-700 dark:text-rose-300" : tone === "warn" ? "text-amber-700 dark:text-amber-300" : tone === "good" ? "text-emerald-700 dark:text-emerald-300" : "text-copy-strong";
  return (
    <div className="rounded-xl border border-line bg-surface-muted/40 px-3 py-3">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-copy-muted">{icon}{label}</div>
      <div className={`mt-1 text-lg font-semibold tabular-nums ${color}`}>{value}</div>
      {hint ? <div className="mt-0.5 text-[11px] text-copy-subtle">{hint}</div> : null}
    </div>
  );
}

function CurrencyRow({ row, month }: { row: CurrencyCash; month: string }) {
  const net = row.collectedThisMonth - row.refundedThisMonth;
  const c = row.currency;
  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
      <Tile icon={<CheckCircle2 size={13} />} label={`Collected in ${monthLabel(month)}`} value={money(net, c)} tone="good"
        hint={row.refundedThisMonth ? `after ${money(row.refundedThisMonth, c)} refunded` : "Verified payments"} />
      <Tile icon={<Hourglass size={13} />} label="Waiting for verification" value={money(row.awaitingVerification, c)} tone={row.awaitingVerification ? "warn" : undefined} hint="Logged by the team" />
      <Tile icon={<AlertTriangle size={13} />} label="Overdue" value={money(row.overdue, c)} tone={row.overdue ? "bad" : undefined} hint="Past the due date" />
      <Tile icon={<CalendarClock size={13} />} label="Due in 30 days" value={money(row.due30, c)} />
      <Tile icon={<CalendarClock size={13} />} label="Due in 31–60 days" value={money(row.due60, c)} />
      <Tile icon={<CalendarClock size={13} />} label="Due in 61–90 days" value={money(row.due90, c)} hint={row.dueLater ? `${money(row.dueLater, c)} later or no date` : undefined} />
    </div>
  );
}

function DueList({ title, items, overdue }: { title: string; items: DueItem[]; overdue?: boolean }) {
  if (!items.length) return null;
  return (
    <div className="min-w-0">
      <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-copy-muted">{title}</div>
      <ul className="divide-y divide-line rounded-xl border border-line">
        {items.slice(0, 6).map((i) => (
          <li key={i.enrollmentId} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
            <div className="min-w-0">
              <Link href={`/leads/${i.leadId}`} className="font-semibold text-copy-strong hover:underline">{i.leadName}</Link>
              <div className="truncate text-[11px] text-copy-muted">{i.courseName ?? "Course not set"}</div>
            </div>
            <div className="shrink-0 text-right">
              <div className="font-semibold tabular-nums">{money(i.amount, i.currency)}</div>
              <div className={`text-[11px] ${overdue ? "text-rose-700 dark:text-rose-300" : "text-copy-muted"}`}>
                {overdue ? `${i.daysLate} ${i.daysLate === 1 ? "day" : "days"} late` : dateLabel(i.dueDate)}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function RevenueCashPanel({ summary }: { summary: CashSummary }) {
  const empty = summary.byCurrency.length === 0;
  return (
    <section className="rounded-panel border border-line bg-surface px-4 py-4 shadow-card sm:px-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-copy-strong">Money in and money due</h2>
          <p className="text-[11px] text-copy-muted">From enrolments and the payments your team logs. Balances are due 7 days after the batch starts.</p>
        </div>
        <Link href="/enrollments" className="text-[12px] font-semibold text-brand-700 hover:underline">Verify payments</Link>
      </div>
      {empty ? (
        <p className="rounded-xl border border-dashed border-line px-3 py-4 text-sm text-copy-muted">
          No payments or open balances yet. They appear here as soon as the team marks a lead enrolled.
        </p>
      ) : (
        <div className="space-y-2">
          {summary.byCurrency.map((row) => (
            <div key={row.currency}>
              {summary.byCurrency.length > 1 ? <div className="mb-1 text-[11px] font-semibold text-copy-muted">{row.currency}</div> : null}
              <CurrencyRow row={row} month={summary.month} />
            </div>
          ))}
        </div>
      )}
      {summary.overdueItems.length || summary.upcomingItems.length ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <DueList title="Overdue" items={summary.overdueItems} overdue />
          <DueList title="Coming up" items={summary.upcomingItems} />
        </div>
      ) : null}
    </section>
  );
}
