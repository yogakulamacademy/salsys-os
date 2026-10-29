import Link from 'next/link';
import { ArrowLeft, Home } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="grid min-h-[60vh] place-items-center px-4 py-12">
      <div className="w-full max-w-lg rounded-panel border border-line bg-surface p-6 text-center shadow-panel sm:p-8">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-brand-50 text-brand-700 text-sm font-bold">
          404
        </div>
        <div className="mt-5 ui-page-kicker">Page not found</div>
        <h1 className="mt-1.5 text-[24px] font-semibold tracking-[-0.035em] text-copy-strong">
          This page isn’t available
        </h1>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-copy-muted">
          The link may be outdated, the page may have moved, or you may not have access to this route.
        </p>
        <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
          <Link href="/home" className="btn-primary justify-center">
            <Home size={15} aria-hidden="true" />
            Dashboard
          </Link>
          <Link href="/leads" className="btn-secondary justify-center">
            <ArrowLeft size={15} aria-hidden="true" />
            Back to CRM
          </Link>
        </div>
      </div>
    </div>
  );
}
