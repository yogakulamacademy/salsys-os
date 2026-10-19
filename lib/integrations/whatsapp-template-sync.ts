import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { getWhatsAppRuntimeForOrganization } from '@/lib/integrations/whatsapp-connection';

const DEFAULT_WHATSAPP_API_VERSION = 'v26.0';
const MAX_TEMPLATE_PAGES = 50;

type RawTemplateComponent = {
  type?: string;
  format?: string;
  text?: string;
  buttons?: Array<Record<string, unknown>>;
  [key: string]: unknown;
};

type RawTemplate = {
  id?: string;
  name?: string;
  status?: string;
  language?: string;
  category?: string;
  components?: RawTemplateComponent[];
  [key: string]: unknown;
};

type TemplatePage = {
  data?: RawTemplate[];
  paging?: {
    next?: string;
    cursors?: { after?: string };
  };
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
  };
};

function apiVersion() {
  const value = process.env.WA_API_VERSION?.trim() || DEFAULT_WHATSAPP_API_VERSION;
  return /^v\d+\.\d+$/.test(value) ? value : DEFAULT_WHATSAPP_API_VERSION;
}

function normalizeStatus(status: string | undefined) {
  switch (String(status ?? '').trim().toUpperCase()) {
    case 'APPROVED':
      return 'approved';
    case 'PENDING':
    case 'PENDING_DELETION':
    case 'IN_APPEAL':
      return 'pending';
    case 'REJECTED':
      return 'rejected';
    case 'PAUSED':
      return 'paused';
    case 'DISABLED':
      return 'disabled';
    default:
      return 'unknown';
  }
}

function countPositionalVariables(text: string) {
  const matches = [...text.matchAll(/\{\{(\d+)\}\}/g)];
  return matches.length ? Math.max(...matches.map((match) => Number(match[1] ?? 0))) : 0;
}

function buildParameterSchema(components: RawTemplateComponent[]) {
  const header = components.find((component) => String(component.type ?? '').toUpperCase() === 'HEADER');
  const body = components.find((component) => String(component.type ?? '').toUpperCase() === 'BODY');
  const headerText = typeof header?.text === 'string' ? header.text : '';
  const bodyText = typeof body?.text === 'string' ? body.text : '';

  return {
    header_variable_count: countPositionalVariables(headerText),
    body_variable_count: countPositionalVariables(bodyText),
    header_format: String(header?.format ?? 'TEXT').toUpperCase(),
  };
}

function sanitizedProviderError(payload: TemplatePage, status: number) {
  const message = payload.error?.message?.trim();
  const code = payload.error?.code;
  const subcode = payload.error?.error_subcode;
  const parts = [message || `Meta returned HTTP ${status}.`];
  if (typeof code === 'number') parts.push(`code=${code}`);
  if (typeof subcode === 'number') parts.push(`subcode=${subcode}`);
  return parts.join(' ');
}

function validatedGraphPagingUrl(value: string | undefined) {
  const candidate = value?.trim();
  if (!candidate) return null;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error('Meta returned an invalid template pagination URL.');
  }

  if (parsed.protocol !== 'https:' || parsed.hostname !== 'graph.facebook.com') {
    throw new Error('Meta returned an unexpected template pagination host.');
  }

  return parsed.toString();
}

async function fetchAllTemplates(wabaId: string, accessToken: string) {
  const templates: RawTemplate[] = [];
  let pagesFetched = 0;
  let nextUrl: string | null = null;

  const initial = new URL(`https://graph.facebook.com/${apiVersion()}/${encodeURIComponent(wabaId)}/message_templates`);
  initial.searchParams.set('fields', 'id,name,status,language,category,components');
  initial.searchParams.set('limit', '100');
  nextUrl = initial.toString();

  while (nextUrl) {
    if (pagesFetched >= MAX_TEMPLATE_PAGES) {
      throw new Error(`Meta template sync exceeded the ${MAX_TEMPLATE_PAGES}-page safety limit.`);
    }

    const response = await fetch(nextUrl, {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    });

    const responseText = await response.text();
    let payload: TemplatePage = {};
    try {
      payload = responseText ? JSON.parse(responseText) : {};
    } catch {
      payload = {};
    }

    if (!response.ok) {
      throw new Error(sanitizedProviderError(payload, response.status));
    }

    pagesFetched += 1;
    templates.push(...(payload.data ?? []));
    nextUrl = validatedGraphPagingUrl(payload.paging?.next);
  }

  return { templates, pagesFetched };
}

export type WhatsAppTemplateSyncResult = {
  ok: boolean;
  syncRunId: string | null;
  organizationId: string;
  whatsappAccountId: string | null;
  pagesFetched: number;
  templatesSeen: number;
  templatesUpserted: number;
  templatesDeactivated: number;
  error: string | null;
};

