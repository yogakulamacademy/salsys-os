import {
  Clock3,
  CreditCard,
  Inbox,
  ListChecks,
  ShieldCheck,
  Sparkles,
  UserPlus,
  Workflow,
} from 'lucide-react';

import { createSmartTriggerWorkflowAction } from '@/app/automation/actions';
import { PageHeader } from '@/components/ui';
import { createClient } from '@/lib/supabase/server';
import { getCurrentWorkspaceContext } from '@/lib/workspace';

type Recipe = {
  name: string;
  description: string;
  eventName: 'lead.created' | 'message.received' | 'lead.stage_changed' | 'payment.pending';
  followupTitle: string;
  delayMinutes: number;
  icon: typeof UserPlus;
  useCase: string;
};

const recipes: Recipe[] = [
  {
    name: 'New lead response SLA',
    description: 'Create an immediate internal follow-up whenever a new lead enters SalsysOS.',
    eventName: 'lead.created',
    followupTitle: 'Respond to new lead',
    delayMinutes: 0,
    icon: UserPlus,
    useCase: 'Lead capture → salesperson task',
  },
  {
    name: 'Inbound message review',
    description: 'Create a reply task whenever an inbound customer message is recorded.',
    eventName: 'message.received',
    followupTitle: 'Review and reply to inbound message',
    delayMinutes: 0,
    icon: Inbox,
    useCase: 'Inbound message → human response queue',
  },
  {
    name: 'Payment pending follow-up',
    description: 'Create a controlled follow-up task one hour after a payment-pending event.',
    eventName: 'payment.pending',
    followupTitle: 'Follow up on pending payment',
    delayMinutes: 60,
    icon: CreditCard,
    useCase: 'Payment pending → admissions follow-up',
  },
  {
    name: 'Lead stage change review',
    description: 'Create an internal review task whenever a lead changes stage.',
    eventName: 'lead.stage_changed',
    followupTitle: 'Review lead stage change',
    delayMinutes: 0,
    icon: Workflow,
    useCase: 'Pipeline change → deterministic review task',
  },
];

function prettyEvent(eventName: Recipe['eventName']) {
  if (eventName === 'lead.created') return 'New lead created';
  if (eventName === 'message.received') return 'Inbound message received';
  if (eventName === 'lead.stage_changed') return 'Lead stage changed';
  return 'Payment pending';
}

export default async function AutomationRecipesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="card-pad">
        <p className="text-sm text-slate-600">Sign in to use Smart Trigger recipes.</p>
      </div>
    );
  }

  let organizationName = 'Current organization';
  let canManage = false;
  let existingNames = new Set<string>();
  let loadError: string | null = null;

  try {
    const workspace = await getCurrentWorkspaceContext(supabase);
    const organizationId = workspace.activeOrganizationId;
    organizationName = workspace.activeWorkspace?.organizationName || organizationName;

    if (organizationId) {
      const [{ data: manageData, error: manageError }, { data: workflowRows, error: workflowError }] =
        await Promise.all([
          supabase.rpc('can_manage_organization', { p_organization_id: organizationId }),
          supabase
            .from('automation_workflows')
            .select('name')
            .eq('organization_id', organizationId)
            .neq('status', 'archived'),
        ]);

      if (manageError || workflowError) throw manageError || workflowError;
      canManage = manageData === true;
      existingNames = new Set(
        (workflowRows ?? []).map((row) => String(row.name ?? '').trim().toLowerCase()).filter(Boolean),
      );
    }
  } catch (error) {
    loadError = error instanceof Error ? error.message : 'Unable to load starter recipes.';
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Automation"
        title="Starter recipes"
        description={`Create safe draft workflows for ${organizationName}. These recipes only create internal follow-up tasks; they do not send WhatsApp messages, call AI, or enable runtime execution.`}
      />

      {loadError ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">
          {loadError}
        </div>
      ) : null}

      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm leading-6 text-emerald-900">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 shrink-0" size={18} />
          <div>
            <strong>Draft-only safety:</strong> installing a recipe creates a tenant-scoped workflow definition with human-review defaults and an internal follow-up action. It remains non-executable until a validated flow is published and runtime is explicitly enabled.
          </div>
        </div>
      </div>

      <section className="grid gap-5 xl:grid-cols-2">
        {recipes.map((recipe) => {
          const Icon = recipe.icon;
          const alreadyExists = existingNames.has(recipe.name.toLowerCase());

          return (
            <article key={recipe.name} className="card-pad space-y-4">
              <div className="flex items-start gap-3">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-violet-50 text-violet-700">
                  <Icon size={19} />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-bold text-slate-950">{recipe.name}</h2>
                    {alreadyExists ? (
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600">
                        Already installed
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm leading-6 text-slate-500">{recipe.description}</p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">When</div>
                  <div className="mt-1 text-sm font-semibold text-slate-800">{prettyEvent(recipe.eventName)}</div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Then</div>
                  <div className="mt-1 flex items-center gap-2 text-sm font-semibold text-slate-800">
                    <ListChecks size={14} />
                    {recipe.followupTitle}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                <span className="inline-flex items-center gap-1.5">
                  <Clock3 size={13} />
                  {recipe.delayMinutes === 0 ? 'Immediate task' : `${recipe.delayMinutes}-minute delay`}
                </span>
                <span>·</span>
                <span>{recipe.useCase}</span>
              </div>

              {canManage ? (
                <form action={createSmartTriggerWorkflowAction}>
                  <input type="hidden" name="name" value={recipe.name} />
                  <input type="hidden" name="description" value={recipe.description} />
                  <input type="hidden" name="event_name" value={recipe.eventName} />
                  <input type="hidden" name="followup_title" value={recipe.followupTitle} />
                  <input type="hidden" name="followup_delay_minutes" value={String(recipe.delayMinutes)} />
                  <button
                    type="submit"
                    disabled={alreadyExists}
                    className="btn-primary disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Sparkles size={15} />
                    {alreadyExists ? 'Installed' : 'Install as draft'}
                  </button>
                </form>
              ) : (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-600">
                  Organization admin access is required to install recipes.
                </div>
              )}
            </article>
          );
        })}
      </section>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-600">
        <strong className="text-slate-900">Why these recipes do not send WhatsApp yet:</strong> provider-approved templates, message-policy checks, human approval, stop-on-reply, quiet hours, suppression checks and the provider kill switch belong to the published conversation-flow runtime. Starting with internal draft actions keeps the first installation reversible and auditable.
      </div>
    </div>
  );
}
