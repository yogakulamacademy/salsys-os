import Link from "next/link";
import { CalendarDays, CircleDollarSign, FileCheck2, PauseCircle, UsersRound, XCircle } from "lucide-react";

import { OperationsJourneyBar } from "@/components/operations/operations-journey-bar";
import { PageHeader } from "@/components/ui";
import { getEnrollmentsWorkspace, type EnrollmentStatus } from "@/lib/enrollments-data";

export default async function EnrollmentsPage() {
  const workspace = await getEnrollmentsWorkspace();
  const { rows, summary } = workspace;

  return (
    <div className="space-y-4">
      <OperationsJourneyBar />

      <PageHeader
        eyebrow="Operations · Enrollments"
        title="Enrollments"
        description="Review authoritative enrollment records by customer, program and batch. Lead stage is shown only as context and never substitutes for Enrollment status."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/course-management" className="btn-secondary">Programs & Batches</Link>
            <Link href="/admissions" className="btn-primary">Admissions</Link>
          </div>
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <Metric label="Total records" value={summary.total} icon={<UsersRound size={16} />} />
        <Metric label="Pending" value={summary.pending} icon={<CalendarDays size={16} />} />
        <Metric label="Confirmed" value={summary.confirmed} icon={<FileCheck2 size={16} />} />
        <Metric label="Completed" value={summary.completed} icon={<FileCheck2 size={16} />} />
        <Metric label="Deferred" value={summary.deferred} icon={<PauseCircle size={16} />} />
        <Metric label="Cancelled" value={summary.cancelled} icon={<XCircle size={16} />} />
      </section>

      <section className="card-pad overflow-hidden p-0">
        <div className="border-b border-line px-5 py-4">
          <div className="eyebrow">Enrollment truth</div>
          <div className="section-title mt-1">Current records</div>
          <p className="mt-1 text-xs text-copy-muted">
            These rows come from the Enrollments table. A Lead marked Enrolled without an Enrollment record will not appear here.
          </p>
        </div>

        {rows.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <div className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-brand-50 text-brand-700">
              <FileCheck2 size={19} />
            </div>
            <div className="mt-4 text-sm font-semibold text-copy-strong">No enrollment records yet</div>
            <p className="mx-auto mt-1 max-w-xl text-xs leading-5 text-copy-muted">
              Production currently has no authoritative Enrollment rows. Lead stages and payment states remain separate and are not converted into enrollment records automatically.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Link href="/course-management" className="btn-secondary">Review batches</Link>
              <Link href="/admissions" className="btn-primary">Open Admissions</Link>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto overscroll-x-contain [scrollbar-width:thin]">
            <table className="min-w-[920px] text-left text-xs">
              <thead className="bg-surface-muted text-[10px] uppercase tracking-wide text-copy-subtle">
                <tr>
                  <th className="px-5 py-3">Customer / Opportunity</th>
                  <th className="px-4 py-3">Program</th>
                  <th className="px-4 py-3">Batch</th>
                  <th className="px-4 py-3">Enrollment</th>
                  <th className="px-4 py-3">Lead stage</th>
                  <th className="px-4 py-3">Value</th>
                  <th className="px-4 py-3">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((row) => (
                  <tr key={row.id} className="align-top hover:bg-surface-muted/50">
                    <td className="px-5 py-4">
                      <Link href={`/leads/${row.leadId}`} className="font-semibold text-copy-strong hover:text-brand-700">
                        {row.leadName}
                      </Link>
                      <div className="mt-1 text-[10px] text-copy-subtle">{row.leadCode}</div>
                    </td>
                    <td className="px-4 py-4 font-medium text-copy-strong">{row.courseName}</td>
                    <td className="px-4 py-4">
                      <div className="font-medium text-copy-strong">{row.batchCode}</div>
                      <div className="mt-1 text-[10px] text-copy-subtle">
                        {[row.batchLocation, formatRange(row.batchStartDate, row.batchEndDate)].filter(Boolean).join(" · ") || "—"}
                      </div>
                    </td>
                    <td className="px-4 py-4"><Status status={row.status} /></td>
                    <td className="px-4 py-4 text-copy-muted">{pretty(row.leadStage)}</td>
                    <td className="px-4 py-4">
                      <div className="inline-flex items-center gap-1.5 font-semibold text-copy-strong">
                        <CircleDollarSign size={13} className="text-copy-subtle" />
                        {formatMoney(row.totalValue, row.currency)}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-copy-muted">{formatDate(row.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Metric({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="card-pad">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-wide text-copy-subtle">{label}</div>
          <div className="mt-1 text-2xl font-black text-copy-strong">{value}</div>
        </div>
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-50 text-brand-700">{icon}</span>
      </div>
    </div>
  );
}

function Status({ status }: { status: EnrollmentStatus }) {
  const classes: Record<EnrollmentStatus, string> = {
    pending: "border-amber-200 bg-amber-50 text-amber-700",
    confirmed: "border-emerald-200 bg-emerald-50 text-emerald-700",
    completed: "border-blue-200 bg-blue-50 text-blue-700",
    deferred: "border-violet-200 bg-violet-50 text-violet-700",
    cancelled: "border-red-200 bg-red-50 text-red-700",
  };
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold ${classes[status]}`}>{pretty(status)}</span>;
}

function pretty(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function formatRange(start: string | null, end: string | null) {
  if (!start && !end) return "";
  if (start && end) return `${formatDate(start)} – ${formatDate(end)}`;
  return formatDate(start || end);
}

function formatMoney(value: number | null, currency: string | null) {
  if (value == null) return "Not set";
  const code = currency || "INR";
  try {
    return new Intl.NumberFormat(code === "INR" ? "en-IN" : "en-US", {
      style: "currency",
      currency: code,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${code} ${value.toLocaleString("en-IN")}`;
  }
}
