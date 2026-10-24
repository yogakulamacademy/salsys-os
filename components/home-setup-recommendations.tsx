import Link from 'next/link';
import {
  ArrowRight,
  CheckCircle2,
  Globe2,
  MessageCircleMore,
  Sparkles,
  Users,
  Workflow,
} from 'lucide-react';

import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { getTrackingPlatformWorkspace } from '@/lib/tracking-platform-data';
import { getCurrentWorkspaceContext } from '@/lib/workspace';

type Recommendation = {
  key: string;
  title: string;
  detail: string;
  href: string;
  cta: string;
  pendingLabel: string;
  icon: typeof Globe2;
  ready: boolean | null;
};

export async function HomeSetupRecommendations() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('role,active')
    .eq('id', user.id)
    .maybeSingle();

  if (
    !profile ||
    profile.active !== true ||
    !['owner', 'admin', 'manager'].includes(String(profile.role))
  ) {
    return null;
  }

  const workspace = await getCurrentWorkspaceContext(supabase);
  const organizationId = workspace.activeOrganizationId;
  if (!organizationId) return null;

  const { data: onboarding } = await supabase
    .from('organization_onboarding')
    .select('status')
    .eq('organization_id', organizationId)
    .maybeSingle();

  // This activation layer is only for customers that have actually
  // completed the new onboarding flow. Legacy tenants remain untouched.
  if (onboarding?.status !== 'completed') return null;

  const admin = createAdminClient();

  const [connectionsResult, membershipsResult, workflowsResult] = await Promise.all([
    admin
      .from('integration_connections')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('status', 'connected'),
    admin
      .from('organization_members')
      .select('user_id')
      .eq('organization_id', organizationId)
      .eq('role', 'admissions')
      .eq('active', true),
    admin
      .from('automation_workflows')
      .select('id,status')
      .eq('organization_id', organizationId)
      .neq('status', 'archived')
      .limit(1),
  ]);

  let websiteReady: boolean | null = null;
  try {
    const tracking = await getTrackingPlatformWorkspace();
    websiteReady =
      tracking.organizationId === organizationId &&
      tracking.sources.some(
        (source) => source.sourceType === 'website' && source.healthStatus === 'healthy',
      );
  } catch {
    websiteReady = null;
  }

  const channelsReady = connectionsResult.error
    ? null
    : (connectionsResult.data?.length ?? 0) > 0;

  let teamReady: boolean | null = null;
  if (!membershipsResult.error) {
    const employeeIds = (membershipsResult.data ?? []).map((membership) => membership.user_id);
    if (employeeIds.length === 0) {
      teamReady = false;
    } else {
      const { data: activeProfiles, error: profileError } = await admin
        .from('profiles')
        .select('id')
        .in('id', employeeIds)
        .eq('active', true)
        .limit(1);
      teamReady = profileError ? null : (activeProfiles?.length ?? 0) > 0;
    }
  }

  const automationReady = workflowsResult.error
    ? null
    : (workflowsResult.data?.length ?? 0) > 0;

  const recommendations: Recommendation[] = [
    {
      key: 'website',
      title: 'Track where leads come from',
      detail: 'Verify website tracking to understand where enquiries originate.',
      href: '/tracking/sources',
      cta: 'Connect website',
      pendingLabel: 'Not connected',
      icon: Globe2,
      ready: websiteReady,
    },
    {
      key: 'channels',
      title: 'Connect your conversations',
      detail: 'Link WhatsApp or Instagram messages to CRM leads.',
      href: '/settings/integrations',
      cta: 'Connect a channel',
      pendingLabel: 'Not connected',
      icon: MessageCircleMore,
      ready: channelsReady,
    },
    {
      key: 'team',
      title: 'Give every lead an owner',
      detail: 'Invite teammates to manage enquiries and follow-ups.',
      href: '/settings/team',
      cta: 'Invite teammate',
      pendingLabel: 'Not invited',
      icon: Users,
      ready: teamReady,
    },
    {
      key: 'automation',
      title: 'Automate your first follow-up',
      detail: 'Create an internal workflow draft and test before activation.',
      href: '/automation/recipes',
      cta: 'Create automation',
      pendingLabel: 'Not created',
      icon: Workflow,
      ready: automationReady,
    },
  ];

  const completeCount = recommendations.filter((item) => item.ready === true).length;
  if (completeCount === recommendations.length) return null;

  const remainingCount = recommendations.length - completeCount;
  const startKey =
    recommendations.find((item) => item.ready === false)?.key ??
    recommendations.find((item) => item.ready !== true)?.key ??
    null;
  const progressPercent = Math.round((completeCount / recommendations.length) * 100);

  return (
    <section className="motion-surface-enter mb-4 overflow-hidden rounded-2xl border border-[#D8E2DC] bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <div className="flex flex-col gap-4 px-5 py-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.14em] text-[#216551] dark:text-emerald-300">
            <Sparkles size={12} />
            Workspace activation
          </div>
          <h2 className="mt-1 text-[19px] font-semibold tracking-[-0.025em] text-[#18362D] dark:text-white">
            Get SalsysOS ready for action
          </h2>
          <p className="mt-0.5 text-[11px] text-[#60786D] dark:text-slate-400">
            Connect the essentials to track leads, reply faster and automate follow-ups.
          </p>
        </div>

        <div className="w-full max-w-[215px] shrink-0">
          <div className="flex items-center justify-between text-[10px] text-[#4F6B5E] dark:text-slate-400">
            <span>Setup progress</span>
            <span className="font-bold text-[#164C3D] dark:text-emerald-300">
              {completeCount} of {recommendations.length} verified
            </span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#EAF0EC] dark:bg-slate-800">
            <div
              className="motion-progress-reveal h-full rounded-full bg-[#216551]"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <div className="mt-1.5 text-right text-[9px] text-[#8A9A92] dark:text-slate-500">
            {remainingCount} {remainingCount === 1 ? 'step' : 'steps'} remaining
          </div>
        </div>
      </div>

      <div className="motion-stagger grid gap-2 border-t border-[#EEF2EF] px-3 py-3 sm:grid-cols-2 xl:grid-cols-4 dark:border-slate-900">
        {recommendations.map((item, index) => {
          const Icon = item.icon;
          const isReady = item.ready === true;
          const isStart = item.key === startKey;
          const statusLabel = item.ready === null ? 'Checking' : isReady ? 'Verified' : item.pendingLabel;

          return (
            <div
              key={item.key}
              className={[
                'group motion-step-card flex min-h-[158px] flex-col rounded-xl border p-3',
                isStart
                  ? 'motion-active-step border-[#184D3E] bg-[#184D3E] text-white shadow-sm'
                  : isReady
                    ? 'border-[#D6E6DD] bg-[#F7FBF8] dark:border-emerald-900/60 dark:bg-emerald-950/20'
                    : 'border-[#DCE4DF] bg-white dark:border-slate-800 dark:bg-slate-950',
              ].join(' ')}
            >
              <div className="flex items-start justify-between gap-3">
                <span
                  className={[
                    'grid h-8 w-8 place-items-center rounded-lg',
                    isReady ? 'motion-state-pop' : '',
                    isStart
                      ? 'bg-white/12 text-white'
                      : isReady
                        ? 'bg-[#E7F4EC] text-[#216551] dark:bg-emerald-950/60 dark:text-emerald-300'
                        : 'bg-[#EDF5F0] text-[#216551] dark:bg-emerald-950/50 dark:text-emerald-300',
                  ].join(' ')}
                >
                  {isReady ? <CheckCircle2 size={15} /> : <Icon size={15} />}
                </span>

                {isStart ? (
                  <span className="motion-status-live rounded-full bg-[#E8F6EC] px-2 py-1 text-[8.5px] font-bold text-[#184D3E]">
                    Start here
                  </span>
                ) : (
                  <span
                    className={[
                      'text-[8.5px] font-bold uppercase tracking-[.08em]',
                      isReady ? 'text-[#3B8A68]' : 'text-[#8A9A92] dark:text-slate-500',
                    ].join(' ')}
                  >
                    {isReady ? 'Verified' : `Step 0${index + 1}`}
                  </span>
                )}
              </div>

              <div className={['mt-3 text-[13px] font-semibold', isStart ? 'text-white' : 'text-[#173D31] dark:text-slate-100'].join(' ')}>
                {item.title}
              </div>
              <p className={['mt-1 min-h-[36px] text-[10px] leading-[18px]', isStart ? 'text-white/80' : 'text-[#71847A] dark:text-slate-400'].join(' ')}>
                {item.detail}
              </p>

              <div className={['mt-auto flex items-center justify-between gap-3 border-t pt-2.5', isStart ? 'border-white/15' : 'border-[#E9EFEB] dark:border-slate-800'].join(' ')}>
                <Link
                  href={item.href}
                  className={[
                    'inline-flex items-center gap-1 text-[10px] font-semibold transition',
                    isStart
                      ? 'rounded-lg bg-white px-2.5 py-1.5 text-[#184D3E] hover:bg-[#F3F8F5]'
                      : 'text-[#17634D] hover:text-[#0F4738] dark:text-emerald-300',
                  ].join(' ')}
                >
                  {isReady ? 'Manage' : item.cta}
                  <ArrowRight size={11} className="motion-action-arrow" />
                </Link>
                <span className={['text-[8.5px] font-semibold', isStart ? 'text-white/75' : isReady ? 'text-[#3B8A68]' : 'text-[#8A9A92] dark:text-slate-500'].join(' ')}>
                  {statusLabel}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-2 border-t border-[#EEF2EF] bg-[#FAFCFB] px-5 py-2.5 text-[9.5px] text-[#71847A] dark:border-slate-900 dark:bg-slate-950 dark:text-slate-400">
        <CheckCircle2 size={12} className="text-[#3B956F]" />
        Verified steps update automatically from the real workspace state. Drafts alone do not activate workflows.
      </div>
    </section>
  );
}
