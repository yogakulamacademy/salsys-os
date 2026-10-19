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

import { installSmartTriggerRecipeAction } from '@/app/automation/recipes/actions';
import { PageHeader } from '@/components/ui';
import { createClient } from '@/lib/supabase/server';
import { getCurrentWorkspaceContext } from '@/lib/workspace';

type Recipe = {
  key: string;
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
    key: 'new_lead_response_sla',
    name: 'New lead response SLA',
    description: 'Create an immediate internal follow-up whenever a new lead enters SalsysOS.',
    eventName: 'lead.created',
    followupTitle: 'Respond to new lead',
    delayMinutes: 0,
    icon: UserPlus,
    useCase: 'Lead capture → salesperson task',
  },
  {
    key: 'inbound_message_review',
    name: 'Inbound message review',
    description: 'Create a reply task whenever an inbound customer message is recorded.',
    eventName: 'message.received',
    followupTitle: 'Review and reply to inbound message',
    delayMinutes: 0,
    icon: Inbox,
    useCase: 'Inbound message → human response queue',
  },
  {
    key: 'payment_pending_followup',
    name: 'Payment pending follow-up',
    description: 'Create a controlled follow-up task one hour after a payment-pending event.',
    eventName: 'payment.pending',
    followupTitle: 'Follow up on pending payment',
    delayMinutes: 60,
    icon: CreditCard,
    useCase: 'Payment pending → admissions follow-up',
  },
  {
    key: 'lead_stage_change_review',
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

export default async function AutomationRecipesPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const query = await searchParams;
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
  let installedRecipeKeys = new Set<string>();
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
            .select('metadata')
            .eq('organization_id', organizationId)
            .neq('status', 'archived'),
        ]);

      if (manageError || workflowError) throw manageError || workflowError;
      canManage = manageData === true;
      installedRecipeKeys = new Set(
        (workflowRows ?? [])
          .map((row) => {
            const metadata = row.metadata && typeof row.metadata === 'object'
              ? (row.metadata as Record<string, unknown>)
              : {};
            return typeof metadata.recipe_key === 'string' ? metadata.recipe_key : '';
          })
          .filter(Boolean),
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

      {query.notice ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
          {query.notice}
        </div>
      ) : null}

      {query.error || loadError ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">
          {query.error || loadError}
        </div>
      ) : null}

      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm leading-6 text-emerald-900">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 shrink-0" size={18} />
          <div>
            <strong>Draft-only safety:</strong> recipe definitions are allowlisted on the server. Installing one creates a tenant-scoped workflow with human-review defaults, runtime explicitly OFF, and an internal follow-up action only.
          </div>
        </div>
      </div>

      <section className="grid gap-5 xl:grid-cols-2">
        {recipes.map((recipe) => {
          const Icon = recipe.icon;
          const alreadyExists = installedRecipeKeys.has(recipe.key);

          return (
            <article key={recipe.key} className="card-pad space-y-4">
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
                <form action={installSmartTriggerRecipeAction}>
                  <input type="hidden" name="recipe_key" value={recipe.key} />
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
