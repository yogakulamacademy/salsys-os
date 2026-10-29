import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowRight, BarChart3, ShieldCheck, UserRoundCheck, UsersRound } from 'lucide-react';

import { PageHeader } from '@/components/ui';
import { createClient } from '@/lib/supabase/server';
import { getCurrentWorkspaceContext } from '@/lib/workspace';

export default async function TeamPage() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) redirect('/login');

  const workspace = await getCurrentWorkspaceContext(supabase);
  const role = workspace.activeWorkspace?.role ?? null;
  const canManageAccess = role === 'owner' || role === 'admin';
  const canManageSales = canManageAccess || role === 'manager';

  if (!canManageSales) redirect('/dashboard?restricted=1');

  const organizationName = workspace.activeWorkspace?.organizationName ?? 'Current workspace';

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="CRM · Team"
        title="Team workspace"
        description={`Manage lead ownership, workload and access for ${organizationName}.`}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {canManageAccess ? (
          <TeamCard
            href="/settings/team"
            icon={<ShieldCheck size={19} />}
            title="Team & Access"
            description="Create or deactivate employee access and manage tenant-scoped staff accounts."
            badge="Owner / Admin"
          />
        ) : null}

        <TeamCard
          href="/leads?view=unassigned"
          icon={<UserRoundCheck size={19} />}
          title="Lead Assignment"
          description="Open the unassigned lead queue and assign leads to active Sales team members."
          badge="Sales manager"
        />

        <TeamCard
          href="/team-performance"
          icon={<BarChart3 size={19} />}
          title="Team Performance"
          description="Review workload, assignment fairness, activity and outcomes across the team."
          badge="Management"
        />
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">
            <UsersRound size={18} />
          </span>
          <div>
            <h2 className="text-base font-semibold text-slate-950 dark:text-white">How the team tools fit together</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Team & Access controls who can work in the CRM. Lead Assignment controls who owns each lead. Team Performance shows workload and results. These are intentionally separate so changing lead ownership never changes account permissions.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

function TeamCard({
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
  badge: string;
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
        <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-500 dark:bg-slate-900">
          {badge}
        </span>
      </div>
      <h2 className="mt-4 text-base font-semibold text-slate-950 dark:text-white">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>
      <span className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-violet-700 dark:text-violet-300">
        Open <ArrowRight size={13} className="transition group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}
