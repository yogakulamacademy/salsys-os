import { BrandIdentity, BrandMark } from "@/components/brand";
import Link from 'next/link';
import {
  ArrowRight,
  BarChart3,
  Bot,
  CheckCircle2,
  FileSearch,
  LineChart,
  MessageSquareText,
  ShieldCheck,
  Sparkles,
  Target,
  UsersRound,
} from 'lucide-react';

const capabilities = [
  {
    icon: UsersRound,
    title: 'Sales workspace',
    description:
      'Capture leads, manage pipeline stages, follow-ups, admissions activity, and sales ownership in one tenant-scoped workspace.',
  },
  {
    icon: MessageSquareText,
    title: 'Conversation intelligence',
    description:
      'Bring customer conversations into the CRM so sales context, objections, intent, and follow-up activity stay connected.',
  },
  {
    icon: BarChart3,
    title: 'Marketing + attribution',
    description:
      'Connect campaign, analytics, traffic, lead, and conversion evidence without collapsing separate measurement systems into one claim.',
  },
  {
    icon: FileSearch,
    title: 'Organic growth intelligence',
    description:
      'Turn Search Console, crawl, content, AEO, GEO, and revenue signals into evidence-backed SEO opportunities and experiments.',
  },
  {
    icon: Target,
    title: 'Human-approved optimization',
    description:
      'Move recommendations through approval, controlled action, rollback, measurement, and audit instead of uncontrolled publishing.',
  },
  {
    icon: ShieldCheck,
    title: 'Tenant-safe by design',
    description:
      'Organization identity is resolved server-side from authenticated membership so customer data stays isolated by tenant.',
  },
];

