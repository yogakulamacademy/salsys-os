import Link from "next/link";
import { BookOpen, LayoutDashboard, UsersRound } from "lucide-react";

export function OperationsJourneyBar() {
  return (
    <section className="mb-4 rounded-2xl border border-line bg-surface px-4 py-3 shadow-sm sm:px-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="text-[9px] font-black uppercase tracking-[.14em] text-copy-subtle">Operations workspace</div>
          <p className="mt-1 text-[11px] leading-5 text-copy-muted">
            Move from operating capacity and availability into program, batch and admissions execution without changing the underlying records.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/operations" className="btn-secondary">
            <LayoutDashboard size={14} /> Overview
          </Link>
          <Link href="/course-management" className="btn-secondary">
            <BookOpen size={14} /> Programs & Batches
          </Link>
          <Link href="/admissions" className="btn-secondary">
            <UsersRound size={14} /> Admissions
          </Link>
        </div>
      </div>
    </section>
  );
}
