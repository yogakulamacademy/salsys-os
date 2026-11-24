import {
  Building2,
  ChevronDown,
  CheckCircle2,
  KeyRound,
  ShieldCheck,
  UserPlus,
  Users,
} from 'lucide-react';

import { provisionCustomerOrganizationAction } from '@/app/settings/organizations/actions';
import { PageHeader } from '@/components/ui';
import { PlatformAdminFrame } from '@/components/platform-admin-frame';
import { requirePlatformAdminAccess } from '@/lib/platform-admin-access';
import { createAdminClient } from '@/lib/supabase/admin';
import Link from 'next/link';
import { ORGANIZATION_PAGE_SIZE, MAX_ORGANIZATION_PAGE, parseOrganizationPage, organizationPageRange, organizationPageHref } from '@/lib/platform-organization-pagination';

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
  searchParams: Promise<{ notice?: string; error?: string; page?: string | string[] }>;
}) {
  const query = await searchParams;
  await requirePlatformAdminAccess();

  const admin = createAdminClient();
  const countResult = await admin.from('organizations').select('id', { count: 'exact', head: true });
  const total = countResult.count;
  if (countResult.error || typeof total !== 'number' || !Number.isSafeInteger(total) || total < 0) {
    throw new Error('Organization registry count unavailable.');
  }
  const lastPage = Math.max(1, Math.ceil(total / ORGANIZATION_PAGE_SIZE));
  const page = Math.min(parseOrganizationPage(query.page), lastPage);
  const { from, to } = organizationPageRange(page);
  const organizationsResult = total > 0 ? await admin
    .from('organizations')
    .select('id,name,slug,status,created_at')
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(from, to) : { data: [], error: null };

  if (organizationsResult.error || !Array.isArray(organizationsResult.data) ||
      organizationsResult.data.length > ORGANIZATION_PAGE_SIZE) {
    throw new Error('Organization registry unavailable. Refresh the page.');
  }

  const organizations = organizationsResult.data as OrganizationRow[];
  const organizationIds = organizations.map(organization => organization.id);
  const onboardingResult = organizationIds.length
    ? await admin.from('organization_onboarding')
        .select('organization_id,status,current_step,enforce_on_sign_in,completed_at')
        .in('organization_id', organizationIds)
    : { data: [], error: null };
  if (onboardingResult.error || !Array.isArray(onboardingResult.data)) {
    throw new Error('Onboarding records unavailable.');
  }
  const onboardingByOrganization = new Map(
    (onboardingResult.data as OnboardingRow[]).map(row => [row.organization_id, row]),
  );

  return (
    <PlatformAdminFrame section="customers">
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

      <details open={Boolean(query.error)} className="group rounded-2xl border border-line bg-surface p-5 shadow-sm">
        <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3">
          <span className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-brand-700"><UserPlus size={18} aria-hidden="true" /></span><span><span className="block font-semibold">Create organization</span><span className="block text-xs text-copy-muted">Provision a workspace and owner account</span></span></span>
          <span className="flex items-center gap-2 text-sm font-semibold text-brand-700">New organization <ChevronDown size={16} className="group-open:rotate-180" aria-hidden="true" /></span>
        </summary>
        <div className="mt-5 flex items-start gap-3 border-t border-line pt-5">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
            <UserPlus size={18} />
          </span>
          <div>
            <div className="text-base font-semibold text-slate-950">Provision customer workspace</div>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
              This creates the owner Auth identity, organization membership, standard functional workspaces and a required onboarding record together. If tenant provisioning fails, SalsysOS also attempts to remove the temporary owner login and reports separately if that cleanup cannot be verified.
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
      </details>

      <section className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="eyebrow">Tenant registry</div>
            <h2 className="section-title mt-1">Organizations</h2>
          </div>
          <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
            {organizations.length} loaded / {total} total
          </div>
        </div>

        <p className="mt-2 text-xs text-copy-muted">Includes the platform workspace, demo and legacy organizations. Registry counts are not paid-customer counts. Concurrent changes can shift page contents.</p>
        {organizations.length === 0 && <p role="status" className="mt-5 rounded-lg border border-line p-4 text-sm text-copy-muted">{total === 0 ? 'No organizations recorded.' : 'No organizations on this page.'}</p>}
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
        <nav aria-label="Organization registry pagination" className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <p className="text-xs text-copy-muted">Page {page} · {organizations.length ? `${from + 1}–${from + organizations.length} of ${total}` : `${total} total`}</p>
          <div className="flex flex-wrap gap-2">
            {page > 1 && <Link href={organizationPageHref(1)} className="rounded-lg border border-line px-3 py-2 text-xs font-semibold">First</Link>}
            {page > 1 && <Link href={organizationPageHref(page - 1)} className="rounded-lg border border-line px-3 py-2 text-xs font-semibold">Previous</Link>}
            {page < lastPage && page < MAX_ORGANIZATION_PAGE && <Link href={organizationPageHref(page + 1)} className="rounded-lg border border-line px-3 py-2 text-xs font-semibold">Next</Link>}
          </div>
        </nav>
      </section>
    </div>
    </PlatformAdminFrame>
  );
}
