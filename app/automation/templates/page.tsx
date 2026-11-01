import {
  TemplateWorkspace,
  type TemplateSyncRunRow,
  type TemplateWorkspaceRow,
} from '@/app/automation/templates/template-workspace';
import { getWhatsAppSenderReadiness, type WhatsAppSenderReadiness } from '@/lib/integrations/whatsapp-sender-readiness';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { getCurrentWorkspaceContext } from '@/lib/workspace';

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
  let senderReadiness: WhatsAppSenderReadiness | null = null;
  let templates: TemplateWorkspaceRow[] = [];
  let latestSync: TemplateSyncRunRow | null = null;
  let loadError: string | null = null;

  try {
    const workspace = await getCurrentWorkspaceContext(supabase);
    const organizationId = workspace.activeOrganizationId;
    role = workspace.activeWorkspace?.role || null;

    if (organizationId) {
      const admin = createAdminClient();
      const [senderResult, templateResult, syncResult] = await Promise.all([
        getWhatsAppSenderReadiness(organizationId),
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

      const error = templateResult.error || syncResult.error;
      if (error) throw error;

      senderReadiness = senderResult;
      templates = (templateResult.data ?? []) as TemplateWorkspaceRow[];
      latestSync = (syncResult.data ?? null) as TemplateSyncRunRow | null;
    }
  } catch (error) {
    loadError = error instanceof Error ? error.message : 'Unable to load WhatsApp template workspace.';
  }

  const canSync = role ? ['owner', 'admin'].includes(role) : false;

  return (
    <div className="space-y-4">
      {loadError ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">
          WhatsApp template data is temporarily unavailable. Refresh the page or open Provider Health if the problem continues.
        </div>
      ) : null}

      {senderReadiness && senderReadiness.unboundActiveAccountCount > 0 ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800">
          {senderReadiness.unboundActiveAccountCount} unbound historical active WhatsApp account record{senderReadiness.unboundActiveAccountCount === 1 ? '' : 's'} are excluded from template readiness. Only the connected default sender is eligible for sync.
        </div>
      ) : null}

      <TemplateWorkspace
        templates={templates}
        latestSync={latestSync}
        accountPhone={senderReadiness?.displayPhoneNumber ?? null}
        accountConnected={senderReadiness?.connected === true}
        canSync={canSync}
      />
    </div>
  );
}