const operatingLoop = [
  'Evidence',
  'Intelligence',
  'Recommendation',
  'Human decision',
  'Action',
  'Outcome',
  'Learning',
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[#f8fafc] text-slate-950">
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8 lg:px-10">
          <Link href="/" className="flex items-center gap-3" aria-label="SalsysOS home">
            <BrandMark /><BrandIdentity />
          </Link>

          <nav className="hidden items-center gap-7 text-sm font-semibold text-slate-600 md:flex">
            <a href="#product" className="transition hover:text-slate-950">
              Product
            </a>
            <a href="#how-it-works" className="transition hover:text-slate-950">
              How it works
            </a>
            <a href="#security" className="transition hover:text-slate-950">
              Security
            </a>
          </nav>

          <Link
            href="/login"
            className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:opacity-90"
          >
            Sign in
            <ArrowRight size={15} />
          </Link>
        </div>
      </header>

      <section className="relative overflow-hidden bg-white">
        <div className="absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-blue-50/70 to-transparent" />
        <div className="relative mx-auto grid max-w-7xl gap-12 px-5 py-20 sm:px-8 sm:py-24 lg:grid-cols-[1.1fr_0.9fr] lg:px-10 lg:py-28">
          <div className="flex flex-col justify-center">
            <div className="mb-6 inline-flex w-fit items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.14em] text-orange-700">
              <Sparkles size={14} />
              Evidence to action
            </div>

            <h1 className="max-w-4xl text-4xl font-black leading-[1.05] tracking-[-0.04em] text-slate-950 sm:text-5xl lg:text-6xl">
              Run sales, marketing, conversations, and growth intelligence in one operating system.
            </h1>

            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600 sm:text-xl">
              SalsysOS connects customer journeys, sales execution, marketing evidence,
              attribution, organic growth, experiments, and revenue signals so teams can
              make better decisions from the same operational truth.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/login"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand px-5 py-3.5 text-sm font-bold text-white shadow-card transition hover:-translate-y-0.5"
              >
                Open SalsysOS
                <ArrowRight size={16} />
              </Link>
              <a
                href="#product"
                className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-5 py-3.5 text-sm font-bold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              >
                Explore the product
              </a>
            </div>

            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-sm font-medium text-slate-500">
              <span className="inline-flex items-center gap-2">
                <CheckCircle2 size={16} className="text-emerald-600" />
                Tenant-scoped CRM
              </span>
              <span className="inline-flex items-center gap-2">
                <CheckCircle2 size={16} className="text-emerald-600" />
                Human approval for consequential actions
              </span>
              <span className="inline-flex items-center gap-2">
                <CheckCircle2 size={16} className="text-emerald-600" />
                Audit-first optimization
              </span>
            </div>
          </div>

          <div className="relative">
            <div className="absolute -inset-5 rounded-[2rem] bg-gradient-to-br from-blue-100/70 via-transparent to-orange-100/70 blur-2xl" />
            <div className="relative overflow-hidden rounded-[2rem] border border-slate-200 bg-slate-950 p-6 text-white shadow-2xl sm:p-8">
              <div className="flex items-center justify-between border-b border-white/10 pb-5">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                    Operating loop
                  </div>
                  <div className="mt-1 text-xl font-bold">From evidence to learning</div>
                </div>
                <div className="grid h-11 w-11 place-items-center rounded-2xl bg-white/10">
                  <LineChart size={21} />
                </div>
              </div>

              <div className="mt-6 space-y-3">
                {operatingLoop.map((item, index) => (
                  <div
                    key={item}
                    className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3.5"
                  >
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-white text-xs font-black text-slate-950">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <span className="font-semibold text-slate-100">{item}</span>
                    {index < operatingLoop.length - 1 && (
                      <ArrowRight size={14} className="ml-auto text-slate-500" />
                    )}
                  </div>
                ))}
              </div>

              <div className="mt-6 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4">
                <div className="flex items-start gap-3">
                  <Bot size={20} className="mt-0.5 text-emerald-300" />
                  <p className="text-sm leading-6 text-emerald-50/90">
                    AI supports the workflow, while observed facts, permissions, outcomes,
                    and human approval remain the control boundary.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="product" className="border-y border-slate-200 bg-[#f8fafc]">
        <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:px-10">
          <div className="max-w-3xl">
            <div className="text-xs font-black uppercase tracking-[0.2em] text-accent">
              Product
            </div>
            <h2 className="mt-3 text-3xl font-black tracking-[-0.03em] text-slate-950 sm:text-4xl">
              One workspace across the customer and growth journey.
            </h2>
            <p className="mt-4 text-lg leading-8 text-slate-600">
              SalsysOS is built to keep operational work and analytical evidence connected,
              instead of forcing teams to make decisions across disconnected tools and reports.
            </p>
          </div>

          <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {capabilities.map(({ icon: Icon, title, description }) => (
              <article
                key={title}
                className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-card"
              >
                <div className="grid h-11 w-11 place-items-center rounded-xl bg-slate-100 text-brand">
                  <Icon size={21} />
                </div>
                <h3 className="mt-5 text-lg font-bold text-slate-950">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="how-it-works" className="bg-white">
        <div className="mx-auto grid max-w-7xl gap-12 px-5 py-20 sm:px-8 lg:grid-cols-2 lg:px-10">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.2em] text-accent">
              How it works
            </div>
            <h2 className="mt-3 text-3xl font-black tracking-[-0.03em] text-slate-950 sm:text-4xl">
              Decisions grounded in evidence, not disconnected dashboards.
            </h2>
          </div>

          <div className="space-y-5 text-base leading-7 text-slate-600">
            <p>
              Marketing, conversations, CRM activity, conversion outcomes, and organic growth
              evidence remain separate where they should, while SalsysOS connects them through
              a common tenant-scoped operating model.
            </p>
            <p>
              Recommendations can become controlled experiments and approved optimization actions,
              with rollback, measurement, and audit history preserved instead of silently rewriting
              source evidence.
            </p>
          </div>
        </div>
      </section>

      <section id="security" className="bg-slate-950 text-white">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-20 sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:px-10">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.2em] text-orange-300">
              Security boundary
            </div>
            <h2 className="mt-3 text-3xl font-black tracking-[-0.03em] sm:text-4xl">
              The account determines the organization.
            </h2>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {[
              'Server-side tenant resolution',
              'No customer organization chooser',
              'Organization-scoped data access',
              'Human approval for high-impact optimization',
            ].map((item) => (
              <div
                key={item}
                className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4"
              >
                <ShieldCheck size={19} className="mt-0.5 shrink-0 text-emerald-300" />
                <span className="text-sm font-semibold leading-6 text-slate-100">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white">
        <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:px-10">
          <div className="rounded-[2rem] border border-slate-200 bg-gradient-to-br from-slate-950 to-brand px-6 py-12 text-center text-white shadow-xl sm:px-10">
            <h2 className="text-3xl font-black tracking-[-0.03em] sm:text-4xl">
              Already using SalsysOS?
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-slate-200">
              Sign in to your workspace. Your organization is resolved securely from your authenticated account.
            </p>
            <Link
              href="/login"
              className="mt-7 inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3.5 text-sm font-black text-slate-950 transition hover:bg-slate-100"
            >
              Sign in to SalsysOS
              <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-[#f8fafc]">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-5 py-8 text-sm text-slate-500 sm:px-8 md:flex-row md:items-center md:justify-between lg:px-10">
          <div className="font-semibold text-slate-700">SalsysOS</div>
          <div>Sales + Analysis Operating System</div>
        </div>
      </footer>
    </main>
  );
}
