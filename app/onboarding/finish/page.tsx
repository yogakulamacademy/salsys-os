import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  CircleAlert,
  Globe2,
  HeartPulse,
  MessageCircleMore,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react';

import { completeOnboardingAction } from '@/app/onboarding/actions';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { getTrackingPlatformWorkspace } from '@/lib/tracking-platform-data';
import { getCurrentWorkspaceContext } from '@/lib/workspace';

const steps = [
  ['business', 'Business', 'Workspace profile'],
  ['goals', 'Goals', 'What to improve'],
  ['website', 'Website', 'Tracking setup'],
  ['channels', 'Channels', 'Connect sources'],
  ['team', 'Team', 'Invite people'],
  ['finish', 'Finish', 'Readiness review'],
] as const;

function Rail({
  organizationName,
  completedSteps,
}: {
  organizationName: string;
  completedSteps: Set<string>;
}) {
  return (
    <aside className="border-b border-[#dfe9e2] bg-[#123f33] px-5 py-5 text-white lg:min-h-screen lg:w-[300px] lg:border-b-0 lg:border-r lg:px-7 lg:py-8">
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-white text-[11px] font-black tracking-[-0.03em] text-[#174d3d]">SO</div>
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
            className="h-full rounded-full bg-[#8de0b7]"
            style={{ width: `${Math.max(8, (completedSteps.size / 6) * 100)}%` }}
          />
        </div>
        <div className="mt-2 text-[10.5px] text-[#b7d6ca]">
          {completedSteps.size} of 6 setup steps complete
        </div>
      </div>

      <nav className="mt-5 hidden space-y-1 lg:block" aria-label="Onboarding progress">
        {steps.map(([key, label, description], index) => {
          const complete = completedSteps.has(key);
          const active = key === 'finish';
          return (
            <div
              key={key}
              className={`flex items-center gap-3 rounded-xl px-3 py-3 ${active ? 'bg-white text-[#153e32]' : 'text-[#c3dcd2]'}`}
            >
              <div
                className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg border text-[10px] font-bold ${
                  complete
                    ? 'border-[#78d7ab] bg-[#78d7ab] text-[#113f31]'
                    : active
                      ? 'border-[#b7d9c9] bg-[#edf7f1] text-[#23654f]'
                      : 'border-white/15 bg-white/5 text-[#a8c8bc]'
                }`}
              >
                {complete ? <Check size={13} /> : index + 1}
              </div>
              <div>
                <div className="text-[11.5px] font-bold">{label}</div>
                <div className={`text-[10px] ${active ? 'text-[#6d8278]' : 'text-[#83aa9b]'}`}>
                  {description}
                </div>
              </div>
            </div>
          );
        })}
      </nav>

      <div className="mt-5 flex items-center justify-between lg:hidden">
        <div>
          <div className="text-[10px] uppercase tracking-[0.12em] text-[#9ec7b7]">Step 6 of 6</div>
          <div className="mt-1 text-sm font-bold">Finish</div>
        </div>
        <div className="text-[11px] text-[#b7d6ca]">{completedSteps.size} complete</div>
      </div>

      <div className="mt-8 hidden rounded-xl border border-white/10 bg-white/5 p-4 lg:block">
        <div className="flex gap-2 text-[11px] font-bold text-[#d9ebe4]">
          <ShieldCheck size={15} className="text-[#85d7ae]" /> Evidence-based completion
        </div>
        <p className="mt-2 text-[10.5px] leading-5 text-[#9fc1b4]">
          Final completion re-checks required setup against live tenant state. Optional channels and team gaps remain visible after onboarding.
        </p>
      </div>
    </aside>
  );
}

function ReadinessCard({
  icon,
  title,
  status,
  detail,
  ready,
  required,
  href,
}: {
  icon: React.ReactNode;
  title: string;
  status: string;
  detail: string;
  ready: boolean;
  required: boolean;
  href: string;
}) {
  return (
    <article className={`rounded-2xl border bg-white p-5 shadow-[0_3px_14px_rgba(25,66,51,0.035)] ${ready ? 'border-[#cfe6d8]' : required ? 'border-[#edc8c8]' : 'border-[#e4dfc6]'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#eef7f2] text-[#286c53]">{icon}</div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-bold text-[#183f33]">{title}</h2>
              <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${required ? 'bg-[#eef7f2] text-[#2d6e54]' : 'bg-[#f5f2e7] text-[#7c7043]'}`}>
                {required ? 'Required' : 'Optional'}
              </span>
            </div>
            <p className="mt-1 text-[10.8px] leading-5 text-[#72877c]">{detail}</p>
          </div>
        </div>
        {ready ? <CheckCircle2 size={18} className="shrink-0 text-[#2d9b69]" /> : <CircleAlert size={18} className={`shrink-0 ${required ? 'text-rose-500' : 'text-amber-500'}`} />}
      </div>
      <div className={`mt-4 rounded-xl border px-3 py-2 text-[10.8px] font-bold ${ready ? 'border-emerald-100 bg-emerald-50 text-emerald-700' : required ? 'border-rose-100 bg-rose-50 text-rose-700' : 'border-amber-100 bg-amber-50 text-amber-700'}`}>
        {status}
      </div>
      {!ready ? (
        <Link href={href} className="mt-3 inline-flex items-center gap-1 text-[10.8px] font-bold text-[#2e7257]">
          Review setup <ArrowRight size={12} />
        </Link>
      ) : null}
    </article>
  );
}

export default async function OnboardingFinishPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; completed?: string }>;
}) {
  const query = await searchParams;
  const supabase = await createClient();
  const workspace = await getCurrentWorkspaceContext(supabase);
  const organizationId = workspace.activeOrganizationId;
  const organizationName = workspace.activeWorkspace?.organizationName || 'Your workspace';

  if (!organizationId) redirect('/dashboard');

  const [{ data: canManage }, { data: onboarding, error: onboardingError }, tracking] = await Promise.all([
    supabase.rpc('can_manage_organization', { p_organization_id: organizationId }),
    supabase
      .from('organization_onboarding')
      .select('status,completed_steps,goals,website_url,completed_at')
      .eq('organization_id', organizationId)
      .maybeSingle(),
    getTrackingPlatformWorkspace(),
  ]);

  if (!canManage) redirect('/dashboard');
  if (onboardingError || !onboarding) redirect('/onboarding?step=business');

  const completedSteps = new Set(
    Array.isArray(onboarding.completed_steps)
      ? onboarding.completed_steps.map(String)
      : [],
  );

  if (!completedSteps.has('business')) redirect('/onboarding?step=business');
  if (!completedSteps.has('goals')) redirect('/onboarding?step=goals');

  const admin = createAdminClient();
  const [connectionsResult, employeeMembershipsResult] = await Promise.all([
    admin
      .from('integration_connections')
      .select('id,provider,status')
      .eq('organization_id', organizationId)
      .eq('status', 'connected'),
    admin
      .from('organization_members')
      .select('user_id,role,active')
      .eq('organization_id', organizationId)
      .eq('role', 'admissions')
      .eq('active', true),
  ]);

  if (connectionsResult.error) {
    throw new Error(`Unable to load channel readiness: ${connectionsResult.error.message}`);
  }
  if (employeeMembershipsResult.error) {
    throw new Error(`Unable to load team readiness: ${employeeMembershipsResult.error.message}`);
  }

  const employeeIds = (employeeMembershipsResult.data ?? []).map((membership) => membership.user_id);
  let activeEmployeeCount = 0;
  if (employeeIds.length > 0) {
    const { data: profiles, error: profileError } = await admin
      .from('profiles')
      .select('id,active')
      .in('id', employeeIds)
      .eq('active', true);

    if (profileError) {
      throw new Error(`Unable to load active team profiles: ${profileError.message}`);
    }
    activeEmployeeCount = profiles?.length ?? 0;
  }

  const healthyWebsite =
    tracking.organizationId === organizationId &&
    tracking.sources.some(
      (source) => source.sourceType === 'website' && source.healthStatus === 'healthy',
    );
  const businessReady = completedSteps.has('business');
  const goalsReady = completedSteps.has('goals');
  const channelsReady = (connectionsResult.data?.length ?? 0) > 0;
  const teamReady = activeEmployeeCount > 0;
  const coreReady = businessReady && goalsReady && healthyWebsite;
  const onboardingCompleted = onboarding.status === 'completed';

  const cards = [
    {
      title: 'Business profile',
      status: businessReady ? 'Business context saved' : 'Business profile incomplete',
      detail: 'Organization name, industry, country and timezone are saved for this tenant.',
      ready: businessReady,
      required: true,
      href: '/onboarding?step=business',
      icon: <Sparkles size={18} />,
    },
    {
      title: 'Goals',
      status: goalsReady ? `${Array.isArray(onboarding.goals) ? onboarding.goals.length : 0} priorities selected` : 'No priorities selected',
      detail: 'Selected goals guide onboarding recommendations without activating features automatically.',
      ready: goalsReady,
      required: true,
      href: '/onboarding?step=goals',
      icon: <CheckCircle2 size={18} />,
    },
    {
      title: 'Website tracking',
      status: healthyWebsite ? 'Healthy browser source observed' : 'Healthy website tracking required',
      detail: 'A real browser source must be healthy now; a saved website URL alone is not enough.',
      ready: healthyWebsite,
      required: true,
      href: '/onboarding/website',
      icon: <Globe2 size={18} />,
    },
    {
      title: 'Connected channels',
      status: channelsReady ? `${connectionsResult.data?.length ?? 0} provider connection(s) active` : 'No provider connected yet',
      detail: 'Google, Meta, Instagram or WhatsApp can be connected now or after onboarding.',
      ready: channelsReady,
      required: false,
      href: '/onboarding/channels',
      icon: <MessageCircleMore size={18} />,
    },
    {
      title: 'Team access',
      status: teamReady ? `${activeEmployeeCount} active employee(s)` : 'Solo operator for now',
      detail: 'Team setup is optional. Employee access remains tenant-scoped through the existing Team & Access system.',
      ready: teamReady,
      required: false,
      href: '/onboarding/team',
      icon: <Users size={18} />,
    },
  ];

  return (
    <main className="min-h-screen bg-[#f5f8f6] text-[#173d32] lg:flex">
      <Rail organizationName={organizationName} completedSteps={completedSteps} />

      <section className="min-w-0 flex-1">
        <div className="border-b border-[#e2ebe5] bg-white/80 px-5 py-3 backdrop-blur sm:px-8">
          <div className="mx-auto flex max-w-[1080px] items-center justify-between gap-4">
            <div className="text-[10.5px] font-bold text-[#72877c]">Workspace onboarding</div>
            <div className="flex items-center gap-2 text-[10.5px] text-[#82958b]">
              <HeartPulse size={13} className="text-[#3c8b68]" /> Live readiness review
            </div>
          </div>
        </div>

        <div className="px-5 py-8 sm:px-8 sm:py-10 lg:px-10 lg:py-12">
          <div className="mx-auto w-full max-w-[940px]">
            {query.error ? (
              <div className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-medium leading-5 text-rose-800">
                {query.error}
              </div>
            ) : null}

            {query.completed === '1' || onboardingCompleted ? (
              <div className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
                <div className="flex items-start gap-3">
                  <CheckCircle2 size={22} className="mt-0.5 shrink-0 text-emerald-700" />
                  <div>
                    <div className="text-sm font-bold text-emerald-900">Workspace onboarding is complete.</div>
                    <p className="mt-1 text-[11px] leading-5 text-emerald-800">
                      Core setup is verified. Optional channel and team gaps can still be completed from Settings without reopening onboarding.
                    </p>
                    <Link href="/dashboard" className="mt-3 inline-flex h-9 items-center gap-2 rounded-lg bg-[#1f654e] px-3 text-[11px] font-bold text-white">
                      Open SalsysOS <ArrowRight size={13} />
                    </Link>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#779184]">Step 6 · Finish</div>
            <h1 className="mt-2 text-[30px] font-bold tracking-[-0.04em] text-[#153e32] sm:text-[36px]">
              Review workspace readiness.
            </h1>
            <p className="mt-3 max-w-2xl text-[13px] leading-6 text-[#657b70]">
              Required items are checked against live tenant state. Channels and team access are recommended but do not block a solo workspace from finishing onboarding.
            </p>

            <div className={`mt-6 rounded-2xl border p-5 ${coreReady ? 'border-emerald-200 bg-emerald-50' : 'border-rose-200 bg-rose-50'}`}>
              <div className="flex items-start gap-3">
                {coreReady ? <ShieldCheck size={21} className="mt-0.5 shrink-0 text-emerald-700" /> : <CircleAlert size={21} className="mt-0.5 shrink-0 text-rose-600" />}
                <div>
                  <div className={`text-sm font-bold ${coreReady ? 'text-emerald-900' : 'text-rose-900'}`}>
                    {coreReady ? 'Core workspace is ready' : 'Required setup still needs attention'}
                  </div>
                  <p className={`mt-1 text-[11px] leading-5 ${coreReady ? 'text-emerald-800' : 'text-rose-800'}`}>
                    {coreReady
                      ? 'Business context, goals and healthy website tracking are verified. You can complete onboarding now.'
                      : 'Finish all required items below before SalsysOS can mark onboarding complete.'}
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {cards.map((card) => (
                <ReadinessCard key={card.title} {...card} />
              ))}
            </div>

            <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Link href="/onboarding/team" className="inline-flex items-center gap-1 text-[11.5px] font-bold text-[#657c70]">
                <ArrowLeft size={13} /> Back to team
              </Link>

              {!onboardingCompleted ? (
                <form action={completeOnboardingAction}>
                  <button
                    type="submit"
                    disabled={!coreReady}
                    className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#1f654e] px-4 text-xs font-bold text-white shadow-sm enabled:hover:bg-[#185640] disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    Complete onboarding <CheckCircle2 size={14} />
                  </button>
                </form>
              ) : (
                <Link href="/dashboard" className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#1f654e] px-4 text-xs font-bold text-white shadow-sm">
                  Open dashboard <ArrowRight size={14} />
                </Link>
              )}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
