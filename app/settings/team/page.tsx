import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  ArrowLeft,
  BadgeCheck,
  ShieldCheck,
  UserPlus,
  Users,
} from 'lucide-react';

import { PageHeader } from '@/components/ui';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireCurrentOrganizationId } from '@/lib/workspace';
import { createEmployeeAction, setEmployeeActiveAction } from './actions';

type TenantMembership = {
  user_id: string;
  role: string;
  active: boolean;
};

type TeamProfile = {
  id: string;
  full_name: string | null;
  active: boolean;
};

type TeamMember = {
  id: string;
  fullName: string | null;
  organizationRole: string;
  membershipActive: boolean;
  profileActive: boolean;
};

export default async function TeamAccessPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const query = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect('/login');
  }

  const organizationId = await requireCurrentOrganizationId(supabase, user.id);

  const [currentProfileResult, currentMembershipResult, organizationResult] =
    await Promise.all([
      supabase
        .from('profiles')
        .select('id, active')
        .eq('id', user.id)
        .maybeSingle(),
      supabase
        .from('organization_members')
        .select('organization_id, role, active')
        .eq('organization_id', organizationId)
        .eq('user_id', user.id)
        .eq('active', true)
        .maybeSingle(),
      supabase
        .from('organizations')
        .select('name')
        .eq('id', organizationId)
        .maybeSingle(),
    ]);

  const currentProfile = currentProfileResult.data;
  const currentMembership = currentMembershipResult.data;

  if (
    currentProfileResult.error ||
    currentMembershipResult.error ||
    !currentProfile ||
    currentProfile.active !== true ||
    !currentMembership ||
    !['owner', 'admin'].includes(String(currentMembership.role ?? ''))
  ) {
    redirect('/dashboard');
  }

  const organizationName = organizationResult.data?.name ?? 'this organization';
  const admin = createAdminClient();

  const { data: membershipRows, error: membershipError } = await admin
    .from('organization_members')
    .select('user_id, role, active')
    .eq('organization_id', organizationId)
    .in('role', ['owner', 'admin', 'admissions']);

  if (membershipError) {
    throw new Error(`Unable to load tenant team: ${membershipError.message}`);
  }

  const tenantMemberships = (membershipRows ?? []) as TenantMembership[];
  const tenantUserIds = tenantMemberships.map((membership) => membership.user_id);

  const [profilesResult, authUsersResult] = await Promise.all([
    tenantUserIds.length > 0
      ? admin
          .from('profiles')
          .select('id, full_name, active')
          .in('id', tenantUserIds)
      : Promise.resolve({ data: [], error: null }),
    admin.auth.admin.listUsers({ page: 1, perPage: 200 }),
  ]);

  if (profilesResult.error) {
    throw new Error(`Unable to load tenant profiles: ${profilesResult.error.message}`);
  }

  const profiles = (profilesResult.data ?? []) as TeamProfile[];
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  const emailById = new Map(
    (authUsersResult.data.users ?? []).map(
      (authUser) => [authUser.id, authUser.email ?? '—'] as const,
    ),
  );

  const teamMembers: TeamMember[] = tenantMemberships
    .map((membership) => {
      const profile = profileById.get(membership.user_id);
      return {
        id: membership.user_id,
        fullName: profile?.full_name ?? null,
        organizationRole: membership.role,
        membershipActive: membership.active,
        profileActive: profile?.active ?? false,
      };
    })
    .sort((left, right) =>
      (left.fullName ?? 'CRM User').localeCompare(right.fullName ?? 'CRM User'),
    );

  const employees = teamMembers.filter(
    (member) => member.organizationRole === 'admissions',
  );
  const activeEmployees = employees.filter(
    (employee) => employee.membershipActive && employee.profileActive,
  ).length;

  return (
    <>
      <PageHeader
        eyebrow="Settings"
        title="Team & Access"
        description={`Manage employee access for ${organizationName}. Team records shown here are scoped only to the active tenant.`}
        actions={
          <Link href="/settings" className="btn-secondary">
            <ArrowLeft size={16} /> Settings
          </Link>
        }
      />

      {query.notice ? (
        <div className="team-notice mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
          {query.notice}
        </div>
      ) : null}

      {query.error ? (
        <div className="team-error mb-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">
          {query.error}
        </div>
      ) : null}

      <div className="team-summary-grid grid gap-4 md:grid-cols-3">
        <SummaryCard
          icon={<Users size={18} />}
          label="Employees"
          value={employees.length}
          detail={`Employee accounts assigned to ${organizationName}.`}
        />
        <SummaryCard
          icon={<BadgeCheck size={18} />}
          label="Active employees"
          value={activeEmployees}
          detail="Only active tenant employees are eligible for Sales workspace access."
        />
        <SummaryCard
          icon={<ShieldCheck size={18} />}
          label="Access model"
          value="Tenant isolated"
          detail="Creation, activation and deactivation are bound to the current organization."
        />
      </div>

      <div className="team-layout mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section className="team-table-card card overflow-hidden">
          <div className="border-b border-slate-100 px-5 py-4">
            <div className="text-sm font-semibold text-slate-900">Team members</div>
            <div className="mt-1 text-xs leading-5 text-slate-500">
              Only members of {organizationName} are shown. Employee accounts use the
              admissions role internally and receive Sales workspace membership.
            </div>
          </div>

          <div className="team-table-wrap overflow-x-auto">
            <table className="team-table w-full min-w-[760px]">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70">
                  <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-[.1em] text-slate-400">
                    Team member
                  </th>
                  <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-[.1em] text-slate-400">
                    Role
                  </th>
                  <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-[.1em] text-slate-400">
                    Status
                  </th>
                  <th className="px-5 py-3 text-right text-[11px] font-semibold uppercase tracking-[.1em] text-slate-400">
                    Access
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {teamMembers.map((member) => {
                  const isEmployee = member.organizationRole === 'admissions';
                  const isActive = member.membershipActive && member.profileActive;
                  const roleLabel =
                    member.organizationRole === 'owner'
                      ? 'Owner'
                      : member.organizationRole === 'admin'
                        ? 'Admin'
                        : 'Employee';

                  return (
                    <tr key={member.id} className="hover:bg-slate-50/70">
                      <td className="px-5 py-4">
                        <div className="font-semibold text-slate-900">
                          {member.fullName ?? 'CRM User'}
                        </div>
                        <div className="mt-0.5 text-xs text-slate-500">
                          {emailById.get(member.id) ?? '—'}
                        </div>
                      </td>

                      <td className="px-5 py-4">
                        <span
                          className={
                            isEmployee
                              ? 'inline-flex rounded-full bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-700'
                              : 'inline-flex rounded-full bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700'
                          }
                        >
                          {roleLabel}
                        </span>
                      </td>

                      <td className="px-5 py-4">
                        <span
                          className={
                            isActive
                              ? 'inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700'
                              : 'inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500'
                          }
                        >
                          {isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>

                      <td className="px-5 py-4 text-right">
                        {!isEmployee ? (
                          <span className="text-xs font-semibold text-slate-400">
                            Full tenant access
                          </span>
                        ) : (
                          <form action={setEmployeeActiveAction} className="inline-flex">
                            <input type="hidden" name="employee_id" value={member.id} />
                            <input
                              type="hidden"
                              name="active"
                              value={isActive ? 'false' : 'true'}
                            />
                            <button type="submit" className="btn-secondary">
                              {isActive ? 'Deactivate' : 'Activate'}
                            </button>
                          </form>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="team-create-card card-pad self-start">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand/10 text-brand">
              <UserPlus size={19} />
            </div>
            <div>
              <div className="font-semibold text-slate-900">Add Employee</div>
              <div className="text-xs text-slate-500">
                Creates login + {organizationName} membership + Sales access.
              </div>
            </div>
          </div>

          <form action={createEmployeeAction} className="mt-5 space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">
                Full name
              </span>
              <input
                required
                name="full_name"
                type="text"
                autoComplete="off"
                placeholder="Employee name"
                className="team-input w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-brand"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">
                Login email
              </span>
              <input
                required
                name="email"
                type="email"
                autoComplete="off"
                placeholder="employee@example.com"
                className="team-input w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-brand"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">
                Temporary password
              </span>
              <input
                required
                name="password"
                type="password"
                minLength={10}
                autoComplete="new-password"
                placeholder="Minimum 10 characters"
                className="team-input w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-brand"
              />
            </label>

            <div className="team-role-note rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-xs leading-5 text-slate-500">
              The new user will be an <strong>Employee</strong> in {organizationName}
              and a member of its <strong>Sales</strong> workspace only.
            </div>

            <button type="submit" className="btn-primary w-full justify-center">
              <UserPlus size={16} /> Create employee
            </button>
          </form>
        </section>
      </div>
    </>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  detail,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  detail: string;
}) {
  return (
    <section className="team-summary-card card-pad">
      <div className="flex items-center gap-2 text-brand">
        {icon}
        <span className="text-xs font-semibold uppercase tracking-[.08em] text-slate-400">
          {label}
        </span>
      </div>
      <div className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">
        {value}
      </div>
      <div className="mt-2 text-xs leading-5 text-slate-500">{detail}</div>
    </section>
  );
}
