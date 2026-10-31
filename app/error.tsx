'use client';

import Link from 'next/link';
import { AlertTriangle, Home, RotateCcw } from 'lucide-react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="grid min-h-[60vh] place-items-center px-4 py-12">
      <div className="w-full max-w-lg rounded-panel border border-line bg-surface p-6 text-center shadow-panel sm:p-8">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
          <AlertTriangle size={22} aria-hidden="true" />
        </div>
        <div className="mt-5 ui-page-kicker">Something went wrong</div>
        <h1 className="mt-1.5 text-[24px] font-semibold tracking-[-0.035em] text-copy-strong">
          We couldn’t load this page
        </h1>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-copy-muted">
          The page hit an unexpected problem. You can try loading it again or return to the Command Center.
        </p>

        <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
          <button type="button" onClick={reset} className="btn-primary justify-center">
            <RotateCcw size={15} aria-hidden="true" />
            Try again
          </button>
          <Link href="/home" className="btn-secondary justify-center">
            <Home size={15} aria-hidden="true" />
            Command Center
          </Link>
        </div>

        {process.env.NODE_ENV === 'development' && error.digest ? (
          <p className="mt-5 text-[11px] text-copy-subtle">Error reference: {error.digest}</p>
        ) : null}
      </div>
    </div>
  );
}
