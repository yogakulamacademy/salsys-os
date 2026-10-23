import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Bot,
  Building2,
  Check,
  CheckCircle2,
  Circle,
  Globe2,
  HeartPulse,
  MapPin,
  Megaphone,
  MessageCircleMore,
  SearchCheck,
  ShieldCheck,
  Sparkles,
  Target,
  Users,
  Workflow,
} from 'lucide-react';

import {
  saveOnboardingBusinessAction,
  saveOnboardingGoalsAction,
} from '@/app/onboarding/actions';
import { getSupabasePublicConfig, useMockData } from '@/lib/config';
import { createClient } from '@/lib/supabase/server';
import { getCurrentWorkspaceContext } from '@/lib/workspace';

type StepKey = 'business' | 'goals' | 'website' | 'channels' | 'team' | 'finish';

type OnboardingRow = {
  status: 'not_started' | 'in_progress' | 'completed' | 'dismissed';
  current_step: StepKey;
  industry: string | null;
  country_code: string | null;
  timezone: string | null;
  website_url: string | null;
  goals: string[] | null;
  completed_steps: string[] | null;
};

const steps: Array<{ key: StepKey; label: string; description: string }> = [
  { key: 'business', label: 'Business', description: 'Workspace profile' },
  { key: 'goals', label: 'Goals', description: 'What to improve' },
  { key: 'website', label: 'Website', description: 'Tracking setup' },
  { key: 'channels', label: 'Channels', description: 'Connect sources' },
  { key: 'team', label: 'Team', description: 'Invite people' },
  { key: 'finish', label: 'Finish', description: 'Readiness review' },
];

const industries = [
  ['wellness_education', 'Wellness & education'],
  ['real_estate', 'Real estate'],
  ['professional_services', 'Professional services'],
  ['ecommerce', 'E-commerce'],
  ['healthcare', 'Healthcare'],
  ['other', 'Other'],
] as const;

const countries = [
  ['IN', 'India'],
  ['AE', 'United Arab Emirates'],
  ['US', 'United States'],
  ['GB', 'United Kingdom'],
  ['AU', 'Australia'],
  ['SG', 'Singapore'],
  ['OTHER', 'Other'],
] as const;

const timezones = [
  ['Asia/Kolkata', 'India · Asia/Kolkata'],
  ['Asia/Dubai', 'UAE · Asia/Dubai'],
  ['Europe/London', 'United Kingdom · Europe/London'],
  ['America/New_York', 'US East · America/New_York'],
  ['America/Los_Angeles', 'US West · America/Los_Angeles'],
  ['Australia/Sydney', 'Australia · Australia/Sydney'],
  ['Asia/Singapore', 'Singapore · Asia/Singapore'],
  ['UTC', 'UTC'],
] as const;

const goalOptions = [
  {
    value: 'lead_management',
    title: 'Manage leads better',
    detail: 'Capture, qualify, assign and follow up without losing context.',
    icon: Target,
  },
  {
    value: 'attribution',
    title: 'Understand attribution',
    detail: 'See which campaigns and touchpoints actually influence revenue.',
    icon: BarChart3,
  },
  {
    value: 'whatsapp',
    title: 'Improve WhatsApp operations',
    detail: 'Connect conversations, templates, follow-ups and team ownership.',
    icon: MessageCircleMore,
  },
  {
    value: 'automation',
    title: 'Automate repetitive work',
    detail: 'Use Smart Triggers and Flow Builder with controlled activation.',
    icon: Workflow,
  },
  {
    value: 'seo',
    title: 'Grow organic visibility',
    detail: 'Track search performance, content opportunities and answer visibility.',
    icon: SearchCheck,
  },
  {
    value: 'revenue',
    title: 'Connect marketing to revenue',
    detail: 'Understand pipeline, enrollment, payment and commercial outcomes.',
    icon: Megaphone,
  },
  {
    value: 'team_performance',
    title: 'Improve team performance',
    detail: 'Give managers clearer ownership, workload and response visibility.',
    icon: Users,
  },
  {
    value: 'customer_journey',
    title: 'Understand the customer journey',
    detail: 'Connect anonymous visits, leads, conversations and conversions.',
    icon: Sparkles,
  },
] as const;

function safeStep(value: string | undefined): StepKey {
  return steps.some((step) => step.key === value) ? (value as StepKey) : 'business';
}

