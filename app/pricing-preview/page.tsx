import type { Metadata } from 'next';
import { ArrowUpRight, Check, CircleAlert, ShieldCheck } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Draft Pricing Preview — Not a Live SalsysOS Offer',
  description: 'Internal review of proposed SalsysOS Free, Basic, Growth and Pro plans.',
  robots: { index: false, follow: false, nocache: true },
};

type Feature = { label: string; conditional?: boolean };
type Tier = {
  key: string;
  name: string;
  subtitle: string;
  price: string;
  setup: string;
  users: number;
  leads: string;
  highlighted?: boolean;
  features: Feature[];
};

const tiers: Tier[] = [
  {
    key: 'free',
    name: 'Free',
    subtitle: 'Starter Workspace',
    price: '₹0',
    setup: 'Optional assisted setup: ₹2,999–₹4,999',
    users: 1,
    leads: '250',
    features: [
      { label: 'Leads, contacts and basic pipeline' },
      { label: 'Manual lead entry' },
      { label: 'CSV import after safety review' },
      { label: 'Basic dashboard and follow-up tasks' },
      { label: 'No mandatory setup fee' },
    ],
  },
  {
    key: 'basic',
    name: 'Basic',
    subtitle: 'Lead Management',
    price: '₹1,499',
    setup: 'Managed setup: ₹4,999–₹7,999',
    users: 2,
    leads: '2,000',
    features: [
      { label: 'Everything in Free' },
      { label: 'Sales and admissions assignments' },
      { label: 'Follow-up reminders and source reports' },
      { label: 'One website lead form', conditional: true },
      { label: 'One WhatsApp Business connection', conditional: true },
    ],
  },
  {
    key: 'growth',
    name: 'Growth',
    subtitle: 'Marketing Intelligence',
    price: '₹3,499',
    setup: 'Managed setup: ₹9,999–₹14,999',
    users: 5,
    leads: '10,000',
    highlighted: true,
    features: [
      { label: 'Everything in Basic' },
      { label: 'Paid media and re-engaged leads' },
      { label: 'Team performance and conversion reports' },
      { label: 'Evidence-based source attribution' },
      { label: 'Instagram and Google/Meta Ads reporting', conditional: true },
    ],
  },
  {
    key: 'pro',
    name: 'Pro',
    subtitle: 'Business Intelligence Suite',
    price: '₹6,999',
    setup: 'Managed setup: ₹19,999–₹34,999',
    users: 10,
    leads: '50,000',
    features: [
      { label: 'Everything in Growth' },
      { label: 'Advanced reporting and role governance' },
      { label: 'Reconciled funnel and touchpoint analysis' },
      { label: 'Website behavior and SEO/GSC', conditional: true },
      { label: 'Forecasting after validated outcomes', conditional: true },
    ],
  },
];

const faqs = [
  {
    question: 'Is the Free plan available to sign up for today?',
    answer:
      'Not yet. The Free tier is proposed to cost ₹0/month with no mandatory setup fee, but public self-service signup has not been released.',
  },
  {
    question: 'Are the prices per user?',
    answer:
      'No. The proposed monthly amounts are per business workspace. The named-user and lead-record limits shown are draft allowances, not currently enforced.',
  },
  {
    question: 'Are WhatsApp and Instagram included automatically?',
    answer:
      'No. These are potential plan eligibilities, not activated connections. Provider permission, consent, technical verification and a written scope are required. Provider charges are separate.',
  },
  {
    question: 'Can AI send replies automatically?',
    answer:
      'Not under these proposed plans. Autonomous replies and automated customer messaging require independent governance and release acceptance.',
  },
  {
    question: 'What happens after the founding pilot?',
    answer:
      'After the separate 60-day managed pilot, customers may choose a then-approved tier or agree to a separately priced service. There is no automatic renewal or ₹7,999 continuation.',
  },
];

