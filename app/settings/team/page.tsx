import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowLeft,
  BadgeCheck,
  ShieldCheck,
  UserPlus,
  Users,
} from "lucide-react";

import { PageHeader } from "@/components/ui";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContextForUser } from "@/lib/workspace";

type OrganizationMemberRow = {
  user_id: string;
  role: string;
  active: boolean;
};

type TeamProfile = {
  id: string;
  full_name: string | null;
  role: string;
  active: boolean;
};

type WorkspaceMembershipRow = {
  user_id: string;
  workspace_code: string;
  role: string;
  active: boolean;
};

type OrganizationWorkspaceRow = {
  workspace_code: string;
};

type WorkspaceCatalogRow = {
  code: string;
  name: string;
  sort_order: number | null;
};

type TeamMember = {
  userId: string;
  fullName: string;
  email: string;
  organizationRole: string;
  legacyProfileRole: string;
  accountActive: boolean;
  organizationActive: boolean;
  workspaces: Array<{
    code: string;
    name: string;
    role: string;
  }>;
};

export default async function TeamAccessPage({
  searchParams,
}: {
  searchParams: Promise<{
    notice?: string;
    error?: string;
  }>;
}) {
  const query = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect("/login");
  }

  const { data: currentProfile, error: currentProfileError } = await supabase
    .from("profiles")
    .select("id,active")
    .eq("id", user.id)
    .maybeSingle();

  if (currentProfileError || !currentProfile || currentProfile.active !== true) {
    redirect("/login?error=access-disabled");
  }

  const workspaceContext = await getWorkspaceContextForUser(supabase, user.id);
  const activeOrganization = workspaceContext.activeWorkspace;

  if (!activeOrganization) {
    redirect("/workspace?next=%2Fsettings%2Fteam");
  }

  if (
    activeOrganization.role !== "owner" &&
    activeOrganization.role !== "admin"
  ) {
    redirect("/workspace/admin?restricted=1");
  }

  const organizationId = activeOrganization.organizationId;
  const admin = createAdminClient();

  const [
    membersResult,
    enabledWorkspacesResult,
    catalogResult,
  ] = await Promise.all([
    admin
      .from("organization_members")
      .select("user_id,role,active")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: true }),
    admin
      .from("organization_workspaces")
      .select("workspace_code")
      .eq("organization_id", organizationId)
      .eq("enabled", true),
    admin
      .from("workspace_catalog")
      .select("code,name,sort_order")
      .eq("status", "active")
      .order("sort_order", { ascending: true }),
  ]);

  if (membersResult.error) {
    throw new Error(
      `Unable to load organization members: ${membersResult.error.message}`,
    );
  }

  if (enabledWorkspacesResult.error) {
    throw new Error(
      `Unable to load enabled workspaces: ${enabledWorkspacesResult.error.message}`,
    );
  }

  if (catalogResult.error) {
    throw new Error(
      `Unable to load workspace catalog: ${catalogResult.error.message}`,
    );
  }

  const organizationMembers =
    (membersResult.data ?? []) as OrganizationMemberRow[];
  const memberIds = organizationMembers.map((member) => member.user_id);
  const enabledWorkspaceCodes = new Set(
    ((enabledWorkspacesResult.data ?? []) as OrganizationWorkspaceRow[]).map(
      (row) => row.workspace_code,
    ),
  );

  const workspaceCatalog =
    ((catalogResult.data ?? []) as WorkspaceCatalogRow[]).filter((workspace) =>
      enabledWorkspaceCodes.has(workspace.code),
    );

  const [profilesResult, workspaceMembershipsResult, authUsers] =
    memberIds.length > 0
      ? await Promise.all([
          admin
            .from("profiles")
            .select("id,full_name,role,active")
            .in("id", memberIds),
          admin
            .from("workspace_memberships")
            .select("user_id,workspace_code,role,active")
            .eq("organization_id", organizationId)
            .in("user_id", memberIds),
          Promise.all(
            memberIds.map(async (userId) => {
              const result = await admin.auth.admin.getUserById(userId);

              return {
                userId,
                email: result.data.user?.email ?? "—",
              };
            }),
          ),
        ])
      : [
          { data: [], error: null },
          { data: [], error: null },
          [],
        ];

  if (profilesResult.error) {
    throw new Error(`Unable to load team profiles: ${profilesResult.error.message}`);
  }

  if (workspaceMembershipsResult.error) {
    throw new Error(
      `Unable to load workspace memberships: ${workspaceMembershipsResult.error.message}`,
    );
  }

  const profilesById = new Map(
    ((profilesResult.data ?? []) as TeamProfile[]).map((profile) => [
      profile.id,
      profile,
    ]),
  );

  const emailById = new Map(
    authUsers.map((authUser) => [authUser.userId, authUser.email] as const),
  );

  const workspaceMembershipsByUser = new Map<
    string,
    WorkspaceMembershipRow[]
  >();

  for (const membership of
    (workspaceMembershipsResult.data ?? []) as WorkspaceMembershipRow[]) {
    const current = workspaceMembershipsByUser.get(membership.user_id) ?? [];
    current.push(membership);
    workspaceMembershipsByUser.set(membership.user_id, current);
  }

  const members: TeamMember[] = organizationMembers
    .map((membership) => {
      const profile = profilesById.get(membership.user_id);
      const implicitAdminAccess =
        membership.role === "owner" || membership.role === "admin";
      const explicitMemberships =
        workspaceMembershipsByUser.get(membership.user_id) ?? [];

      const workspaces = workspaceCatalog.flatMap((workspace) => {
        if (implicitAdminAccess) {
          return [
            {
              code: workspace.code,
              name: workspace.name,
              role: membership.role,
            },
          ];
        }

        const grant = explicitMemberships.find(
          (row) =>
            row.workspace_code === workspace.code && row.active === true,
        );

        return grant
          ? [
              {
                code: workspace.code,
                name: workspace.name,
                role: grant.role,
              },
            ]
          : [];
      });

      return {
        userId: membership.user_id,
        fullName: profile?.full_name?.trim() || "CRM User",
        email: emailById.get(membership.user_id) ?? "—",
        organizationRole: membership.role,
        legacyProfileRole: profile?.role ?? "missing",
        accountActive: profile?.active === true,
        organizationActive: membership.active === true,
        workspaces,
      };
    })
    .sort((left, right) => left.fullName.localeCompare(right.fullName));

  const employees = members.filter(
    (member) =>
      member.organizationRole !== "owner" &&
      member.organizationRole !== "admin",
  );

  const activeEmployees = employees.filter(
    (employee) => employee.accountActive && employee.organizationActive,
  ).length;

  return (
    <>
      <PageHeader
        eyebrow="Admin workspace"
        title="Team & Access"
        description={`Organization-scoped access for ${activeOrganization.organizationName}. Workspace grants shown here are isolated to this organization.`}
        actions={
          <Link href="/settings" className="btn-secondary">
            <ArrowLeft size={16} />
            Settings
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
          label="Organization members"
          value={members.length}
          detail="Only members of the currently selected organization are listed."
        />

        <SummaryCard
          icon={<BadgeCheck size={18} />}
          label="Active employees"
          value={activeEmployees}
          detail="Active here means both the account and this organization membership are enabled."
        />

        <SummaryCard
          icon={<ShieldCheck size={18} />}
          label="Access authority"
          value="RBAC"
          detail="Organization role + functional workspace grants now drive access."
        />
      </div>

      <div className="team-layout mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section className="team-table-card card overflow-hidden">
          <div className="border-b border-slate-100 px-5 py-4">
            <div className="text-sm font-semibold text-slate-900">
              Team members
            </div>

            <div className="mt-1 text-xs leading-5 text-slate-500">
              Access is scoped to {activeOrganization.organizationName}. Owner and
              Admin receive enabled workspaces implicitly; other members receive
              explicit workspace grants.
            </div>
          </div>

          <div className="team-table-wrap overflow-x-auto">
            <table className="team-table w-full min-w-[920px]">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70">
                  <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-[.1em] text-slate-400">
                    Team member
                  </th>
                  <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-[.1em] text-slate-400">
                    Organization role
                  </th>
                  <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-[.1em] text-slate-400">
                    Workspaces
                  </th>
                  <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-[.1em] text-slate-400">
                    Status
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {members.map((member) => (
                  <tr key={member.userId} className="hover:bg-slate-50/70">
                    <td className="px-5 py-4">
                      <div className="font-semibold text-slate-900">
                        {member.fullName}
                      </div>
                      <div className="mt-0.5 text-xs text-slate-500">
                        {member.email}
                      </div>
                      <div className="mt-1 text-[11px] text-slate-400">
                        Legacy profile: {member.legacyProfileRole}
                      </div>
                    </td>

                    <td className="px-5 py-4">
                      <span className="inline-flex rounded-full bg-sky-50 px-2.5 py-1 text-xs font-semibold capitalize text-sky-700">
                        {member.organizationRole.replaceAll("_", " ")}
                      </span>
                    </td>

                    <td className="px-5 py-4">
                      {member.workspaces.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {member.workspaces.map((workspace) => (
                            <span
                              key={workspace.code}
                              className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600"
                              title={`${workspace.name} · ${workspace.role}`}
                            >
                              {workspace.name}
                              <span className="ml-1 text-slate-400">
                                · {workspace.role}
                              </span>
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs font-semibold text-slate-400">
                          No workspace grants
                        </span>
                      )}
                    </td>

                    <td className="px-5 py-4">
                      <div className="flex flex-wrap gap-1.5">
                        <span
                          className={
                            member.organizationActive
                              ? "inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700"
                              : "inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500"
                          }
                        >
                          Org {member.organizationActive ? "active" : "inactive"}
                        </span>
                        {!member.accountActive ? (
                          <span className="inline-flex rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700">
                            Account disabled
                          </span>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}

                {members.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-5 py-8 text-center text-sm text-slate-500"
                    >
                      No members are assigned to this organization.
                    </td>
                  </tr>
                ) : null}
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
              <div className="font-semibold text-slate-900">
                Add Employee
              </div>
              <div className="text-xs text-slate-500">
                Workspace-aware provisioning is next.
              </div>
            </div>
          </div>

          <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm leading-6 text-slate-600">
            The legacy create/deactivate controls are temporarily hidden while
            employee provisioning is upgraded to create the Auth account,
            organization membership, and functional workspace grants together.
            This prevents new orphaned or cross-tenant employee accounts during
            the W4 migration.
          </div>
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
