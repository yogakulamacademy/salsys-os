import { TemplateCreateButton } from '@/app/automation/templates/template-create-button';
import {
  TemplateWorkspace,
  type TemplateSyncRunRow,
  type TemplateWorkspaceRow,
} from '@/app/automation/templates/template-workspace';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { getCurrentWorkspaceContext } from '@/lib/workspace';

type AccountRow = {
  id: string;
  display_phone_number: string | null;
  active: boolean;
  is_default: boolean;
};

export default async function WhatsAppTemplatesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
        Sign in to manage WhatsApp templates.
      </div>
    );
  }

  let role: string | null = null;
  let account: AccountRow | null = null;
  let templates: TemplateWorkspaceRow[] = [];
  let latestSync: TemplateSyncRunRow | null = null;
  let loadError: string | null = null;

  try {
    const workspace = await getCurrentWorkspaceContext(supabase);
    const organizationId = workspace.activeOrganizationId;
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
      templates = (templateResult.data ?? []) as TemplateWorkspaceRow[];
      latestSync = (syncResult.data ?? null) as TemplateSyncRunRow | null;
    }
  } catch (error) {
    loadError = error instanceof Error ? error.message : 'Unable to load WhatsApp template workspace.';
  }

  const canManage = role ? ['owner', 'admin'].includes(role) : false;
  const canCreate = canManage && Boolean(account);

  return (
    <div className="space-y-4">
      {loadError ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">
          WhatsApp template data is temporarily unavailable. Refresh the page or open Provider Health if the problem continues.
        </div>
      ) : null}

      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-bold text-slate-900">Create templates in SalsysOS</div>
          <div className="mt-0.5 text-xs leading-5 text-slate-500">
            Submit a text template directly to Meta, then synchronize its approval status back into this workspace.
          </div>
        </div>
        <TemplateCreateButton disabled={!canCreate} />
      </div>

      <TemplateWorkspace
        templates={templates}
        latestSync={latestSync}
        accountPhone={account?.display_phone_number ?? null}
        accountConnected={Boolean(account)}
        canSync={canManage}
      />
    </div>
  );
}