export default function PricingPreviewPage() {
  return (
    <main className="min-h-screen bg-[#f9f8fc] text-[#22202e]">
      <section className="border-b border-[#e9e6f0] bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-5 py-5 sm:px-8">
          <span className="font-bold tracking-tight">SalsysOS</span>
          <span className="rounded-full border border-[#e3cf96] bg-[#fff8e7] px-3 py-1.5 text-xs font-semibold text-[#70551b]">
            INTERNAL DRAFT PREVIEW · NOT AN ACTIVE OFFER
          </span>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-5 pb-20 sm:px-8">
        <header className="mx-auto max-w-3xl py-16 text-center sm:py-20">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#6954ac]">
            Proposed pricing for enquiry-led teams
          </p>
          <h1 className="mt-4 text-4xl font-bold leading-tight tracking-[-0.055em] sm:text-6xl">
            Start with leads. Grow into intelligence.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-[#6c6878]">
            One workspace for your sales pipeline and follow-ups, with broader
            marketing intelligence as your team grows. All prices are proposed,
            not a public checkout offer.
          </p>
          <p className="mt-4 text-xs text-[#74707f]">
            Per workspace · Applicable taxes and external provider usage are separate
          </p>
        </header>

        <section aria-label="Proposed SalsysOS plans" className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {tiers.map((tier) => (
            <article
              key={tier.key}
              className={
                'relative flex flex-col rounded-2xl border bg-white p-6 shadow-sm ' +
                (tier.highlighted
                  ? 'border-[#7960cc] ring-1 ring-[#7960cc]'
                  : 'border-[#e6e3ee]')
              }
            >
              {tier.highlighted && (
                <span className="mb-3 inline-flex w-fit rounded-full bg-[#ede8fc] px-3 py-1 text-xs font-bold text-[#6249b3]">
                  Featured for growth teams
                </span>
              )}
              <h2 className="text-xl font-bold">{tier.name}</h2>
              <p className="mt-1 text-sm text-[#686479]">{tier.subtitle}</p>
              <p className="mt-7 text-4xl font-bold tracking-[-0.06em]">
                {tier.price}
                <span className="ml-1 text-xs font-normal tracking-normal text-[#777484]">/month</span>
              </p>
              <p className="mt-3 min-h-12 text-xs text-[#777484]">{tier.setup}</p>
              <div className="mt-4 border-t border-[#ece9f1] pt-4 text-xs font-semibold text-[#494456]">
                {tier.users} {tier.users === 1 ? 'user' : 'users'} · up to {tier.leads} leads*
              </div>
              <ul className="mt-5 flex-1 space-y-3">
                {tier.features.map((feature) => (
                  <li className="flex gap-2 text-sm" key={feature.label}>
                    {feature.conditional ? (
                      <CircleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-[#b48537]" />
                    ) : (
                      <Check aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-[#6850ae]" />
                    )}
                    <span>
                      {feature.label}
                      {feature.conditional && (
                        <span className="ml-1 text-xs text-[#82632d]">(approval required)</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-7 rounded-xl border border-[#e7e2f3] bg-[#f6f3fd] px-3 py-3 text-center text-xs font-semibold text-[#5b4b91]">
                Not open for self-service purchase
              </div>
            </article>
          ))}
        </section>

        <aside className="mt-6 rounded-xl border border-[#eadfc5] bg-[#fffbf0] p-4 text-xs leading-6 text-[#76602b]">
          * Proposed limits are not enforced. Provider-dependent features require
          specific access, security, and consent acceptance. External message and ad charges
          are not included. No autonomous customer messaging is included in any tier.
        </aside>

        <section className="mt-16 grid items-center gap-8 rounded-3xl bg-[#242039] px-7 py-10 text-white md:grid-cols-[1fr_auto] md:px-10">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#c6b5ff]">
              Separate founding offer
            </p>
            <h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">
              A guided way to begin.
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-[#dad6e7]">
              A proposed 60-day managed pilot for up to three named users,
              with setup, team orientation and two review calls. The period begins
              only after approved tenant/privacy verification and secure activation.
            </p>
          </div>
          <div className="md:text-right">
            <p className="text-3xl font-bold tracking-tight">₹14,999</p>
            <p className="text-xs text-[#dad6e7]">One time / 60 days · proposed</p>
            <a
              href="#common-questions"
              className="mt-5 inline-flex items-center gap-1 rounded-lg bg-[#ebe4ff] px-4 py-2.5 text-sm font-semibold text-[#35285e] hover:bg-white"
            >
              Read pilot FAQ <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </a>
          </div>
        </section>

        <section id="common-questions" className="mx-auto mt-20 max-w-3xl scroll-mt-24">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Common questions</h2>
          <div className="mt-6 divide-y divide-[#e1dfea] border-y border-[#e1dfea]">
            {faqs.map((faq) => (
              <details key={faq.question} className="group py-5">
                <summary className="cursor-pointer text-sm font-semibold marker:text-[#6954ac]">
                  {faq.question}
                </summary>
                <p className="mt-3 text-sm leading-7 text-[#716d7e]">{faq.answer}</p>
              </details>
            ))}
          </div>
          <p className="mt-6 flex items-start gap-2 text-sm text-[#6b6678]">
            <ShieldCheck aria-hidden="true" className="mt-1 h-4 w-4 shrink-0" />
            This review-only page collects no customer information and has no
            signup, billing, booking, consent, integration or message-sending controls.
          </p>
        </section>
      </div>
    </main>
  );
}
