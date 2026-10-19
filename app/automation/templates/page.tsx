import Link from 'next/link';
import {
  CheckCircle2,
  Clock3,
  ExternalLink,
  MessageSquareText,
  ShieldCheck,
  Smartphone,
  XCircle,
} from 'lucide-react';

import { TemplateSyncButton } from '@/app/automation/templates/template-sync-button';
import { PageHeader } from '@/components/ui';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { getCurrentWorkspaceContext } from '@/lib/workspace';

type TemplateRow = {
  id: string;
  whatsapp_account_id: string;
  template_name: string;
  language_code: string;
  category: string | null;
  approval_status: string;
  provider_status_raw: string | null;
  parameter_schema: Record<string, unknown> | null;
  active: boolean;
  last_synced_at: string;
};

type SyncRunRow = {
  id: string;
  status: string;
  pages_fetched: number;
  templates_seen: number;
  templates_upserted: number;
  templates_deactivated: number;
  provider_error: string | null;
  started_at: string;
  finished_at: string | null;
};

type AccountRow = {
  id: string;
  display_phone_number: string | null;
  active: boolean;
  is_default: boolean;
};

function statusClass(status: string) {
  if (status === 'approved' || status === 'completed') {
    return 'bg-emerald-50 text-emerald-700 ring-emerald-200';
  }
  if (status === 'pending' || status === 'running') {
    return 'bg-amber-50 text-amber-700 ring-amber-200';
  }
  if (status === 'rejected' || status === 'failed' || status === 'disabled') {
    return 'bg-rose-50 text-rose-700 ring-rose-200';
  }
  return 'bg-slate-100 text-slate-600 ring-slate-200';
}

function variableSummary(schema: Record<string, unknown> | null) {
  if (!schema) return 'No variables';
  const body = Number(schema.body_variable_count ?? 0);
  const header = Number(schema.header_variable_count ?? 0);
  const total = (Number.isFinite(body) ? body : 0) + (Number.isFinite(header) ? header : 0);
  return total === 0 ? 'No variables' : `${total} variable${total === 1 ? '' : 's'}`;
}

