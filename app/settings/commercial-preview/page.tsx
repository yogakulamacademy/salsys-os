import type { Metadata } from 'next';
import { CircleAlert, LockKeyhole, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { requireCommercialPlatformReviewPreview } from '@/lib/commercial/plan-review-auth-preview';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Commercial Plans — Internal Draft Preview',
  description: 'Restricted design preview of proposed SalsysOS plan governance.',
  robots: { index: false, follow: false, nocache: true },
};

type ProposedTier = {
  code: 'free' | 'basic' | 'growth' | 'pro';
  title: string;
  monthly: string;
  setup: string;
  users: string;
  leadLimit: string;
  summary: string;
  recommended?: boolean;
};

const proposals: readonly ProposedTier[] = [
  {
    code: 'free',
    title: 'Starter Workspace',
    monthly: '₹0',
    setup: 'Optional assistance ₹2,999–₹4,999',
    users: '1',
    leadLimit: '250',
    summary: 'Core CRM, manual leads, pipeline and follow-ups.',
  },
  {
    code: 'basic',
    title: 'Lead Management',
    monthly: '₹1,499',
    setup: 'Managed setup ₹4,999–₹7,999',
    users: '2',
    leadLimit: '2,000',
    summary: 'Lead ownership, task assignment and basic source reporting.',
  },
  {
    code: 'growth',
    title: 'Marketing Intelligence',
    monthly: '₹3,499',
    setup: 'Managed setup ₹9,999–₹14,999',
    users: '5',
    leadLimit: '10,000',
    summary: 'Conversion analysis and conditional marketing integrations.',
    recommended: true,
  },
  {
    code: 'pro',
    title: 'Business Intelligence Suite',
    monthly: '₹6,999',
    setup: 'Managed setup ₹19,999–₹34,999',
    users: '10',
    leadLimit: '50,000',
    summary: 'Advanced reports, verified funnel evidence and conditional SEO.',
  },
];

const reviewGates = [
  {
    label: 'P0 commercial database foundation',
    detail: 'Local CI, CodeQL and migration replay passed; independent DBA/security review outstanding.',
    complete: false,
  },
  {
    label: 'P1 pricing and authorization proposal',
    detail: 'Versioned proposal, local database tests and server-auth preview only. No live plan activation.',
    complete: false,
  },
  {
    label: 'Commercial terms and tax',
    detail: 'Obtain owner approval of pricing, limits, support, cancellation, export and tax treatment.',
    complete: false,
  },
  {
    label: 'P2 / P3 / P4 public release',
    detail: 'Require separately accepted signup, billing, enforced limits, downgrade and offboarding.',
    complete: false,
  },
] as const;

/**
 * Restricted operator-only screen. Data is static proposal text, NOT Supabase
 * commercial state. Do not link this to public /pricing or call it a billing UI.
 */
export default async function CommercialPreviewPage() {
  const actor = await requireCommercialPlatformReviewPreview();

  if (actor.scope !== 'platform_plan_review' ||
      actor.readonlyOnly !== true ||
      actor.canCharge !== false ||
      actor.canChangeSubscriptions !== false ||
      actor.canActivateCapabilities !== false) {
    throw new Error('commercial_preview_scope_denied');
  }

  return (
    <main className="mx-auto w-full max-w-7xl space-y-7 px-4 py-7 text-slate-900 sm:px-7">
      <header className="space-y-4">
        <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800">
          <LockKeyhole className="h-3.5 w-3.5" aria-hidden="true" />
          INTERNAL DESIGN PREVIEW · NO BILLING OR PLAN CHANGES
        </div>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-violet-700">
              Platform administration / R13-P1
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
              Commercial plans
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Review proposed plan positioning and release requirements. Nothing
              shown here is a live subscription, an approved price, or an active entitlement.
            </p>
          </div>
          <span className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
            Design review only
          </span>
        </div>
      </header>

      <section aria-label="Proposed commercial plans" className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {proposals.map((tier) => (
          <article
            key={tier.code}
            className={'relative rounded-2xl border bg-white p-5 shadow-sm ' +
              (tier.recommended
                ? 'border-violet-300 ring-1 ring-violet-200'
                : 'border-slate-200')}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
                {tier.code}
              </span>
              {tier.recommended && (
                <span className="rounded-full bg-violet-50 px-2 py-1 text-[11px] font-semibold text-violet-700">
                  Featured proposal
                </span>
              )}
            </div>
            <h2 className="mt-4 text-lg font-semibold tracking-tight">{tier.title}</h2>
            <div className="mt-4 text-3xl font-bold tracking-tight">
              {tier.monthly}
              <span className="ml-1 text-xs font-normal text-slate-500">/month</span>
            </div>
            <p className="mt-2 min-h-10 text-xs text-slate-500">{tier.setup}</p>
            <div className="mt-4 border-y border-slate-100 py-3 text-xs font-semibold text-slate-600">
              Proposed: {tier.users} user(s) · {tier.leadLimit} leads
            </div>
            <p className="mt-4 text-sm leading-6 text-slate-600">{tier.summary}</p>
            <p className="mt-4 text-xs font-semibold text-amber-700">
              Not approved · Limits not enforced
            </p>
          </article>
        ))}
      </section>

      <aside className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
        <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
        <p>
          Free setup assistance is optional. Provider integrations, WhatsApp messaging,
          Meta/Google Ads and website tracking require separate permissions, consent
          and independent release acceptance. No autonomous AI messaging is included.
        </p>
      </aside>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-1 h-5 w-5 shrink-0 text-violet-600" aria-hidden="true" />
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Release checklist</h2>
            <p className="mt-1 text-sm text-slate-500">
              These gates are not inferred from successful synthetic tests.
            </p>
          </div>
        </div>
        <ul className="mt-5 divide-y divide-slate-100">
          {reviewGates.map((gate) => (
            <li key={gate.label} className="flex items-start gap-3 py-4">
              {gate.complete ? (
                <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
              ) : (
                <CircleAlert className="mt-1 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
              )}
              <div>
                <h3 className="text-sm font-semibold">{gate.label}</h3>
                <p className="mt-1 text-xs leading-5 text-slate-600">{gate.detail}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <footer className="rounded-xl bg-slate-100 px-4 py-3 text-xs leading-5 text-slate-600">
        No live plan catalog, approval actions, account upgrades, payment records, customer
        tenant reads, or runtime capability changes are connected to this preview.
        The R2 staging hold and AI production release restrictions remain unchanged.
      </footer>
    </main>
  );
}