function stepNumber(step: StepKey) {
  return steps.findIndex((candidate) => candidate.key === step) + 1;
}

function OnboardingRail({
  activeStep,
  completedSteps,
  organizationName,
}: {
  activeStep: StepKey;
  completedSteps: Set<string>;
  organizationName: string;
}) {
  return (
    <aside className="border-b border-[#dfe9e2] bg-[#123f33] px-5 py-5 text-white lg:min-h-screen lg:w-[300px] lg:border-b-0 lg:border-r lg:px-7 lg:py-8">
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-white text-[11px] font-black tracking-[-0.03em] text-[#174d3d]">
          SO
        </div>
        <div>
          <div className="text-sm font-bold">SalsysOS</div>
          <div className="text-[10px] uppercase tracking-[0.16em] text-[#9ec7b7]">Workspace setup</div>
        </div>
      </div>

      <div className="mt-7 rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#9ec7b7]">Setting up</div>
        <div className="mt-1 truncate text-sm font-bold">{organizationName}</div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-[#8de0b7] transition-all"
            style={{ width: `${Math.max(8, (completedSteps.size / steps.length) * 100)}%` }}
          />
        </div>
        <div className="mt-2 text-[10.5px] text-[#b7d6ca]">
          {completedSteps.size} of {steps.length} setup steps complete
        </div>
      </div>

      <nav className="mt-5 hidden space-y-1 lg:block" aria-label="Onboarding progress">
        {steps.map((step, index) => {
          const completed = completedSteps.has(step.key);
          const active = activeStep === step.key;
          return (
            <div
              key={step.key}
              className={`flex items-center gap-3 rounded-xl px-3 py-3 ${
                active ? 'bg-white text-[#153e32]' : 'text-[#c3dcd2]'
              }`}
            >
              <div
                className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg border text-[10px] font-bold ${
                  completed
                    ? 'border-[#78d7ab] bg-[#78d7ab] text-[#113f31]'
                    : active
                      ? 'border-[#b7d9c9] bg-[#edf7f1] text-[#23654f]'
                      : 'border-white/15 bg-white/5 text-[#a8c8bc]'
                }`}
              >
                {completed ? <Check size={13} /> : index + 1}
              </div>
              <div className="min-w-0">
                <div className="text-[11.5px] font-bold">{step.label}</div>
                <div className={`text-[10px] ${active ? 'text-[#6d8278]' : 'text-[#83aa9b]'}`}>
                  {step.description}
                </div>
              </div>
            </div>
          );
        })}
      </nav>

      <div className="mt-5 flex items-center justify-between gap-3 lg:hidden">
        <div>
          <div className="text-[10px] uppercase tracking-[0.12em] text-[#9ec7b7]">
            Step {stepNumber(activeStep)} of {steps.length}
          </div>
          <div className="mt-1 text-sm font-bold">{steps[stepNumber(activeStep) - 1].label}</div>
        </div>
        <div className="text-[11px] text-[#b7d6ca]">{completedSteps.size} complete</div>
      </div>

      <div className="mt-8 hidden rounded-xl border border-white/10 bg-white/5 p-4 lg:block">
        <div className="flex gap-2 text-[11px] font-bold text-[#d9ebe4]">
          <ShieldCheck size={15} className="text-[#85d7ae]" />
          Tenant-safe setup
        </div>
        <p className="mt-2 text-[10.5px] leading-5 text-[#9fc1b4]">
          Setup is saved only to this organization. Existing workspaces and other tenants are never used as defaults.
        </p>
      </div>
    </aside>
  );
}

function BusinessStep({
  organizationName,
  row,
}: {
  organizationName: string;
  row: OnboardingRow | null;
}) {
  return (
    <form action={saveOnboardingBusinessAction} className="mx-auto w-full max-w-[760px]">
      <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#779184]">Step 1 · Business profile</div>
      <h1 className="mt-2 text-[30px] font-bold tracking-[-0.04em] text-[#153e32] sm:text-[36px]">
        Tell us about your business.
      </h1>
      <p className="mt-3 max-w-2xl text-[13px] leading-6 text-[#657b70]">
        This gives SalsysOS the right workspace context. You can change these details later without affecting your CRM data.
      </p>

      <div className="mt-7 rounded-2xl border border-[#dce7df] bg-white p-5 shadow-[0_8px_30px_rgba(25,66,51,0.055)] sm:p-6">
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="sm:col-span-2">
            <span className="mb-1.5 block text-[11.5px] font-bold text-[#365647]">Business name *</span>
            <div className="relative">
              <Building2 size={16} className="absolute left-3 top-3 text-[#82978c]" />
              <input
                name="business_name"
                required
                maxLength={180}
                defaultValue={organizationName}
                className="h-10 w-full rounded-lg border border-[#d8e4dc] bg-white pl-10 pr-3 text-xs text-[#183f33] outline-none focus:border-[#7bb99b] focus:ring-2 focus:ring-[#dff3e7]"
              />
            </div>
          </label>

          <label>
            <span className="mb-1.5 block text-[11.5px] font-bold text-[#365647]">Industry *</span>
            <select
              name="industry"
              required
              defaultValue={row?.industry ?? 'wellness_education'}
              className="h-10 w-full rounded-lg border border-[#d8e4dc] bg-white px-3 text-xs text-[#183f33] outline-none focus:border-[#7bb99b]"
            >
              {industries.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>

          <label>
            <span className="mb-1.5 block text-[11.5px] font-bold text-[#365647]">Country *</span>
            <select
              name="country_code"
              required
              defaultValue={row?.country_code ?? 'IN'}
              className="h-10 w-full rounded-lg border border-[#d8e4dc] bg-white px-3 text-xs text-[#183f33] outline-none focus:border-[#7bb99b]"
            >
              {countries.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>

          <label>
            <span className="mb-1.5 block text-[11.5px] font-bold text-[#365647]">Timezone *</span>
            <select
              name="timezone"
              required
              defaultValue={row?.timezone ?? 'Asia/Kolkata'}
              className="h-10 w-full rounded-lg border border-[#d8e4dc] bg-white px-3 text-xs text-[#183f33] outline-none focus:border-[#7bb99b]"
            >
              {timezones.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>

          <label>
            <span className="mb-1.5 block text-[11.5px] font-bold text-[#365647]">Website <span className="font-normal text-[#84968d]">optional for now</span></span>
            <div className="relative">
              <Globe2 size={16} className="absolute left-3 top-3 text-[#82978c]" />
              <input
                name="website_url"
                type="text"
                maxLength={240}
                placeholder="https://example.com"
                defaultValue={row?.website_url ?? ''}
                className="h-10 w-full rounded-lg border border-[#d8e4dc] bg-white pl-10 pr-3 text-xs text-[#183f33] outline-none focus:border-[#7bb99b] focus:ring-2 focus:ring-[#dff3e7]"
              />
            </div>
          </label>
        </div>

        <div className="mt-5 flex items-start gap-2 rounded-xl border border-[#d8ece0] bg-[#f2faf5] p-3 text-[11px] leading-5 text-[#587466]">
          <MapPin size={15} className="mt-0.5 shrink-0 text-[#3e8a67]" />
          Country and timezone help SalsysOS interpret reporting windows, follow-up timing and operational schedules consistently.
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between gap-3">
        <Link href="/dashboard" className="text-[11.5px] font-bold text-[#768b80]">Exit setup</Link>
        <button type="submit" className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#1f654e] px-4 text-xs font-bold text-white shadow-sm hover:bg-[#185640]">
          Save & continue <ArrowRight size={14} />
        </button>
      </div>
    </form>
  );
}

function GoalsStep({ row }: { row: OnboardingRow | null }) {
  const selected = new Set(row?.goals ?? []);

  return (
    <form action={saveOnboardingGoalsAction} className="mx-auto w-full max-w-[860px]">
      <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#779184]">Step 2 · Priorities</div>
      <h1 className="mt-2 text-[30px] font-bold tracking-[-0.04em] text-[#153e32] sm:text-[36px]">
        What do you want SalsysOS to improve?
      </h1>
      <p className="mt-3 max-w-2xl text-[13px] leading-6 text-[#657b70]">
        Choose the outcomes that matter most. We’ll use these choices to prioritize setup—not to hide product areas from you.
      </p>

      <div className="mt-7 grid gap-3 sm:grid-cols-2">
        {goalOptions.map(({ value, title, detail, icon: Icon }) => (
          <label key={value} className="group relative cursor-pointer">
            <input
              type="checkbox"
              name="goals"
              value={value}
              defaultChecked={selected.has(value)}
              className="peer sr-only"
            />
            <div className="h-full rounded-2xl border border-[#dce7df] bg-white p-4 shadow-[0_3px_12px_rgba(25,66,51,0.035)] transition peer-checked:border-[#73bb97] peer-checked:bg-[#f2faf5] peer-focus-visible:ring-2 peer-focus-visible:ring-[#8dcaaa]">
              <div className="flex items-start gap-3">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#eef7f2] text-[#286c53] peer-checked:bg-[#dff3e7]">
                  <Icon size={17} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="text-[12.5px] font-bold text-[#183f33]">{title}</h2>
                    <span className="grid h-5 w-5 shrink-0 place-items-center rounded-md border border-[#cfddd4] bg-white text-transparent peer-checked:border-[#2e8762] peer-checked:bg-[#2e8762] peer-checked:text-white">
                      <Check size={12} />
                    </span>
                  </div>
                  <p className="mt-1.5 text-[10.8px] leading-5 text-[#72877c]">{detail}</p>
                </div>
              </div>
            </div>
          </label>
        ))}
      </div>

      <div className="mt-5 rounded-xl border border-[#e6e7cf] bg-[#fffdf2] p-3 text-[11px] leading-5 text-[#746c43]">
        <strong>Nothing is activated from this screen.</strong> Messaging, publishing, budget changes and automations keep their existing review and approval controls.
      </div>

      <div className="mt-5 flex items-center justify-between gap-3">
        <Link href="/onboarding?step=business" className="inline-flex items-center gap-1 text-[11.5px] font-bold text-[#657c70]"><ArrowLeft size={13} /> Back</Link>
        <button type="submit" className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#1f654e] px-4 text-xs font-bold text-white shadow-sm hover:bg-[#185640]">
          Save priorities <ArrowRight size={14} />
        </button>
      </div>
    </form>
  );
}

function NextPhaseStep({ step }: { step: StepKey }) {
  const content: Record<Exclude<StepKey, 'business' | 'goals'>, { eyebrow: string; title: string; description: string; href: string; cta: string; icon: typeof Globe2 }> = {
    website: {
      eyebrow: 'Step 3 · Website',
      title: 'Connect your website to SalsysOS.',
      description: 'The next onboarding milestone will embed the existing Universal Tracking source installer here and verify the connection from real observed events.',
      href: '/tracking/sources',
      cta: 'Open tracking sources',
      icon: Globe2,
    },
    channels: {
      eyebrow: 'Step 4 · Channels',
      title: 'Connect the channels your team actually uses.',
      description: 'This step will orchestrate the existing WhatsApp, Instagram, Google and Meta integration flows without duplicating their provider-specific onboarding.',
      href: '/settings/integrations',
      cta: 'Open integrations',
      icon: MessageCircleMore,
    },
    team: {
      eyebrow: 'Step 5 · Team',
      title: 'Bring the right people into the workspace.',
      description: 'Team onboarding will use the existing organization membership and role controls so every invitation remains tenant-scoped and permission-aware.',
      href: '/settings/team',
      cta: 'Open team settings',
      icon: Users,
    },
    finish: {
      eyebrow: 'Step 6 · Finish',
      title: 'Turn setup progress into a readiness check.',
      description: 'The final step will calculate completion from real system evidence—tracking health, connected channels, team state and first automation—not from button clicks.',
      href: '/dashboard',
      cta: 'Return to dashboard',
      icon: CheckCircle2,
    },
  };

  const item = content[step as Exclude<StepKey, 'business' | 'goals'>];
  const Icon = item.icon;

  return (
    <div className="mx-auto w-full max-w-[720px]">
      <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#779184]">{item.eyebrow}</div>
      <h1 className="mt-2 text-[30px] font-bold tracking-[-0.04em] text-[#153e32] sm:text-[36px]">{item.title}</h1>
      <p className="mt-3 max-w-2xl text-[13px] leading-6 text-[#657b70]">{item.description}</p>

      <div className="mt-7 rounded-2xl border border-[#dce7df] bg-white p-6 shadow-[0_8px_30px_rgba(25,66,51,0.055)]">
        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#eef8f2] text-[#236b50]"><Icon size={22} /></div>
        <h2 className="mt-4 text-base font-bold text-[#183f33]">Foundation ready; integration wiring comes next.</h2>
        <p className="mt-2 text-[11.5px] leading-6 text-[#6b8175]">
          We’re intentionally not marking this step complete until it can be verified from real product state. You can use the existing production screen now while onboarding integration is added in the next milestone.
        </p>
        <Link href={item.href} className="mt-5 inline-flex h-9 items-center gap-2 rounded-lg border border-[#cfe1d6] bg-[#f7fbf8] px-3 text-[11.5px] font-bold text-[#276b51]">
          {item.cta} <ArrowRight size={13} />
        </Link>
      </div>

      <div className="mt-5">
        <Link href="/onboarding?step=goals" className="inline-flex items-center gap-1 text-[11.5px] font-bold text-[#657c70]"><ArrowLeft size={13} /> Back to priorities</Link>
      </div>
    </div>
  );
}

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string; error?: string }>;
}) {
  const query = await searchParams;
  const requestedStep = query.step ? safeStep(query.step) : null;
  const { configured } = getSupabasePublicConfig();

  if (useMockData || !configured) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f4f7f5] p-6">
        <div className="max-w-lg rounded-2xl border border-amber-200 bg-white p-6 text-sm text-amber-900 shadow-sm">
          <strong>Onboarding requires a live workspace.</strong>
          <p className="mt-2 text-xs leading-5">Mock mode does not create tenant onboarding records.</p>
          <Link href="/dashboard" className="mt-4 inline-flex font-bold text-[#23654f]">Return to dashboard →</Link>
        </div>
      </main>
    );
  }

  const supabase = await createClient();
  const workspace = await getCurrentWorkspaceContext(supabase);
  const organizationId = workspace.activeOrganizationId;
  const organizationName = workspace.activeWorkspace?.organizationName || 'Your workspace';

  if (!organizationId) redirect('/dashboard');

  const [{ data: canManage }, { data: onboardingRow, error: onboardingError }] = await Promise.all([
    supabase.rpc('can_manage_organization', { p_organization_id: organizationId }),
    supabase
      .from('organization_onboarding')
      .select('status,current_step,industry,country_code,timezone,website_url,goals,completed_steps')
      .eq('organization_id', organizationId)
      .maybeSingle(),
  ]);

  if (!canManage) redirect('/dashboard');

  if (onboardingError) {
    throw new Error(`Unable to load onboarding progress: ${onboardingError.message}`);
  }

  const row = (onboardingRow ?? null) as OnboardingRow | null;
  const completedSteps = new Set((row?.completed_steps ?? []).map(String));

  if (row?.status === 'completed') {
    redirect('/onboarding/finish?completed=1');
  }

  let activeStep: StepKey = requestedStep ?? row?.current_step ?? 'business';
  if (activeStep !== 'business' && !completedSteps.has('business')) activeStep = 'business';
  if (!['business', 'goals'].includes(activeStep) && !completedSteps.has('goals')) activeStep = 'goals';

  if (activeStep === 'website') redirect('/onboarding/website');
  if (activeStep === 'channels') redirect('/onboarding/channels');
  if (activeStep === 'team') redirect('/onboarding/team');
  if (activeStep === 'finish') redirect('/onboarding/finish');

  return (
    <main className="min-h-screen bg-[#f5f8f6] text-[#173d32] lg:flex">
      <OnboardingRail
        activeStep={activeStep}
        completedSteps={completedSteps}
        organizationName={organizationName}
      />

      <section className="min-w-0 flex-1">
        <div className="border-b border-[#e2ebe5] bg-white/80 px-5 py-3 backdrop-blur sm:px-8">
          <div className="mx-auto flex max-w-[1080px] items-center justify-between gap-4">
            <div className="text-[10.5px] font-bold text-[#72877c]">Workspace onboarding</div>
            <div className="flex items-center gap-2 text-[10.5px] text-[#82958b]">
              <HeartPulse size={13} className="text-[#3c8b68]" /> Progress saves as you continue
            </div>
          </div>
        </div>

        <div className="px-5 py-8 sm:px-8 sm:py-10 lg:px-10 lg:py-12">
          {query.error ? (
            <div className="mx-auto mb-5 max-w-[860px] rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-medium text-rose-800">
              {query.error}
            </div>
          ) : null}

          {activeStep === 'business' ? (
            <BusinessStep organizationName={organizationName} row={row} />
          ) : (
            <GoalsStep row={row} />
          )}
        </div>
      </section>
    </main>
  );
}
