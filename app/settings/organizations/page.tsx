import { redirect } from 'next/navigation';
import {
  Building2,
  CheckCircle2,
  KeyRound,
  ShieldCheck,
  UserPlus,
  Users,
} from 'lucide-react';

import { provisionCustomerOrganizationAction } from '@/app/settings/organizations/actions';
import { PageHeader } from '@/components/ui';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { getCurrentWorkspaceContext } from '@/lib/workspace';

type OrganizationRow = {
  id: string;
  name: string;
  slug: string;
  status: string;
  created_at: string;
};

type OnboardingRow = {
  organization_id: string;
  status: string;
  current_step: string;
  enforce_on_sign_in: boolean;
  completed_at: string | null;
};

async function requirePlatformAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) redirect('/login');

  const workspace = await getCurrentWorkspaceContext(supabase);
  const active = workspace.activeWorkspace;

  if (
    !active ||
    active.organizationSlug !== 'salsysos' ||
    !['owner', 'admin'].includes(active.role)
  ) {
    redirect('/dashboard');
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id,active')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError || !profile || profile.active !== true) redirect('/dashboard');
}

function formatDate(value: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export default async function OrganizationsPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const query = await searchParams;
  await requirePlatformAdmin();

  const admin = createAdminClient();
  const [organizationsResult, onboardingResult] = await Promise.all([
    admin
      .from('organizations')
      .select('id,name,slug,status,created_at')
      .order('created_at', { ascending: false }),
    admin
      .from('organization_onboarding')
      .select('organization_id,status,current_step,enforce_on_sign_in,completed_at'),
  ]);

  if (organizationsResult.error) {
    throw new Error(`Unable to load organizations: ${organizationsResult.error.message}`);
  }
  if (onboardingResult.error) {
    throw new Error(`Unable to load onboarding state: ${onboardingResult.error.message}`);
  }

  const organizations = (organizationsResult.data ?? []) as OrganizationRow[];
  const onboardingByOrganization = new Map(
    ((onboardingResult.data ?? []) as OnboardingRow[]).map((row) => [row.organization_id, row]),
  );

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Platform administration"
        title="Customer organizations"
        description="Provision a new tenant and owner login. Only the SalsysOS platform workspace can use this screen."
      />

      {query.notice ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {query.notice}
        </div>
      ) : null}

      {query.error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {query.error}
        </div>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
            <UserPlus size={18} />
          </span>
          <div>
            <div className="text-base font-semibold text-slate-950">Provision customer workspace</div>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
              This creates the owner Auth identity, organization membership, standard functional workspaces and a required onboarding record together. If tenant provisioning fails, the new Auth identity is rolled back.
            </p>
          </div>
        </div>

        <form action={provisionCustomerOrganizationAction} className="mt-6 grid gap-4 md:grid-cols-2">
          <label>
            <span className="mb-1.5 block text-xs font-semibold text-slate-700">Organization name *</span>
            <div className="relative">
              <Building2 size={15} className="absolute left-3 top-3 text-slate-400" />
              <input
                name="organization_name"
                required
                maxLength={180}
                placeholder="Acme Wellness"
                className="input w-full pl-9"
              />
            </div>
          </label>

          <label>
            <span className="mb-1.5 block text-xs font-semibold text-slate-700">Organization slug <span className="font-normal text-slate-400">optional</span></span>
            <input
              name="organization_slug"
              maxLength={80}
              placeholder="acme-wellness"
              className="input w-full"
            />
            <span className="mt-1 block text-[10px] leading-4 text-slate-400">If left blank, SalsysOS generates it from the organization name.</span>
          </label>

          <label>
            <span className="mb-1.5 block text-xs font-semibold text-slate-700">Owner name *</span>
            <div className="relative">
              <Users size={15} className="absolute left-3 top-3 text-slate-400" />
              <input
                name="owner_full_name"
                required
                maxLength={180}
                placeholder="Customer owner"
                className="input w-full pl-9"
              />
            </div>
          </label>

          <label>
            <span className="mb-1.5 block text-xs font-semibold text-slate-700">Owner email *</span>
            <input
              name="owner_email"
              type="email"
              required
              autoComplete="off"
              placeholder="owner@example.com"
              className="input w-full"
            />
          </label>

          <label className="md:col-span-2">
            <span className="mb-1.5 block text-xs font-semibold text-slate-700">Temporary password *</span>
            <div className="relative max-w-xl">
              <KeyRound size={15} className="absolute left-3 top-3 text-slate-400" />
              <input
                name="temporary_password"
                type="password"
                required
                minLength={12}
                autoComplete="new-password"
                className="input w-full pl-9"
              />
            </div>
            <span className="mt-1 block text-[10px] leading-4 text-slate-400">Minimum 12 characters. Share it with the owner through your approved secure channel.</span>
          </label>

          <div className="md:col-span-2 flex flex-col gap-3 rounded-xl border border-emerald-100 bg-emerald-50/70 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2 text-xs leading-5 text-emerald-800">
              <ShieldCheck size={16} className="mt-0.5 shrink-0" />
              <span>New tenants are enrolled into onboarding explicitly. Existing organizations are never used as templates or fallback tenants.</span>
            </div>
            <button type="submit" className="btn-primary shrink-0">
              <UserPlus size={14} /> Provision workspace
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="eyebrow">Tenant registry</div>
            <h2 className="section-title mt-1">Organizations</h2>
          </div>
          <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
            {organizations.length} total
          </div>
        </div>

        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[820px] border-separate border-spacing-0 text-left text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-[.06em] text-slate-400">
                <th className="border-b border-slate-200 px-3 py-3">Organization</th>
                <th className="border-b border-slate-200 px-3 py-3">Tenant status</th>
                <th className="border-b border-slate-200 px-3 py-3">Onboarding</th>
                <th className="border-b border-slate-200 px-3 py-3">Enforced</th>
                <th className="border-b border-slate-200 px-3 py-3">Created</th>
              </tr>
            </thead>
            <tbody>
              {organizations.map((organization) => {
                const onboarding = onboardingByOrganization.get(organization.id);
                const complete = onboarding?.status === 'completed';
                return (
                  <tr key={organization.id}>
                    <td className="border-b border-slate-100 px-3 py-4">
                      <div className="font-semibold text-slate-900">{organization.name}</div>
                      <div className="mt-1 font-mono text-[11px] text-slate-400">{organization.slug}</div>
                    </td>
                    <td className="border-b border-slate-100 px-3 py-4">
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs capitalize text-slate-600">{organization.status}</span>
                    </td>
                    <td className="border-b border-slate-100 px-3 py-4">
                      {onboarding ? (
                        <div className="flex items-center gap-2">
                          {complete ? <CheckCircle2 size={15} className="text-emerald-600" /> : null}
                          <div>
                            <div className="text-xs font-semibold capitalize text-slate-700">{onboarding.status.replaceAll('_', ' ')}</div>
                            <div className="mt-0.5 text-[10px] text-slate-400">Step: {onboarding.current_step}</div>
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">Legacy / not enrolled</span>
                      )}
                    </td>
                    <td className="border-b border-slate-100 px-3 py-4 text-xs text-slate-600">
                      {onboarding?.enforce_on_sign_in ? 'Yes' : 'No'}
                    </td>
                    <td className="border-b border-slate-100 px-3 py-4 text-xs text-slate-500">
                      {formatDate(organization.created_at)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
