import type { ReactNode } from 'react';
import {
  CheckCircle2,
  Clock3,
  FileText,
  GitBranch,
  Zap,
} from 'lucide-react';

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

type MetricTone = 'triggers' | 'active' | 'drafts' | 'runs' | 'approval';

const metricTones: Record<MetricTone, { icon: string; bars: string }> = {
  triggers: {
    icon: 'bg-[#eef7f3] text-[#23654f]',
    bars: 'bg-[#d9ccff]',
  },
  active: {
    icon: 'bg-[#e9faf3] text-[#1f9b6b]',
    bars: 'bg-[#a7efd4]',
  },
  drafts: {
    icon: 'bg-[#fff8e7] text-[#c98724]',
    bars: 'bg-[#ffe099]',
  },
  runs: {
    icon: 'bg-[#edf8ff] text-[#2487ba]',
    bars: 'bg-[#a9e5ff]',
  },
  approval: {
    icon: 'bg-[#fff0f2] text-[#df5671]',
    bars: 'bg-[#ffc4cf]',
  },
};

function MetricCard({
  label,
  value,
  note,
  icon,
  tone,
}: {
  label: string;
  value: number;
  note: string;
  icon: ReactNode;
  tone: MetricTone;
}) {
  const styles = metricTones[tone];
  const heights = [9, 14, 11, 19, 15, 24, 17];

  return (
    <article className="min-h-[150px] rounded-[14px] border border-[#dce6df] bg-white p-4 shadow-[0_2px_8px_rgba(16,50,38,0.045)]">
      <div className="flex items-start justify-between gap-4">
        <div
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-[10px] ${styles.icon}`}
        >
          {icon}
        </div>
        <div
          className="flex h-7 items-end gap-[3px]"
          aria-hidden="true"
        >
          {heights.map((height, index) => (
            <span
              key={`${label}-${index}`}
              className={`w-[3px] rounded-full ${styles.bars}`}
              style={{ height }}
            />
          ))}
        </div>
      </div>

      <div className="mt-3 text-[11px] font-semibold text-[#667d71]">
        {label}
      </div>
      <div className="mt-1 text-[26px] font-bold leading-none tracking-[-0.04em] text-[#163f33]">
        {value}
      </div>
      <div className="mt-3 text-[11px] text-[#799085]">
        {note}
      </div>
    </article>
  );
}

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
  let awaitingApproval = 0;
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
          const [
            { data: manageData, error: manageError },
            { data: workflowRows, error: workflowError },
            { data: triggerRows, error: triggerError },
            { data: actionRows, error: actionError },
            { count: runCount, error: runError },
            { count: approvalCount, error: approvalError },
          ] = await Promise.all([
            supabase.rpc('can_manage_organization', {
              p_organization_id: organizationId,
            }),
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
              .eq('organization_id', organizationId),
            supabase
              .from('automation_runs')
              .select('id', { count: 'exact', head: true })
              .eq('organization_id', organizationId)
              .eq('status', 'awaiting_approval'),
          ]);

          canManage = manageData === true;
          const error =
            manageError ||
            workflowError ||
            triggerError ||
            actionError ||
            runError ||
            approvalError;

          if (error) {
            loadError = error.message;
          } else {
            workflows = (workflowRows ?? []) as Workflow[];
            triggers = (triggerRows ?? []) as WorkflowTrigger[];
            actions = (actionRows ?? []) as WorkflowAction[];
            runs = runCount ?? 0;
            awaitingApproval = approvalCount ?? 0;
          }
        }
      } catch (error) {
        loadError =
          error instanceof Error
            ? error.message
            : 'Unable to load Smart Triggers.';
      }
    }
  }

  const configuredWorkflows = workflows.filter(
    (workflow) => workflow.status !== 'archived',
  );
  const active = configuredWorkflows.filter(
    (workflow) => workflow.status === 'active',
  ).length;
  const drafts = configuredWorkflows.filter(
    (workflow) => workflow.status === 'draft',
  ).length;

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

      <section
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5"
        aria-label="Smart Trigger summary"
      >
        <MetricCard
          label="Triggers"
          value={configuredWorkflows.length}
          note="Configured triggers"
          icon={<GitBranch size={17} />}
          tone="triggers"
        />
        <MetricCard
          label="Active"
          value={active}
          note="Currently active"
          icon={<CheckCircle2 size={17} />}
          tone="active"
        />
        <MetricCard
          label="Drafts"
          value={drafts}
          note="Complete and review"
          icon={<FileText size={17} />}
          tone="drafts"
        />
        <MetricCard
          label="Runs"
          value={runs}
          note="Recorded executions"
          icon={<Zap size={17} />}
          tone="runs"
        />
        <MetricCard
          label="Awaiting approval"
          value={awaitingApproval}
          note="Requires human review"
          icon={<Clock3 size={17} />}
          tone="approval"
        />
      </section>

      <div className="[&>div>section:first-of-type]:hidden">
        <SmartTriggerBuilder
          workflows={workflows}
          triggers={triggers}
          actions={actions}
          runs={runs}
          canManage={canManage}
        />
      </div>
    </div>
  );
}
