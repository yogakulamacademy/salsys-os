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

  // This recommendation layer is only for customers that have actually
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
      title: 'Connect your website',
      detail: 'Install tracking and send a real browser event.',
      href: '/tracking/sources',
      icon: Globe2,
      ready: websiteReady,
    },
    {
      key: 'channels',
      title: 'Connect a channel',
      detail: 'Connect WhatsApp, Instagram, Meta or Google.',
      href: '/settings/integrations',
      icon: MessageCircleMore,
      ready: channelsReady,
    },
    {
      key: 'team',
      title: 'Add your team',
      detail: 'Invite at least one active teammate.',
      href: '/settings/team',
      icon: Users,
      ready: teamReady,
    },
    {
      key: 'automation',
      title: 'Create an automation',
      detail: 'Start with a recipe or Smart Trigger.',
      href: '/automation/recipes',
      icon: Workflow,
      ready: automationReady,
    },
  ];

  const known = recommendations.filter((item) => item.ready !== null);
  const pending = known.filter((item) => item.ready === false);

  if (pending.length === 0) return null;

  const completeCount = known.filter((item) => item.ready === true).length;

  return (
    <section className="mb-3 overflow-hidden rounded-xl border border-[#DCE4DF] bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <div className="flex flex-col gap-2 border-b border-[#EEF2EF] px-4 py-3 sm:flex-row sm:items-center sm:justify-between dark:border-slate-900">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[.13em] text-[#216551] dark:text-emerald-300">
            <Sparkles size={11} />
            Setup recommendations
          </div>
          <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <h2 className="text-[15px] font-semibold tracking-[-0.02em] text-[#18362D] dark:text-white">
              Finish setting up SalsysOS
            </h2>
            <p className="text-[10.5px] text-[#71847A] dark:text-slate-400">
              Complete these when you’re ready.
            </p>
          </div>
        </div>
        <div className="shrink-0 rounded-full bg-[#EEF6F1] px-2.5 py-1 text-[9.5px] font-bold text-[#216551] dark:bg-emerald-950/50 dark:text-emerald-300">
          {completeCount} complete · {pending.length} left
        </div>
      </div>

      <div className="grid gap-px bg-[#EEF2EF] sm:grid-cols-2 xl:grid-cols-4 dark:bg-slate-900">
        {pending.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.key}
              href={item.href}
              className="group flex min-h-[84px] items-center gap-3 bg-white px-3.5 py-3 transition hover:bg-[#F8FAF8] dark:bg-slate-950 dark:hover:bg-slate-900/70"
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#EDF5F0] text-[#216551] dark:bg-emerald-950/50 dark:text-emerald-300">
                <Icon size={14} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12px] font-semibold text-[#253E35] dark:text-slate-100">{item.title}</div>
                <div className="mt-0.5 truncate text-[10px] text-[#71847A] dark:text-slate-400">{item.detail}</div>
              </div>
              <ArrowRight size={13} className="shrink-0 text-[#B0BDB6] transition group-hover:translate-x-0.5 group-hover:text-[#216551]" />
            </Link>
          );
        })}
      </div>

      <div className="flex items-center gap-1.5 border-t border-[#EEF2EF] bg-[#FAFCFB] px-4 py-2 text-[9.5px] text-[#71847A] dark:border-slate-900 dark:bg-slate-950 dark:text-slate-400">
        <CheckCircle2 size={11} className="text-[#3B956F]" />
        Items disappear automatically when verified.
      </div>
    </section>
  );
}
