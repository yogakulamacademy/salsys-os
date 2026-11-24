import 'server-only';
import Link from 'next/link';
import { PlatformAdminFrame } from '@/components/platform-admin-frame';
import { notFound } from 'next/navigation';
import { PLAN_CODES, readPlanReviewState } from '@/lib/commercial/plan-admin';
import { loadManualLaunchReadiness, type ManualLaunchReadiness } from '@/lib/commercial/manual-pilot';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Platform administration',
  robots: { index: false, follow: false, nocache: true },
};

export default async function PlatformAdminPage() {
  if (process.env.SALSYS_PLATFORM_ADMIN_ENABLED !== 'true') notFound();
  // This reads through the existing session-bound tenant, verified user and
  // dedicated commercial operator authorization. No client-provided actor.
  const state = await readPlanReviewState().catch(() => null);
  if (!state) notFound();

  const pilotEnabled = process.env.SALSYS_MANUAL_PILOT_ENABLED === 'true';
  let readiness: ManualLaunchReadiness | null = null;
  if (pilotEnabled) {
    readiness = await loadManualLaunchReadiness().catch(() => null);
  }
  const publishedCount = PLAN_CODES.filter(code => (state.versions[code] ?? 0) > 0).length;

  return (
    <PlatformAdminFrame section="overview">
        <main className="min-w-0 space-y-6">
          <header>
            <h1 className="text-2xl font-bold">Platform overview</h1>
            <p className="mt-1 text-sm text-copy-muted">Commercial configuration and controlled launch readiness. Business workspace links retain existing tenant permissions.</p>
          </header>
          <section aria-label="Commercial configuration" className="grid gap-3 sm:grid-cols-3">
            <article className="rounded-xl border border-line p-4"><h2 className="text-sm">Published catalog plans</h2><p className="mt-2 text-2xl font-bold">{publishedCount} / {PLAN_CODES.length}</p></article>
            <article className="rounded-xl border border-line p-4"><h2 className="text-sm">Manual pilot organizations</h2><p className="mt-2 text-2xl font-bold">{readiness ? readiness.pilot_used + ' / ' + readiness.pilot_capacity : 'Unavailable'}</p></article>
            <article className="rounded-xl border border-line p-4"><h2 className="text-sm">Database configuration</h2><p className="mt-2 text-lg font-bold">{readiness ? (readiness.database_configuration_ready ? 'Checks passed' : 'Incomplete') : 'Unavailable'}</p></article>
          </section>
          <section className="rounded-xl border border-line p-5">
            <h2 className="font-semibold">Published catalog versions</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-4">
              {PLAN_CODES.map(code => <div key={code} className="rounded-lg border border-line p-3"><h3 className="font-medium capitalize">{code}</h3><p className="text-sm">Version: {state.versions[code] ?? 'Not published'}</p></div>)}
            </div>
            <Link href="/settings/commercial-plans" className="mt-4 inline-block text-sm underline">Manage commercial plans</Link>
          </section>
          <section className="rounded-xl border border-line p-5">
            <h2 className="font-semibold">Launch readiness</h2>
            {readiness ? (
              <>
                <p className="mt-2 text-sm">{readiness.trial_days}-day trial policy; {readiness.pilot_capacity}-organization manual pilot.</p>
                {readiness.blockers.length > 0 && <ul className="mt-2 list-disc pl-5 text-sm">{readiness.blockers.map(blocker => <li key={blocker}>{blocker.replaceAll('_', ' ')}</li>)}</ul>}
              </>
            ) : <p className="mt-2 text-sm">Configuration evidence unavailable.</p>}
            <p className="mt-3 text-xs text-copy-muted">Database checks are not release approval, live scheduler evidence, or proof of public registration availability.</p>
          </section>
          <section className="rounded-xl border border-line p-5">
            <h2 className="font-semibold">Platform reporting</h2>
            <p className="mt-2 text-sm text-copy-muted">Customer lifecycle, subscription revenue, acquisition and platform usage reporting require separate verified read models. No estimated or fabricated metrics are shown.</p>
          </section>
        </main>
    </PlatformAdminFrame>
  );
}
