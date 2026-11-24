import 'server-only';
import Link from 'next/link';
import { Activity, ArrowRight, Building2, CreditCard, Layers3, ShieldCheck, UsersRound } from 'lucide-react';
import { PlatformAdminFrame } from '@/components/platform-admin-frame';
import { loadPlatformOrganizationSummary } from '@/lib/platform-organization-summary';
import { loadPlatformSubscriptionSummary } from '@/lib/platform-subscription-summary';
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
  const organizations = await loadPlatformOrganizationSummary().catch(() => null);
  const subscriptions = await loadPlatformSubscriptionSummary().catch(() => null);
  const publishedCount = PLAN_CODES.filter(code => (state.versions[code] ?? 0) > 0).length;

  return (
    <PlatformAdminFrame section="overview">
        <main className="min-w-0 space-y-6">
          <header className="flex flex-wrap items-start justify-between gap-4">
            <div><p className="text-xs font-bold uppercase tracking-wider text-brand-700">Platform command center</p><h1 className="mt-1 text-[28px] font-bold tracking-tight">Platform overview</h1>
              <p className="mt-1 text-sm text-copy-muted">Manage organizations, monitor subscriptions and review launch readiness.</p></div>
            <Link href="/settings/organizations" className="btn-primary"><Building2 size={16} aria-hidden="true" /> Manage organizations</Link>
          </header>
          <section aria-label="Commercial configuration" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <article className="rounded-xl border border-line bg-surface p-4 shadow-sm"><Layers3 size={19} className="text-brand-700" aria-hidden="true" /><h2 className="mt-3 text-sm text-copy-muted">Published catalog plans</h2><p className="mt-1 text-2xl font-bold tabular-nums">{publishedCount} / {PLAN_CODES.length}</p><Link href="/settings/commercial-plans" className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-brand-700">Review plans <ArrowRight size={12} /></Link></article>
            <article className="rounded-xl border border-line bg-surface p-4 shadow-sm"><Building2 size={19} className="text-brand-700" aria-hidden="true" /><h2 className="mt-3 text-sm text-copy-muted">Registered organizations</h2><p className="mt-1 text-2xl font-bold tabular-nums">{organizations?.registeredNonPlatformOrganizations ?? 'Unavailable'}</p><Link href="/settings/organizations" className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-brand-700">View registry <ArrowRight size={12} /></Link></article>
            <article className="rounded-xl border border-line bg-surface p-4 shadow-sm"><CreditCard size={19} className="text-brand-700" aria-hidden="true" /><h2 className="mt-3 text-sm text-copy-muted">Manual pilot organizations</h2><p className="mt-1 text-2xl font-bold tabular-nums">{readiness ? readiness.pilot_used + ' / ' + readiness.pilot_capacity : 'Unavailable'}</p>{pilotEnabled && <Link href="/settings/commercial-plans/pilot" className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-brand-700">Review pilot <ArrowRight size={12} /></Link>}</article>
            <article className="rounded-xl border border-line bg-surface p-4 shadow-sm"><ShieldCheck size={19} className="text-brand-700" aria-hidden="true" /><h2 className="mt-3 text-sm text-copy-muted">Database configuration</h2><p className="mt-1 text-xl font-bold">{readiness ? (readiness.database_configuration_ready ? 'Checks passed' : 'Incomplete') : 'Unavailable'}</p><Link href="/platform-admin/health" className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-brand-700">Review controls <ArrowRight size={12} /></Link></article>
          </section>
          <section className="rounded-xl border border-line bg-surface p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-semibold">Organization registry</h2>
              <Link href="/settings/organizations" className="text-sm underline">Manage organizations</Link>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <article className="rounded-lg border border-line p-3"><h3 className="text-sm">Registered organizations</h3><p className="mt-2 text-2xl font-bold">{organizations?.registeredNonPlatformOrganizations ?? 'Unavailable'}</p></article>
              <article className="rounded-lg border border-line p-3"><h3 className="text-sm">Active organizations</h3><p className="mt-2 text-2xl font-bold">{organizations?.activeNonPlatformOrganizations ?? 'Unavailable'}</p></article>
              <article className="rounded-lg border border-line p-3"><h3 className="text-sm">Completed onboarding records</h3><p className="mt-2 text-2xl font-bold">{organizations?.completedNonPlatformOnboardingRecords ?? 'Unavailable'}</p></article>
            </div>
            <p className="mt-3 text-xs text-copy-muted">Exact registry counts exclude the SalsysOS platform workspace but include demo and legacy organizations. These are not paying-customer or subscription metrics.</p>
          </section>
          <section className="rounded-xl border border-line bg-surface p-5 shadow-sm">
            <h2 className="font-semibold">Published catalog versions</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-4">
              {PLAN_CODES.map(code => <div key={code} className="rounded-lg border border-line p-3"><h3 className="font-medium capitalize">{code}</h3><p className="text-sm">Version: {state.versions[code] ?? 'Not published'}</p></div>)}
            </div>
            <Link href="/settings/commercial-plans" className="mt-4 inline-block text-sm underline">Manage commercial plans</Link>
          </section>
          <section className="rounded-xl border border-line bg-surface p-5 shadow-sm">
            <h2 className="flex items-center gap-2 font-semibold"><Activity size={18} className="text-brand-700" aria-hidden="true" /> Launch readiness</h2>
            {readiness ? (
              <>
                <p className="mt-2 text-sm">{readiness.trial_days}-day trial policy; {readiness.pilot_capacity}-organization manual pilot.</p>
                {readiness.blockers.length > 0 && <ul className="mt-2 list-disc pl-5 text-sm">{readiness.blockers.map(blocker => <li key={blocker}>{blocker.replaceAll('_', ' ')}</li>)}</ul>}
              </>
            ) : <p className="mt-2 text-sm">Configuration evidence unavailable.</p>}
            <p className="mt-3 text-xs text-copy-muted">Database checks are not release approval, live scheduler evidence, or proof of public registration availability.</p>
          </section>
          <section className="rounded-xl border border-line bg-surface p-5 shadow-sm" aria-label="Subscription monitoring">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-semibold">Subscription monitoring</h2>
              {pilotEnabled && <Link href="/settings/commercial-plans/pilot" className="text-sm underline">Manage manual subscriptions</Link>}
            </div>
            {subscriptions ? <>
              <p className="mt-2 text-sm">Recorded subscriptions: <strong>{subscriptions.total}</strong></p>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                {Object.entries(subscriptions.recorded).map(([status, count]) => <article key={status} className="rounded-lg border border-line p-3"><h3 className="text-sm capitalize">{status.replaceAll('_', ' ')} records</h3><p className="mt-2 text-2xl font-bold">{count}</p></article>)}
              </div>
              <div className="mt-4 space-y-2 text-sm">
                <p>Trialing records with deadline reached: <strong>{subscriptions.trialDeadlinePassed}</strong></p>
                <p>Active records with period end reached: <strong>{subscriptions.activePeriodEnded}</strong></p>
                <p className="text-xs text-copy-muted">Deadline cutoff: {subscriptions.observedAt}</p>
              </div>
            </> : <p role="status" className="mt-3 text-sm">Subscription monitoring unavailable.</p>}
            <p className="mt-3 text-xs text-copy-muted">Recorded database statuses exclude the internal platform organization. They are not effective access decisions or evidence of payment. Deadline counts are operational review signals, not proof of a reconciliation failure. Counts are separate reads and may change during concurrent updates.</p>
          </section>
          <section className="rounded-xl border border-line bg-surface p-5 shadow-sm">
            <h2 className="flex items-center gap-2 font-semibold"><UsersRound size={18} className="text-brand-700" aria-hidden="true" /> Platform reporting</h2>
            <div className="mt-3 flex flex-wrap gap-3"><Link href="/platform-admin/customer-success" className="text-sm underline">Customer onboarding monitoring</Link><Link href="/platform-admin/business" className="text-sm underline">Internal acquisition workspace</Link></div>
            <p className="mt-3 text-sm text-copy-muted">SaaS MRR, ARR, collected revenue and outstanding invoices are unavailable pending verified billing evidence. Internal CRM revenue is separate. Product adoption and churn are not inferred from registry or subscription counts.</p>
          </section>
        </main>
    </PlatformAdminFrame>
  );
}
