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
      detail: 'Install Universal Tracking and send a real browser event so visits and journeys can be measured.',
      href: '/tracking/sources',
      icon: Globe2,
      ready: websiteReady,
    },
    {
      key: 'channels',
      title: 'Connect a customer channel',
      detail: 'Connect WhatsApp, Instagram, Meta or Google so SalsysOS can work with real channel activity.',
      href: '/settings/integrations',
      icon: MessageCircleMore,
      ready: channelsReady,
    },
    {
      key: 'team',
      title: 'Add your team',
      detail: 'Invite at least one active admissions user when you are ready to collaborate inside the workspace.',
      href: '/settings/team',
      icon: Users,
      ready: teamReady,
    },
    {
      key: 'automation',
      title: 'Create your first automation',
      detail: 'Start from a safe recipe or Smart Trigger and keep activation under your existing review controls.',
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
    <section className="mb-4 overflow-hidden rounded-2xl border border-[#DCE4DF] bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <div className="flex flex-col gap-3 border-b border-[#EEF2EF] px-5 py-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-900">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.14em] text-[#216551] dark:text-emerald-300">
            <Sparkles size={13} />
            Setup recommendations
          </div>
          <h2 className="mt-1 text-lg font-semibold tracking-[-0.02em] text-[#18362D] dark:text-white">
            Finish setting up SalsysOS
          </h2>
          <p className="mt-1 text-xs text-[#71847A] dark:text-slate-400">
            These stay here until SalsysOS can verify the real setup state. You can keep using the workspace while you finish them.
          </p>
        </div>
        <div className="shrink-0 rounded-full bg-[#EEF6F1] px-3 py-1.5 text-[10.5px] font-bold text-[#216551] dark:bg-emerald-950/50 dark:text-emerald-300">
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
              className="group flex min-h-[132px] flex-col bg-white p-4 transition hover:bg-[#F8FAF8] dark:bg-slate-950 dark:hover:bg-slate-900/70"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#EDF5F0] text-[#216551] dark:bg-emerald-950/50 dark:text-emerald-300">
                  <Icon size={16} />
                </span>
                <ArrowRight size={14} className="text-[#B0BDB6] transition group-hover:translate-x-0.5 group-hover:text-[#216551]" />
              </div>
              <div className="mt-3 text-sm font-semibold text-[#253E35] dark:text-slate-100">{item.title}</div>
              <div className="mt-1 text-[11px] leading-5 text-[#71847A] dark:text-slate-400">{item.detail}</div>
            </Link>
          );
        })}
      </div>

      <div className="flex items-center gap-2 border-t border-[#EEF2EF] bg-[#FAFCFB] px-5 py-3 text-[10.5px] text-[#71847A] dark:border-slate-900 dark:bg-slate-950 dark:text-slate-400">
        <CheckCircle2 size={13} className="text-[#3B956F]" />
        Recommendations disappear automatically when the underlying setup is verified.
      </div>
    </section>
  );
}
