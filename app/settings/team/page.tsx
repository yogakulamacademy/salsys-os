import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  ChevronDown,
  CircleCheck,
  Clock3,
  KeyRound,
  Layers3,
  ShieldCheck,
  Sparkles,
  UserCheck,
  UserPlus,
  UserRoundX,
  Users,
  UsersRound,
  Zap,
} from 'lucide-react';

import { PageHeader } from '@/components/ui';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireCurrentOrganizationId } from '@/lib/workspace';
import { createEmployeeAction } from './actions';
import { TeamDirectory, type DirectoryMember } from './team-directory';
import './team-access.css';

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

  const totalMembers = teamMembers.length;
  const activeMembers = teamMembers.filter(
    member => member.membershipActive && member.profileActive,
  ).length;
  const inactiveMembers = totalMembers - activeMembers;
  const inactiveEmployees = employees.filter(
    member => !member.membershipActive || !member.profileActive,
  ).length;
  const rolesInUse = new Set(teamMembers.map(member => member.organizationRole)).size;
  const directoryMembers: DirectoryMember[] = teamMembers.map(member => ({
    id: member.id,
    fullName: member.fullName,
    email: emailById.get(member.id) ?? '—',
    organizationRole: member.organizationRole,
    active: member.membershipActive && member.profileActive,
  }));
  const ownerCount = teamMembers.filter(member => member.organizationRole === 'owner').length;
  const adminCount = teamMembers.filter(member => member.organizationRole === 'admin').length;

  return (
    <div className="tac space-y-5">
      <PageHeader
        eyebrow="Settings"
        title="Team & Access"
        description={\`Manage members, roles and secure workspace access for \${organizationName}.\`}
        actions={<Link href="/settings/overview" className="tac-back">
          <ArrowLeft size={15}/> Back to Settings
        </Link>}
      />

      {query.notice ? <div className="team-notice rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800" role="status">
        {query.notice}
      </div> : null}
      {query.error ? <div className="team-error rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800" role="alert">
        {query.error}
      </div> : null}

      <div className="tac-stats" aria-label="Tenant team statistics">
        <Stat icon={<UsersRound size={22}/>} value={totalMembers} label="Total members"/>
        <Stat icon={<UserCheck size={21}/>} value={activeMembers} label="Active" tone="success"/>
        <Stat icon={<UserRoundX size={21}/>} value={inactiveMembers} label="Inactive" tone="neutral"/>
        <Stat icon={<Layers3 size={21}/>} value={rolesInUse} label="Roles in use"/>
        <div className="tac-insight">
          <Sparkles size={24} aria-hidden="true"/>
          <div className="tac-insight-body">
            <h2>{totalMembers === 0 ? 'Get started' : inactiveEmployees > 0 ? 'Review employee access' : employees.length === 0 ? 'Add your first employee' : 'Access overview'}</h2>
            <p>{totalMembers === 0
              ? 'Add a colleague to start working together securely.'
              : inactiveEmployees > 0
                ? \`\${inactiveEmployees} employee account\${inactiveEmployees === 1 ? '' : 's'} currently inactive. Review whether access should be restored.\`
                : employees.length === 0
                  ? 'Your administrator account is listed. Add an employee to grant Sales workspace access.'
                  : 'Employee access is active in the current tenant. Review permissions when responsibilities change.'}</p>
          </div>
          <a href={employees.length === 0 ? '#tac-create-member' : '#tac-members-heading'}>
            {employees.length === 0 ? 'Add Member' : 'Review Members'} <ArrowRight size={14}/>
          </a>
        </div>
      </div>

      <div className="tac-layout">
        <TeamDirectory members={directoryMembers} organizationName={organizationName}/>

        <section className="tac-card tac-create" id="tac-create-member" aria-labelledby="tac-create-heading">
          <div className="tac-section-heading tac-create-heading">
            <span className="tac-icon"><UserPlus size={19}/></span>
            <div><h2 id="tac-create-heading">Add Team Member</h2>
              <p>Create an Employee account for the Sales workspace.</p></div>
          </div>
          <form action={createEmployeeAction}>
            <label className="tac-create-field">
              <span className="tac-create-label">Full name</span>
              <input className="tac-create-input" required name="full_name" type="text"
                autoComplete="name" placeholder="Enter full name" minLength={2}/>
            </label>
            <label className="tac-create-field">
              <span className="tac-create-label">Email address</span>
              <input className="tac-create-input" required name="email" type="email"
                autoComplete="off" placeholder="Enter email address"/>
            </label>
            <label className="tac-create-field">
              <span className="tac-create-label">Temporary password</span>
              <input className="tac-create-input" required name="password" type="password"
                autoComplete="new-password" minLength={10} placeholder="At least 10 characters"/>
            </label>
            <div className="tac-create-field">
              <span className="tac-create-label">Role</span>
              <div className="tac-role-fixed" aria-label="New member role: Employee">
                <span>Employee</span><KeyRound size={16} aria-hidden="true"/>
              </div>
            </div>
            <p className="tac-form-note">New members receive the fixed Employee role in {organizationName} and access to its Sales workspace. Owner/Admin creation and arbitrary role changes are not available here.</p>
            <button type="submit" className="tac-primary-action"><UserPlus size={16}/> Create employee</button>
          </form>
        </section>
      </div>

      <div className="tac-bottom">
        <section className="tac-card tac-role-summary" aria-labelledby="tac-role-heading">
          <div className="tac-section-heading">
            <span className="tac-icon"><Layers3 size={20}/></span>
            <div><h2 id="tac-role-heading">Role Access Overview</h2>
              <p>Membership roles currently supported by this workspace.</p></div>
          </div>
          {totalMembers === 0 ? <div className="tac-empty-actions">
            <Layers3 size={38}/>
            <strong>No assigned roles yet</strong>
            <p>Role counts will reflect the members assigned to this organization.</p>
          </div> : <div className="tac-role-cards">
            <RoleCard icon={<ShieldCheck size={22}/>} title="Owner" count={ownerCount}
              description="Tenant ownership and privileged configuration access."/>
            <RoleCard icon={<BadgeCheck size={22}/>} title="Admin" count={adminCount}
              description="Tenant administration, members and workspace settings."/>
            <RoleCard icon={<Users size={22}/>} title="Employee" count={employees.length}
              description="Sales workspace membership and operational access."/>
          </div>}
        </section>

        <section className="tac-card tac-actions-summary" aria-labelledby="tac-actions-heading">
          <div className="tac-section-heading">
            <span className="tac-icon"><Zap size={20}/></span>
            <div><h2 id="tac-actions-heading">Smart Actions</h2>
              <p>Useful access checks based on recorded membership status.</p></div>
          </div>
          {totalMembers === 0 ? <div className="tac-empty-actions">
            <CircleCheck size={36}/>
            <strong>No actions needed yet</strong>
            <p>After a member is created, relevant access checks will appear here.</p>
          </div> : <div className="tac-action-list">
            {inactiveEmployees > 0 ? <a href="#tac-members-heading">
              <UserCheck size={17}/><span>Review {inactiveEmployees} inactive employee{inactiveEmployees === 1 ? '' : 's'}</span><ArrowRight size={15}/>
            </a> : <div className="tac-action-info"><CircleCheck size={17}/>
              {employees.length ? 'All listed employee accounts are active.' : 'No employee accounts have been added yet.'}
            </div>}
            <div className="tac-action-info"><ShieldCheck size={17}/>
              Only Owner/Admin users can create or change employee access.
            </div>
            {employees.length === 0 ? <a href="#tac-create-member">
              <UserPlus size={17}/><span>Add a Sales workspace employee</span><ArrowRight size={15}/>
            </a> : null}
          </div>}
        </section>
      </div>
    </div>
  );
}

function Stat({ icon, value, label, tone }: { icon: React.ReactNode; value: number; label: string; tone?: 'success' | 'neutral' }) {
  return <section className="tac-stat" data-tone={tone}>
    <span className="tac-stat-icon">{icon}</span>
    <div><strong className="tac-stat-value">{value}</strong><span className="tac-stat-name">{label}</span></div>
  </section>;
}

function RoleCard({ icon, title, count, description }: {
  icon: React.ReactNode; title: string; count: number; description: string;
}) {
  return <div className="tac-role-card" data-present={count > 0 ? 'true' : undefined}>
    {icon}<strong>{title}</strong><p>{description}</p>
    <small>{count} member{count === 1 ? '' : 's'} assigned</small>
  </div>;
}
