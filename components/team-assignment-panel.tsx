import Link from 'next/link';
import { ArrowRightLeft, UserRoundCheck, UsersRound } from 'lucide-react';

import { assignLeadOwnerAction } from '@/app/actions/lead-assignment';
import { useMockData } from '@/lib/config';
import { createClient } from '@/lib/supabase/server';
import { getTeamAssignmentQueue } from '@/lib/team-performance-data';
import { requireCurrentOrganizationId } from '@/lib/workspace';

type AssignmentTarget = {
  id: string;
  name: string;
  role: string;
};

async function getAssignmentContext() {
  if (useMockData) {
    return { canManage: true, targets: [] as AssignmentTarget[] };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { canManage: false, targets: [] as AssignmentTarget[] };
  }

  const organizationId = await requireCurrentOrganizationId(supabase, user.id);

  const [currentMembershipResult, currentWorkspaceResult] = await Promise.all([
    supabase
      .from('organization_members')
      .select('role')
      .eq('organization_id', organizationId)
      .eq('user_id', user.id)
      .eq('active', true)
      .maybeSingle(),
    supabase
      .from('workspace_memberships')
      .select('role')
      .eq('organization_id', organizationId)
      .eq('workspace_code', 'sales')
      .eq('user_id', user.id)
      .eq('active', true)
      .maybeSingle(),
  ]);

  const organizationRole = String(currentMembershipResult.data?.role ?? '');
  const salesRole = String(currentWorkspaceResult.data?.role ?? '');
  const canManage =
    organizationRole === 'owner' ||
    organizationRole === 'admin' ||
    salesRole === 'manager';

  if (!canManage) {
    return { canManage: false, targets: [] as AssignmentTarget[] };
  }

  const [membershipsResult, workspaceMembershipsResult] = await Promise.all([
    supabase
      .from('organization_members')
      .select('user_id,role')
      .eq('organization_id', organizationId)
      .eq('active', true),
    supabase
      .from('workspace_memberships')
      .select('user_id,role')
      .eq('organization_id', organizationId)
      .eq('workspace_code', 'sales')
      .eq('active', true)
      .in('role', ['manager', 'member']),
  ]);

  if (membershipsResult.error || workspaceMembershipsResult.error) {
    return { canManage: true, targets: [] as AssignmentTarget[] };
  }

  const salesRoles = new Map(
    (workspaceMembershipsResult.data ?? []).map((row) => [String(row.user_id), String(row.role)]),
  );

  const eligible = (membershipsResult.data ?? []).filter((row) => {
    const role = String(row.role ?? '');
    return role === 'owner' || role === 'admin' || salesRoles.has(String(row.user_id));
  });

  const ids = Array.from(new Set(eligible.map((row) => String(row.user_id))));
  if (!ids.length) {
    return { canManage: true, targets: [] as AssignmentTarget[] };
  }

  const { data: profiles, error: profileError } = await supabase
    .from('profiles')
    .select('id,full_name,active')
    .in('id', ids)
    .eq('active', true);

  if (profileError) {
    return { canManage: true, targets: [] as AssignmentTarget[] };
  }

  const names = new Map(
    (profiles ?? []).map((profile) => [
      String(profile.id),
      String(profile.full_name ?? '').trim() || 'CRM User',
    ]),
  );

  const targets = eligible
    .map((row) => {
      const id = String(row.user_id);
      const organizationRole = String(row.role ?? 'member');
      return {
        id,
        name: names.get(id) ?? 'CRM User',
        role: organizationRole === 'owner' || organizationRole === 'admin'
          ? organizationRole
          : salesRoles.get(id) ?? organizationRole,
      };
    })
    .filter((row) => names.has(row.id))
    .sort((left, right) => left.name.localeCompare(right.name));

  return { canManage: true, targets };
}

export async function TeamAssignmentPanel({ returnTo }: { returnTo: '/leads' | '/pipeline' }) {
  const context = await getAssignmentContext();
  if (!context.canManage) return null;

  const queue = await getTeamAssignmentQueue(8).catch(() => ({ total: 0, leads: [] }));

  return (
    <details className="group rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3.5 marker:hidden">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">
          <UserRoundCheck size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-slate-900 dark:text-white">Team lead assignment</div>
          <div className="mt-0.5 text-xs text-slate-500">
            {queue.total.toLocaleString()} unassigned lead{queue.total === 1 ? '' : 's'} · assign, rebalance or review workload
          </div>
        </div>
        <span className="text-xs font-semibold text-violet-700 dark:text-violet-300">Open</span>
      </summary>

      <div className="border-t border-slate-100 p-4 dark:border-slate-800">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-bold uppercase tracking-[.12em] text-slate-400">Assignment queue</div>
            <p className="mt-1 text-xs leading-5 text-slate-500">Uses the same tenant-safe ownership RPC as Admissions and Team Performance.</p>
          </div>
          <Link href="/team-performance" className="btn-secondary">
            <UsersRound size={14} /> Team performance
          </Link>
        </div>

        {!context.targets.length ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-medium text-amber-800">
            No active Sales assignment targets are available. Add or activate staff in Team & Access first.
          </div>
        ) : queue.leads.length ? (
          <div className="space-y-2">
            {queue.leads.map((lead) => (
              <form
                key={lead.id}
                action={assignLeadOwnerAction}
                className="grid gap-3 rounded-xl border border-slate-100 bg-slate-50/70 p-3 md:grid-cols-[minmax(0,1fr)_220px_auto] md:items-center dark:border-slate-800 dark:bg-slate-900/50"
              >
                <input type="hidden" name="lead_id" value={lead.id} />
                <input type="hidden" name="return_to" value={returnTo} />
                <div className="min-w-0">
                  <Link href={`/leads/${lead.id}`} className="truncate text-sm font-semibold text-slate-900 hover:text-violet-700 dark:text-white">
                    {lead.leadName || lead.leadCode}
                  </Link>
                  <div className="mt-1 truncate text-[11px] text-slate-500">
                    {lead.leadCode} · {lead.currentStage.replaceAll('_', ' ')}{lead.courseName ? ` · ${lead.courseName}` : ''}
                  </div>
                </div>
                <select name="owner_user_id" required defaultValue="" className="input w-full text-xs">
                  <option value="" disabled>Select team member</option>
                  {context.targets.map((target) => (
                    <option key={target.id} value={target.id}>
                      {target.name} · {target.role}
                    </option>
                  ))}
                </select>
                <button type="submit" className="btn-primary justify-center">
                  <ArrowRightLeft size={14} /> Assign
                </button>
              </form>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-medium text-emerald-800">
            No unassigned leads are waiting right now.
          </div>
        )}
      </div>
    </details>
  );
}