export default async function WhatsAppTemplatesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="card-pad">
        <p className="text-sm text-slate-600">Sign in to manage WhatsApp templates.</p>
      </div>
    );
  }

  let organizationName = 'Current organization';
  let role: string | null = null;
  let account: AccountRow | null = null;
  let templates: TemplateRow[] = [];
  let latestSync: SyncRunRow | null = null;
  let loadError: string | null = null;

  try {
    const workspace = await getCurrentWorkspaceContext(supabase);
    const organizationId = workspace.activeOrganizationId;
    organizationName = workspace.activeWorkspace?.organizationName || organizationName;
    role = workspace.activeWorkspace?.role || null;

    if (organizationId) {
      const admin = createAdminClient();
      const [accountResult, templateResult, syncResult] = await Promise.all([
        admin
          .from('whatsapp_accounts')
          .select('id,display_phone_number,active,is_default')
          .eq('organization_id', organizationId)
          .eq('active', true)
          .eq('is_default', true)
          .maybeSingle(),
        admin
          .from('automation_whatsapp_templates')
          .select(
            'id,whatsapp_account_id,template_name,language_code,category,approval_status,provider_status_raw,parameter_schema,active,last_synced_at',
          )
          .eq('organization_id', organizationId)
          .order('active', { ascending: false })
          .order('approval_status', { ascending: true })
          .order('template_name', { ascending: true })
          .limit(500),
        admin
          .from('automation_whatsapp_template_sync_runs')
          .select(
            'id,status,pages_fetched,templates_seen,templates_upserted,templates_deactivated,provider_error,started_at,finished_at',
          )
          .eq('organization_id', organizationId)
          .order('started_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      const error = accountResult.error || templateResult.error || syncResult.error;
      if (error) throw error;

      account = (accountResult.data ?? null) as AccountRow | null;
      templates = (templateResult.data ?? []) as TemplateRow[];
      latestSync = (syncResult.data ?? null) as SyncRunRow | null;
    }
  } catch (error) {
    loadError = error instanceof Error ? error.message : 'Unable to load WhatsApp template workspace.';
  }

  const canSync = role ? ['owner', 'admin'].includes(role) : false;
  const activeTemplates = templates.filter((row) => row.active);
  const approvedTemplates = activeTemplates.filter((row) => row.approval_status === 'approved');
  const pendingTemplates = activeTemplates.filter((row) => row.approval_status === 'pending');
  const rejectedTemplates = activeTemplates.filter((row) => row.approval_status === 'rejected');

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Automation"
        title="WhatsApp templates"
        description={`Synchronize Meta-approved templates for ${organizationName}. Synchronization reads template metadata only and never sends a customer message.`}
      />

      {loadError ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">
          {loadError}
        </div>
      ) : null}

      <section className="grid gap-4 md:grid-cols-4">
        <div className="card-pad">
          <div className="text-xs font-bold uppercase tracking-wide text-slate-400">Approved + active</div>
          <div className="mt-2 text-2xl font-bold text-slate-950">{approvedTemplates.length}</div>
          <div className="mt-1 text-xs text-slate-500">Eligible for guarded template actions</div>
        </div>
        <div className="card-pad">
          <div className="text-xs font-bold uppercase tracking-wide text-slate-400">Pending</div>
          <div className="mt-2 text-2xl font-bold text-slate-950">{pendingTemplates.length}</div>
          <div className="mt-1 text-xs text-slate-500">Awaiting provider approval</div>
        </div>
        <div className="card-pad">
          <div className="text-xs font-bold uppercase tracking-wide text-slate-400">Rejected</div>
          <div className="mt-2 text-2xl font-bold text-slate-950">{rejectedTemplates.length}</div>
          <div className="mt-1 text-xs text-slate-500">Not eligible for automation sends</div>
        </div>
        <div className="card-pad">
          <div className="text-xs font-bold uppercase tracking-wide text-slate-400">Default account</div>
          <div className="mt-2 flex items-center gap-2 text-sm font-bold text-slate-950">
            <Smartphone size={16} />
            {account?.display_phone_number || (account ? 'Connected' : 'Not resolved')}
          </div>
          <div className="mt-2 text-xs text-slate-500">Active default WhatsApp sender</div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.05fr_.95fr]">
        <div className="card-pad">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <MessageSquareText size={18} className="text-violet-600" />
                <h2 className="text-base font-bold text-slate-950">Meta template synchronization</h2>
              </div>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                Pull the complete template catalog from the WhatsApp Business Account bound to the active default sender. Missing templates from a complete sync are safely deactivated locally.
              </p>
            </div>
            <TemplateSyncButton disabled={!canSync || !account} />
          </div>

          {!canSync ? (
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-600">
              Only workspace owners and admins can synchronize provider templates.
            </div>
          ) : null}
          {!account ? (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-xs text-amber-800">
              Connect and select a default WhatsApp account before template synchronization.
            </div>
          ) : null}

          <div className="mt-5 flex flex-wrap gap-2">
            <Link
              href="/settings/integrations"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Manage WhatsApp connection <ExternalLink size={14} />
            </Link>
            <Link
              href="/automation/flow-builder"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Use in Flow Builder <ExternalLink size={14} />
            </Link>
          </div>
        </div>

        <div className="card-pad">
          <div className="flex items-center gap-2">
            <Clock3 size={18} className="text-slate-500" />
            <h2 className="text-base font-bold text-slate-950">Latest sync</h2>
          </div>
          {latestSync ? (
            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-slate-600">Status</span>
                <span className={`rounded-full px-2.5 py-1 text-xs font-bold ring-1 ring-inset ${statusClass(latestSync.status)}`}>
                  {latestSync.status.replaceAll('_', ' ')}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-slate-50 px-2 py-3">
                  <div className="text-lg font-bold text-slate-950">{latestSync.templates_seen}</div>
                  <div className="text-[11px] text-slate-500">Seen</div>
                </div>
                <div className="rounded-xl bg-slate-50 px-2 py-3">
                  <div className="text-lg font-bold text-slate-950">{latestSync.templates_upserted}</div>
                  <div className="text-[11px] text-slate-500">Updated</div>
                </div>
                <div className="rounded-xl bg-slate-50 px-2 py-3">
                  <div className="text-lg font-bold text-slate-950">{latestSync.templates_deactivated}</div>
                  <div className="text-[11px] text-slate-500">Deactivated</div>
                </div>
              </div>
              <p className="text-xs leading-5 text-slate-500">
                Started {new Date(latestSync.started_at).toLocaleString('en-IN')}
                {latestSync.finished_at ? ` · Finished ${new Date(latestSync.finished_at).toLocaleString('en-IN')}` : ''}
              </p>
              {latestSync.provider_error ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-3 text-xs leading-5 text-rose-800">
                  {latestSync.provider_error}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="mt-4 rounded-xl bg-slate-50 px-4 py-4 text-sm text-slate-500">
              No template synchronization has been recorded for this workspace yet.
            </div>
          )}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-950">Synchronized template catalog</h2>
            <p className="mt-1 text-sm text-slate-500">Provider status remains authoritative; only approved, active templates are eligible at the WhatsApp policy boundary.</p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
            <ShieldCheck size={14} />
            Sync never sends customer messages
          </div>
        </div>

        {templates.length === 0 ? (
          <div className="card-pad text-sm text-slate-500">
            No synchronized WhatsApp templates yet. Run a Meta sync after confirming the workspace connection.
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Template</th>
                    <th className="px-4 py-3">Language</th>
                    <th className="px-4 py-3">Category</th>
                    <th className="px-4 py-3">Parameters</th>
                    <th className="px-4 py-3">Provider status</th>
                    <th className="px-4 py-3">Local state</th>
                    <th className="px-4 py-3">Last sync</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {templates.map((template) => (
                    <tr key={template.id} className={!template.active ? 'bg-slate-50/60 text-slate-400' : ''}>
                      <td className="px-4 py-3 font-semibold text-slate-900">{template.template_name}</td>
                      <td className="px-4 py-3 text-slate-600">{template.language_code}</td>
                      <td className="px-4 py-3 text-slate-600">{template.category || '—'}</td>
                      <td className="px-4 py-3 text-slate-600">{variableSummary(template.parameter_schema)}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ring-1 ring-inset ${statusClass(template.approval_status)}`}>
                          {template.approval_status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold">
                          {template.active ? (
                            <><CheckCircle2 size={14} className="text-emerald-600" /> Active</>
                          ) : (
                            <><XCircle size={14} className="text-slate-400" /> Inactive</>
                          )}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">
                        {new Date(template.last_synced_at).toLocaleString('en-IN')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
