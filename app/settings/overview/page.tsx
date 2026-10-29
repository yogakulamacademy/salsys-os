import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  Activity,
  ArrowRight,
  BrainCircuit,
  Building2,
  PlugZap,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
} from 'lucide-react';

import { PageHeader } from '@/components/ui';
import { createClient } from '@/lib/supabase/server';
import { getCurrentWorkspaceContext } from '@/lib/workspace';

export default async function SettingsOverviewPage() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) redirect('/login');

  const workspace = await getCurrentWorkspaceContext(supabase);
  const active = workspace.activeWorkspace;
  const role = active?.role ?? null;
  const admin = role === 'owner' || role === 'admin';
  const manager = role === 'manager';

  if (!admin && !manager) redirect('/dashboard?restricted=1');

  const platformAdmin = admin && active?.organizationSlug === 'salsysos';

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="System"
        title="Settings directory"
        description="A single place to find CRM rules, team access, AI knowledge, integrations and operational controls."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <SettingsCard
          href="/settings"
          icon={<SlidersHorizontal size={19} />}
          title="CRM Rules"
          description="Forecast probabilities, pipeline aging thresholds, environment state and settings audit."
        />

        {admin ? (
          <SettingsCard
            href="/settings/team"
            icon={<ShieldCheck size={19} />}
            title="Team & Access"
            description="Create, activate and deactivate tenant-scoped employee access."
          />
        ) : null}

        {admin ? (
          <SettingsCard
            href="/settings/knowledge"
            icon={<BrainCircuit size={19} />}
            title="AI Knowledge"
            description="Manage approved organization facts, policies, pricing, courses and sales guidance used by the Co-Pilot."
          />
        ) : null}

        {admin ? (
          <SettingsCard
            href="/settings/integrations"
            icon={<PlugZap size={19} />}
            title="Integrations"
            description="Manage connected accounts and provider configuration, including WhatsApp."
          />
        ) : null}

        {admin ? (
          <SettingsCard
            href="/system-health"
            icon={<Activity size={19} />}
            title="System Health"
            description="Operational health, data integrity and readiness for connected systems."
          />
        ) : null}

        <SettingsCard
          href="/team"
          icon={<Settings2 size={19} />}
          title="Team Workspace"
          description="Lead assignment, workload balancing, access and team performance."
        />

        {platformAdmin ? (
          <SettingsCard
            href="/settings/organizations"
            icon={<Building2 size={19} />}
            title="Customer Organizations"
            description="Platform-only tenant provisioning and onboarding administration."
            badge="Platform admin"
          />
        ) : null}
      </div>
    </div>
  );
}

function SettingsCard({
  href,
  icon,
  title,
  description,
  badge,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  badge?: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-violet-200 hover:shadow-md dark:border-slate-800 dark:bg-slate-950"
    >
      <div className="flex items-start justify-between gap-4">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">
          {icon}
        </span>
        {badge ? (
          <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-500 dark:bg-slate-900">
            {badge}
          </span>
        ) : null}
      </div>
      <h2 className="mt-4 text-base font-semibold text-slate-950 dark:text-white">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>
      <span className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-violet-700 dark:text-violet-300">
        Open <ArrowRight size={13} className="transition group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}
