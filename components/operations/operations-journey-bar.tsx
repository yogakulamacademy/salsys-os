import Link from "next/link";
import { BookOpen, FileCheck2, LayoutDashboard, ShieldCheck, UsersRound } from "lucide-react";

export function OperationsJourneyBar() {
  return (
    <section className="mb-4 rounded-2xl border border-line bg-surface px-4 py-3 shadow-sm sm:px-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="text-[9px] font-black uppercase tracking-[.14em] text-copy-subtle">Operations workspace</div>
          <p className="mt-1 text-[11px] leading-5 text-copy-muted">
            Move from operating capacity and availability into program, batch, enrollment and admissions execution without changing the underlying records.
          </p>
        </div>
        <div className="-mx-1 flex snap-x snap-mandatory gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
          <Link href="/operations" className="btn-secondary shrink-0 snap-start">
            <LayoutDashboard size={14} /> Overview
          </Link>
          <Link href="/availability" className="btn-secondary shrink-0 snap-start">
            <ShieldCheck size={14} /> Availability
          </Link>
          <Link href="/course-management" className="btn-secondary shrink-0 snap-start">
            <BookOpen size={14} /> Programs & Batches
          </Link>
          <Link href="/enrollments" className="btn-secondary shrink-0 snap-start">
            <FileCheck2 size={14} /> Enrollments
          </Link>
          <Link href="/admissions" className="btn-secondary shrink-0 snap-start">
            <UsersRound size={14} /> Admissions
          </Link>
        </div>
      </div>
    </section>
  );
}
