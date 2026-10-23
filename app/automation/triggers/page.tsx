import { SmartTriggerBuilder } from '@/app/automation/triggers/smart-trigger-builder';
import { getSupabasePublicConfig, useMockData } from '@/lib/config';
import { createClient } from '@/lib/supabase/server';
import { getCurrentWorkspaceContext } from '@/lib/workspace';

type Workflow = {
  id: string;
  name: string;
  description: string | null;
  status: 'draft' | 'active' | 'paused' | 'archived';
  updated_at: string;
};

type WorkflowTrigger = {
  workflow_id: string;
  event_name: string | null;
  enabled: boolean;
  config: Record<string, unknown> | null;
};

type WorkflowAction = {
  workflow_id: string;
  action_type: string;
  requires_approval: boolean;
  config: Record<string, unknown> | null;
};

export default async function SmartTriggersPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const query = await searchParams;
  const { configured } = getSupabasePublicConfig();
  const live = !useMockData && configured;

  let workflows: Workflow[] = [];
  let triggers: WorkflowTrigger[] = [];
  let actions: WorkflowAction[] = [];
  let runs = 0;
  let canManage = false;
  let loadError: string | null = null;

  if (live) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      try {
        const workspace = await getCurrentWorkspaceContext(supabase);
        const organizationId = workspace.activeOrganizationId;

        if (organizationId) {
          const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
          const [
            { data: manageData, error: manageError },
            { data: workflowRows, error: workflowError },
            { data: triggerRows, error: triggerError },
            { data: actionRows, error: actionError },
            { count: runCount, error: runError },
          ] = await Promise.all([
            supabase.rpc('can_manage_organization', { p_organization_id: organizationId }),
            supabase
              .from('automation_workflows')
              .select('id,name,description,status,updated_at')
              .eq('organization_id', organizationId)
              .order('updated_at', { ascending: false }),
            supabase
              .from('automation_triggers')
              .select('workflow_id,event_name,enabled,config')
              .eq('organization_id', organizationId),
            supabase
              .from('automation_actions')
              .select('workflow_id,action_type,requires_approval,config')
              .eq('organization_id', organizationId)
              .eq('enabled', true),
            supabase
              .from('automation_runs')
              .select('id', { count: 'exact', head: true })
              .eq('organization_id', organizationId)
              .gte('created_at', sevenDaysAgo),
          ]);

          canManage = manageData === true;
          const error = manageError || workflowError || triggerError || actionError || runError;
          if (error) {
            loadError = error.message;
          } else {
            workflows = (workflowRows ?? []) as Workflow[];
            triggers = (triggerRows ?? []) as WorkflowTrigger[];
            actions = (actionRows ?? []) as WorkflowAction[];
            runs = runCount ?? 0;
          }
        }
      } catch (error) {
        loadError = error instanceof Error ? error.message : 'Unable to load Smart Triggers.';
      }
    }
  }

  return (
    <div className="space-y-4">
      {query.notice ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
          {query.notice}
        </div>
      ) : null}
      {query.error || loadError ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">
          {query.error || loadError}
        </div>
      ) : null}
      {!live ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Smart Triggers are in mock mode. The builder can be reviewed, but draft writes are disabled.
        </div>
      ) : null}
      <SmartTriggerBuilder
        workflows={workflows}
        triggers={triggers}
        actions={actions}
        runs={runs}
        canManage={canManage}
      />
    </div>
  );
}