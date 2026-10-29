import { UserRoundCheck } from 'lucide-react';

import { assignLeadOwnerAction } from '@/app/actions/lead-assignment';
import { createClient } from '@/lib/supabase/server';
import { requireCurrentOrganizationId } from '@/lib/workspace';

type Target = {
  id: string;
  name: string;
  role: string;
};

export async function LeadOwnerControl({ leadId }: { leadId: string }) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) return null;

  const organizationId = await requireCurrentOrganizationId(supabase, user.id);
  const [currentMembershipResult, currentWorkspaceResult, leadResult] = await Promise.all([
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
    supabase
      .from('leads')
      .select('id,owner_user_id,organization_id')
      .eq('id', leadId)
      .eq('organization_id', organizationId)
      .maybeSingle(),
  ]);

  const organizationRole = String(currentMembershipResult.data?.role ?? '');
  const salesRole = String(currentWorkspaceResult.data?.role ?? '');
  const canManage =
    organizationRole === 'owner' ||
    organizationRole === 'admin' ||
    salesRole === 'manager';

  if (!canManage || leadResult.error || !leadResult.data) return null;

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

  if (membershipsResult.error || workspaceMembershipsResult.error) return null;

  const salesRoles = new Map(
    (workspaceMembershipsResult.data ?? []).map((row) => [String(row.user_id), String(row.role)]),
  );
  const eligible = (membershipsResult.data ?? []).filter((row) => {
    const role = String(row.role ?? '');
    return role === 'owner' || role === 'admin' || salesRoles.has(String(row.user_id));
  });
  const ids = Array.from(new Set(eligible.map((row) => String(row.user_id))));

  const { data: profiles } = ids.length
    ? await supabase
        .from('profiles')
        .select('id,full_name,active')
        .in('id', ids)
        .eq('active', true)
    : { data: [] as Array<{ id: string; full_name: string | null; active: boolean }> };

  const names = new Map(
    (profiles ?? []).map((profile) => [
      String(profile.id),
      String(profile.full_name ?? '').trim() || 'CRM User',
    ]),
  );

  const targets: Target[] = eligible
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

  const currentOwnerId = leadResult.data.owner_user_id ? String(leadResult.data.owner_user_id) : '';
  const currentOwner = targets.find((target) => target.id === currentOwnerId);

  return (
    <section className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">
            <UserRoundCheck size={18} />
          </span>
          <div>
            <div className="text-xs font-bold uppercase tracking-[.12em] text-slate-400">Lead ownership</div>
            <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
              Assigned to {currentOwner?.name ?? 'Unassigned'}
            </div>
            <div className="mt-1 text-xs text-slate-500">Reassignment also syncs open conversations and follow-up work.</div>
          </div>
        </div>

        <form action={assignLeadOwnerAction} className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input type="hidden" name="lead_id" value={leadId} />
          <input type="hidden" name="return_to" value={`/leads/${leadId}`} />
          <select
            name="owner_user_id"
            defaultValue={currentOwnerId || 'unassigned'}
            className="input min-w-[220px] text-xs"
          >
            <option value="unassigned">Unassigned</option>
            {targets.map((target) => (
              <option key={target.id} value={target.id}>
                {target.name} · {target.role}
              </option>
            ))}
          </select>
          <button type="submit" className="btn-primary justify-center">Update owner</button>
        </form>
      </div>
    </section>
  );
}
