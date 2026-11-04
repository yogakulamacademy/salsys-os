import Link from "next/link";
import { ChevronDown, Download, MoreHorizontal, Plus, Upload } from "lucide-react";

type Props = {
  canManage: boolean;
  mock: boolean;
  exportHref: string;
};

export function LeadsHeaderActions({ canManage, mock, exportHref }: Props) {
  const enabled = canManage && !mock;
  const unavailableReason = mock
    ? "Import and export are disabled in demo mode."
    : "Import and export require Sales management and CRM contact-data access.";

  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="leads-import-export-actions">
      {enabled ? (
        <a
          href={exportHref}
          className="inline-flex h-10 items-center gap-2 rounded-ui border border-brand-200 bg-surface px-3 text-xs font-semibold text-brand-700 transition hover:border-brand-400 hover:bg-brand-50 dark:text-brand-300"
          title="Export current filters (up to 2,000 authorized leads)"
        >
          <Download size={15} aria-hidden />
          Export leads
        </a>
      ) : (
        <span
          role="note"
          aria-label={"Export leads unavailable. " + unavailableReason}
          title={unavailableReason}
          className="inline-flex h-10 cursor-not-allowed items-center gap-2 rounded-ui border border-line bg-surface-muted px-3 text-xs font-semibold text-copy-subtle"
        >
          <Download size={15} aria-hidden />
          Export leads
        </span>
      )}

      <div className="inline-flex h-10 items-stretch rounded-ui bg-brand-700 text-white shadow-sm">
        <Link
          href="/leads/new"
          className="inline-flex items-center gap-1.5 rounded-l-ui px-3 text-[13px] font-semibold transition hover:bg-brand-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
        >
          <Plus size={15} aria-hidden /> Add lead
        </Link>
        <details className="group relative border-l border-white/25">
          <summary
            className="grid h-full w-9 cursor-pointer list-none place-items-center rounded-r-ui transition hover:bg-brand-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700 [&::-webkit-details-marker]:hidden"
            aria-label="More add lead options"
            title="More add lead options"
          >
            <ChevronDown size={15} className="transition group-open:rotate-180" aria-hidden />
          </summary>
          <div className="absolute right-0 z-30 mt-2 w-[208px] rounded-xl border border-line bg-surface p-1.5 text-copy-strong shadow-panel">
            <Link
              href="/leads/new"
              className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-xs font-medium transition hover:bg-surface-muted"
            >
              <Plus size={14} aria-hidden /> Add one lead
            </Link>
            {enabled ? (
              <Link
                href="/leads/import"
                className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-xs font-medium transition hover:bg-surface-muted"
              >
                <Upload size={14} aria-hidden /> Import leads (CSV)
              </Link>
            ) : (
              <span
                aria-disabled="true"
                title={unavailableReason}
                className="flex cursor-not-allowed items-center gap-2 rounded-lg px-3 py-2.5 text-xs text-copy-subtle"
              >
                <Upload size={14} aria-hidden /> Import leads (CSV)
              </span>
            )}
          </div>
        </details>
      </div>

      <Link
        href="/team"
        aria-label="Open team workspace"
        className="grid h-10 w-10 place-items-center rounded-ui border border-line bg-surface text-copy-muted transition hover:border-line-strong hover:bg-surface-soft hover:text-brand-700"
      >
        <MoreHorizontal size={17} aria-hidden />
      </Link>
    </div>
  );
}
