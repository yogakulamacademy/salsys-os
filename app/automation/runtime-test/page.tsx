import { CheckCircle2, FlaskConical, ShieldCheck, Zap } from 'lucide-react';

import {
  activateWorkflowForControlledTestAction,
  runControlledFollowupTestAction,
} from '@/app/automation/runtime-test/actions';
import { PageHeader } from '@/components/ui';
import { createClient } from '@/lib/supabase/server';
import { getCurrentWorkspaceContext } from '@/lib/workspace';

type Workflow = {
  id: string;
  name: string;
  status: 'draft' | 'active' | 'paused' | 'archived';
};

type Lead = {
  id: string;
  display_name: string | null;
  current_contact_channel: string | null;
  current_stage: string | null;
};

export default async function AutomationRuntimeTestPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const query = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let workflows: Workflow[] = [];
  let leads: Lead[] = [];
  let organizationName = 'Current organization';
  let canManage = false;

  if (user) {
    const workspace = await getCurrentWorkspaceContext(supabase);
    const organizationId = workspace.activeOrganizationId;
    organizationName = workspace.activeWorkspace?.organizationName || organizationName;

    if (organizationId) {
      const [{ data: manageData }, { data: workflowRows }, { data: leadRows }] = await Promise.all([
        supabase.rpc('can_manage_organization', { p_organization_id: organizationId }),
        supabase
          .from('automation_workflows')
          .select('id,name,status')
          .eq('organization_id', organizationId)
          .neq('status', 'archived')
          .order('updated_at', { ascending: false }),
        supabase
          .from('leads')
          .select('id,display_name,current_contact_channel,current_stage')
          .eq('organization_id', organizationId)
          .order('updated_at', { ascending: false })
          .limit(25),
      ]);

      canManage = manageData === true;
      workflows = (workflowRows ?? []) as Workflow[];
      leads = (leadRows ?? []) as Lead[];
    }
  }

  const draftWorkflow = workflows.find((workflow) => workflow.status === 'draft');
  const activeWorkflow = workflows.find((workflow) => workflow.status === 'active');

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Automation · Controlled Test"
        title="Smart Trigger Runtime Test"
        description={`Validate deterministic workflow execution for ${organizationName} without enabling automatic event processing or customer messaging.`}
      />

      {query.notice ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
          {query.notice}
        </div>
      ) : null}

      {query.error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">
          {query.error}
        </div>
      ) : null}

      <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4 text-sm leading-6 text-violet-900">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 shrink-0" size={18} />
          <div>
            <strong>Controlled mode:</strong> this page can activate a workflow for testing and execute it only when you press the test button. There is still no background event listener and no customer auto-send.
          </div>
        </div>
      </div>

      {!canManage ? (
        <div className="card-pad text-sm text-slate-600">Organization admin access is required.</div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-2">
          <section className="card-pad">
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-700">
                <Zap size={18} />
              </div>
              <div>
                <h2 className="font-bold text-slate-950">1. Activate for controlled testing</h2>
                <p className="mt-1 text-sm text-slate-500">Activation makes the definition runtime-eligible, but nothing runs in the background yet.</p>
              </div>
            </div>

            {draftWorkflow ? (
              <form action={activateWorkflowForControlledTestAction} className="mt-5 space-y-4">
                <input type="hidden" name="workflow_id" value={draftWorkflow.id} />
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="text-sm font-bold text-slate-900">{draftWorkflow.name}</div>
                  <div className="mt-1 text-xs font-semibold uppercase tracking-wide text-amber-700">Draft</div>
                </div>
                <button type="submit" className="btn-primary">Activate controlled test workflow</button>
              </form>
            ) : activeWorkflow ? (
              <div className="mt-5 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
                <CheckCircle2 size={16} />
                {activeWorkflow.name} is active for controlled testing.
              </div>
            ) : (
              <div className="mt-5 text-sm text-slate-500">Create a draft workflow in Smart Triggers first.</div>
            )}
          </section>

          <section className="card-pad">
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-700">
                <FlaskConical size={18} />
              </div>
              <div>
                <h2 className="font-bold text-slate-950">2. Run one deterministic test</h2>
                <p className="mt-1 text-sm text-slate-500">Creates one internal follow-up task for the selected lead. Running the same workflow/lead test again must deduplicate.</p>
              </div>
            </div>

            {activeWorkflow ? (
              <form action={runControlledFollowupTestAction} className="mt-5 space-y-4">
                <input type="hidden" name="workflow_id" value={activeWorkflow.id} />
                <label className="block">
                  <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Test lead</span>
                  <select name="lead_id" required className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900">
                    <option value="">Select a lead</option>
                    {leads.map((lead) => (
                      <option key={lead.id} value={lead.id}>
                        {(lead.display_name || 'Unnamed lead')} · {(lead.current_contact_channel || 'unknown')} · {(lead.current_stage || 'unknown')}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-xs leading-5 text-amber-800">
                  This test can create an internal CRM follow-up task. It cannot send Instagram, WhatsApp, email, SMS, or any other customer message.
                </div>
                <button type="submit" className="btn-primary">
                  <FlaskConical size={15} />
                  Run controlled test
                </button>
              </form>
            ) : (
              <div className="mt-5 text-sm text-slate-500">Activate the workflow first.</div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
