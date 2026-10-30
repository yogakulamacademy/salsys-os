import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Inbox,
  ShieldCheck,
  UserRoundCheck,
  UsersRound,
} from 'lucide-react';

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
    <div className="space-y-4">
      <PageHeader
        eyebrow="Team · Management"
        title="Team Overview"
        description={`Coordinate ownership, workload and access for ${organizationName} without mixing sales assignment with account permissions.`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/leads?view=unassigned" className="btn-primary">
              <UserRoundCheck size={15} /> Assignment queue
            </Link>
            {canManageAccess ? (
              <Link href="/team-performance" className="btn-secondary">
                <BarChart3 size={15} /> Performance
              </Link>
            ) : null}
          </div>
        }
      />

      <section className="rounded-panel border border-line bg-surface px-4 py-3 shadow-card sm:px-5">
        <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold text-copy-muted">
          <span className="rounded-full bg-brand-50 px-2.5 py-1 text-brand-700">1 · Assign ownership</span>
          <ArrowRight size={12} className="text-copy-subtle" />
          <span className="rounded-full bg-surface-muted px-2.5 py-1">2 · Balance workload</span>
          <ArrowRight size={12} className="text-copy-subtle" />
          <span className="rounded-full bg-surface-muted px-2.5 py-1">3 · Review outcomes</span>
          {canManageAccess ? (
            <>
              <ArrowRight size={12} className="text-copy-subtle" />
              <span className="rounded-full bg-surface-muted px-2.5 py-1">4 · Manage access</span>
            </>
          ) : null}
        </div>
      </section>

      <section className={`grid gap-4 ${canManageAccess ? 'md:grid-cols-2 xl:grid-cols-3' : 'md:grid-cols-2'}`}>
        <TeamCard
          href="/leads?view=unassigned"
          icon={<UserRoundCheck size={19} />}
          eyebrow="Assignments"
          title="Unassigned lead queue"
          description="Route new opportunities to the right Sales owner without changing the customer record or pipeline stage."
          action="Assign leads"
          primary
        />

        <TeamCard
          href="/leads"
          icon={<Inbox size={19} />}
          eyebrow="Workload"
          title="Owned lead workspace"
          description="Review ownership in the Leads workspace, then rebalance records where response load or coverage needs attention."
          action="Review ownership"
        />

        {canManageAccess ? (
          <TeamCard
            href="/team-performance"
            icon={<BarChart3 size={19} />}
            eyebrow="Performance"
            title="Team performance"
            description="Compare workload, response activity, assignment fairness and observed outcomes across active team members."
            action="Open performance"
          />
        ) : null}

        {canManageAccess ? (
          <TeamCard
            href="/settings/team"
            icon={<ShieldCheck size={19} />}
            eyebrow="Permissions"
            title="Team & access"
            description="Create, deactivate and manage tenant-scoped staff access. Permissions remain separate from lead ownership."
            action="Manage access"
          />
        ) : null}
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="card-pad">
          <div className="eyebrow">Management model</div>
          <div className="section-title mt-1">Ownership is not access</div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-copy-muted">
            Assigning a lead decides who is responsible for the opportunity. Account permissions decide what a staff member can see or change in SalsysOS. Keeping those controls separate prevents a reassignment from accidentally changing workspace access.
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Principle
              title="Assignment"
              text="Changes the opportunity owner only."
            />
            <Principle
              title="Workload"
              text="Helps managers balance attention and follow-up pressure."
            />
            <Principle
              title="Performance"
              text="Uses observed activity and outcomes; it does not silently score employees."
            />
          </div>
        </div>

        <aside className="card-pad">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700">
              <UsersRound size={18} />
            </span>
            <div>
              <div className="eyebrow">Current access</div>
              <div className="section-title mt-1">{canManageAccess ? 'Owner / Admin controls' : 'Manager controls'}</div>
            </div>
          </div>

          <div className="mt-4 space-y-2 text-xs leading-5 text-copy-muted">
            <AccessRow text="Assign and rebalance Sales ownership" />
            <AccessRow text="Open shared Sales lead queues" />
            {canManageAccess ? <AccessRow text="Review Team Performance" /> : null}
            {canManageAccess ? <AccessRow text="Create or deactivate staff access" /> : null}
          </div>
        </aside>
      </section>
    </div>
  );
}

function TeamCard({
  href,
  icon,
  eyebrow,
  title,
  description,
  action,
  primary = false,
}: {
  href: string;
  icon: React.ReactNode;
  eyebrow: string;
  title: string;
  description: string;
  action: string;
  primary?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`group rounded-panel border bg-surface p-5 shadow-card transition hover:-translate-y-0.5 hover:shadow-lg ${
        primary ? 'border-brand-200' : 'border-line hover:border-brand-200'
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-brand-700">
          {icon}
        </span>
        {primary ? (
          <span className="rounded-full border border-brand-100 bg-brand-50 px-2.5 py-1 text-[10px] font-semibold text-brand-700">
            Start here
          </span>
        ) : null}
      </div>
      <div className="mt-4 text-[10px] font-semibold uppercase tracking-[0.12em] text-copy-subtle">{eyebrow}</div>
      <h2 className="mt-1 text-base font-semibold text-copy-strong">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-copy-muted">{description}</p>
      <span className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700">
        {action} <ArrowRight size={13} className="transition group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}

function Principle({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface-muted/60 px-4 py-3">
      <div className="flex items-center gap-2 text-xs font-semibold text-copy-strong">
        <CheckCircle2 size={14} className="text-success" /> {title}
      </div>
      <div className="mt-1 text-[11px] leading-5 text-copy-muted">{text}</div>
    </div>
  );
}

function AccessRow({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-line bg-surface-muted/50 px-3 py-2.5">
      <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-success" />
      <span>{text}</span>
    </div>
  );
}
