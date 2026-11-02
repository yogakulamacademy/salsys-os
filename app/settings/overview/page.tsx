import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  Activity,
  ArrowRight,
  BrainCircuit,
  Building2,
  Database,
  PlugZap,
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
        eyebrow="Settings"
        title="Workspace settings"
        description="Manage CRM rules, permissions, approved AI knowledge, integrations, tracking and operational system controls."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <SettingsCard
          href="/settings"
          icon={<SlidersHorizontal size={19} />}
          title="CRM Rules"
          description="Pipeline planning weights, aging thresholds, environment state and settings audit."
        />

        {admin ? (
          <SettingsCard
            href="/settings/team"
            icon={<ShieldCheck size={19} />}
            title="Team & Permissions"
            description="Create, activate and deactivate tenant-scoped employee access without changing lead ownership."
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
            href="/tracking"
            icon={<Database size={19} />}
            title="Tracking & Data"
            description="Review tracking sources, conversion coverage, form capture and data quality evidence."
          />
        ) : null}

        {admin ? (
          <SettingsCard
            href="/system-health"
            icon={<Activity size={19} />}
            title="System Health"
            description="Monitor operational integrations, syncs, webhook processing and recent failures."
          />
        ) : null}

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

      {manager && !admin ? (
        <section className="rounded-panel border border-line bg-surface px-4 py-4 shadow-card sm:px-5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-brand-700">Manager scope</div>
          <div className="mt-1 text-sm font-semibold text-copy-strong">Operational settings stay permission-bound</div>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-copy-muted">
            Managers can review CRM rules here. Provider credentials, team access, tracking administration and system-health controls remain Owner/Admin settings.
          </p>
        </section>
      ) : null}
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
      className="group rounded-panel border border-line bg-surface p-5 shadow-card transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-4">
        <span className="grid h-10 w-10 place-items-center rounded-ui bg-brand-50 text-brand-700">
          {icon}
        </span>
        {badge ? (
          <span className="rounded-full border border-line bg-surface-soft px-2 py-1 text-[10px] font-semibold text-copy-muted">
            {badge}
          </span>
        ) : null}
      </div>
      <h2 className="mt-4 text-base font-semibold text-copy-strong">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-copy-muted">{description}</p>
      <span className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700">
        Open <ArrowRight size={13} className="transition group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}
