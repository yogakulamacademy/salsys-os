import Link from "next/link";
import { CalendarCheck2, ExternalLink } from "lucide-react";

import { getRecentBookingActivity } from "@/lib/booking-activity-data";
import { Notice } from "@/components/ui";

export async function RecentBookingActivity() {
  const activity = await getRecentBookingActivity();

  return (
    <section className="rounded-panel border border-line bg-surface p-4 shadow-xs">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="eyebrow">Website booking activity</div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h2 className="section-title">Recent booking completions</h2>
            <span className="rounded-full bg-violet-50 px-2.5 py-1 text-[10px] font-semibold text-violet-700">
              {activity.total30d} in 30 days
            </span>
          </div>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-copy-subtle">
            Trusted booking-completed events linked to existing CRM Opportunities. Booking activity does not mean payment or enrollment is confirmed.
          </p>
        </div>
      </div>

      {activity.warning ? (
        <Notice tone="warning" className="mt-4">
          {activity.warning}
        </Notice>
      ) : null}

      {!activity.warning && activity.rows.length === 0 ? (
        <div className="mt-4 rounded-ui border border-dashed border-line bg-surface-soft px-4 py-6 text-sm text-copy-subtle">
          No visible booking-completed activity is linked to accessible Leads in the last 30 days.
        </div>
      ) : null}

      {activity.rows.length > 0 ? (
        <div className="mt-4 grid gap-2 lg:grid-cols-2">
          {activity.rows.map((row) => (
            <Link
              key={row.touchpointId}
              href={`/leads/${row.leadId}`}
              className="group flex min-w-0 items-start gap-3 rounded-ui border border-line bg-surface-soft px-3.5 py-3 transition hover:border-brand-200 hover:bg-brand-50/50"
            >
              <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-ui bg-violet-100 text-violet-700">
                <CalendarCheck2 size={15} strokeWidth={1.8} />
              </span>

              <span className="min-w-0 flex-1">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-[12px] font-semibold text-copy-strong">
                    {row.leadName}
                  </span>
                  {row.leadCode ? (
                    <span className="shrink-0 text-[9px] font-medium text-copy-subtle">
                      {row.leadCode}
                    </span>
                  ) : null}
                </span>

                <span className="mt-1 block truncate text-[11px] font-medium text-violet-700">
                  {row.bookingReference}
                </span>

                <span className="mt-1 block text-[10px] text-copy-subtle">
                  {formatDateTime(row.occurredAt)}
                  {row.source ? ` · ${pretty(row.source)}` : ""}
                </span>
              </span>

              <ExternalLink size={13} className="mt-1 shrink-0 text-copy-subtle transition group-hover:text-brand-700" />
            </Link>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function formatDateTime(value: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  }).format(date);
}

function pretty(value: string) {
  return value.replaceAll("_", " ").replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