export async function syncWhatsAppTemplatesForOrganization(
  organizationId: string,
): Promise<WhatsAppTemplateSyncResult> {
  const resolvedOrganizationId = organizationId?.trim();
  if (!resolvedOrganizationId) {
    return {
      ok: false,
      syncRunId: null,
      organizationId: '',
      whatsappAccountId: null,
      pagesFetched: 0,
      templatesSeen: 0,
      templatesUpserted: 0,
      templatesDeactivated: 0,
      error: 'organizationId is required.',
    };
  }

  const admin = createAdminClient();
  let accountId: string | null = null;
  let syncRunId: string | null = null;
  let connectionId: string | null = null;

  try {
    const runtime = await getWhatsAppRuntimeForOrganization(resolvedOrganizationId);
    connectionId = runtime.connectionId;

    const { data: account, error: accountError } = await admin
      .from('whatsapp_accounts')
      .select('id,organization_id,connection_id,phone_number_id,active,is_default')
      .eq('organization_id', resolvedOrganizationId)
      .eq('phone_number_id', runtime.phoneNumberId)
      .eq('active', true)
      .eq('is_default', true)
      .maybeSingle();

    if (accountError || !account?.id || account.organization_id !== resolvedOrganizationId) {
      throw new Error(accountError?.message || 'Default WhatsApp account could not be resolved for template sync.');
    }

    accountId = String(account.id);

    const { data: syncRun, error: syncRunError } = await admin
      .from('automation_whatsapp_template_sync_runs')
      .insert({
        organization_id: resolvedOrganizationId,
        whatsapp_account_id: accountId,
        connection_id: connectionId,
        provider: 'meta_cloud_api',
        status: 'running',
        provider_metadata: {
          api_version: apiVersion(),
          customer_message_sent: false,
        },
      })
      .select('id')
      .single();

    if (syncRunError || !syncRun?.id) {
      throw new Error(syncRunError?.message || 'Unable to create WhatsApp template sync audit.');
    }

    syncRunId = String(syncRun.id);

    const fetched = await fetchAllTemplates(runtime.wabaId, runtime.accessToken);
    const now = new Date().toISOString();
    const normalizedRows = fetched.templates
      .filter((template) => Boolean(template.name?.trim() && template.language?.trim()))
      .map((template) => {
        const components = Array.isArray(template.components) ? template.components : [];
        const approvalStatus = normalizeStatus(template.status);
        return {
          organization_id: resolvedOrganizationId,
          whatsapp_account_id: accountId,
          provider_template_id: template.id?.trim() || null,
          template_name: template.name!.trim(),
          language_code: template.language!.trim(),
          category: template.category?.trim() || null,
          approval_status: approvalStatus,
          provider_status_raw: template.status?.trim() || null,
          parameter_schema: buildParameterSchema(components),
          components,
          provider_metadata: {
            sync_source: 'meta_message_templates',
            sync_run_id: syncRunId,
          },
          active: true,
          last_synced_at: now,
        };
      });

    if (normalizedRows.length > 0) {
      const { error: upsertError } = await admin
        .from('automation_whatsapp_templates')
        .upsert(normalizedRows, {
          onConflict: 'organization_id,whatsapp_account_id,template_name,language_code',
        });

      if (upsertError) {
        throw new Error(`Unable to persist Meta templates: ${upsertError.message}`);
      }
    }

    const seenKeys = new Set(
      normalizedRows.map((row) => `${row.template_name}\u0000${row.language_code}`),
    );

    const { data: existingRows, error: existingError } = await admin
      .from('automation_whatsapp_templates')
      .select('id,template_name,language_code,active')
      .eq('organization_id', resolvedOrganizationId)
      .eq('whatsapp_account_id', accountId);

    if (existingError) {
      throw new Error(`Unable to verify synchronized templates: ${existingError.message}`);
    }

    const staleIds = (existingRows ?? [])
      .filter((row) => !seenKeys.has(`${String(row.template_name)}\u0000${String(row.language_code)}`) && row.active === true)
      .map((row) => String(row.id));

    if (staleIds.length > 0) {
      const { error: deactivateError } = await admin
        .from('automation_whatsapp_templates')
        .update({
          active: false,
          updated_at: now,
          provider_metadata: {
            sync_source: 'meta_message_templates',
            sync_run_id: syncRunId,
            absent_from_complete_provider_sync: true,
          },
        })
        .eq('organization_id', resolvedOrganizationId)
        .eq('whatsapp_account_id', accountId)
        .in('id', staleIds);

      if (deactivateError) {
        throw new Error(`Unable to deactivate stale templates: ${deactivateError.message}`);
      }
    }

    const { error: finishError } = await admin
      .from('automation_whatsapp_template_sync_runs')
      .update({
        status: 'completed',
        pages_fetched: fetched.pagesFetched,
        templates_seen: fetched.templates.length,
        templates_upserted: normalizedRows.length,
        templates_deactivated: staleIds.length,
        finished_at: now,
        provider_error: null,
      })
      .eq('id', syncRunId)
      .eq('organization_id', resolvedOrganizationId);

    if (finishError) {
      throw new Error(`Unable to finalize WhatsApp template sync audit: ${finishError.message}`);
    }

    return {
      ok: true,
      syncRunId,
      organizationId: resolvedOrganizationId,
      whatsappAccountId: accountId,
      pagesFetched: fetched.pagesFetched,
      templatesSeen: fetched.templates.length,
      templatesUpserted: normalizedRows.length,
      templatesDeactivated: staleIds.length,
      error: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'WhatsApp template sync failed.';
    if (syncRunId) {
      await admin
        .from('automation_whatsapp_template_sync_runs')
        .update({
          status: 'failed',
          provider_error: message.slice(0, 1000),
          finished_at: new Date().toISOString(),
        })
        .eq('id', syncRunId)
        .eq('organization_id', resolvedOrganizationId);
    }

    return {
      ok: false,
      syncRunId,
      organizationId: resolvedOrganizationId,
      whatsappAccountId: accountId,
      pagesFetched: 0,
      templatesSeen: 0,
      templatesUpserted: 0,
      templatesDeactivated: 0,
      error: message,
    };
  }
}
