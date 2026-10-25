import { NextRequest, NextResponse } from 'next/server';

import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { getWorkspaceContextForUser } from '@/lib/workspace';

export const dynamic = 'force-dynamic';

const CANONICAL_FIELDS = new Set([
  'firstName',
  'lastName',
  'email',
  'phone',
  'country',
  'courseCode',
  'message',
]);

const FORM_SELECT =
  'id,organization_site_id,tracking_source_id,form_key,form_name,page_path,form_action,method,status,lead_capture_enabled,field_inventory,field_mapping,first_seen_at,last_seen_at,metadata,created_at,updated_at';

function jsonError(message: string, status: number) {
  return NextResponse.json(
    { ok: false, error: message },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
}

function sameOrigin(request: NextRequest) {
  return request.headers.get('origin') === request.nextUrl.origin;
}

function cleanText(value: unknown, max: number) {
  return typeof value === 'string' && value.trim()
    ? value.trim().slice(0, max)
    : null;
}

async function adminWorkspace() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: jsonError('Sign in to manage detected forms.', 401) };
  }

  const context = await getWorkspaceContextForUser(supabase, user.id);
  const workspace = context.activeWorkspace;
  if (!workspace || !['owner', 'admin'].includes(workspace.role)) {
    return {
      error: jsonError(
        'You do not have permission to manage detected forms for this workspace.',
        403,
      ),
    };
  }

  return { organizationId: workspace.organizationId, userId: user.id };
}

function sanitizeMapping(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const raw = value as Record<string, unknown>;
  const mapping: Record<string, string> = {};

  for (const [key, selectorValue] of Object.entries(raw)) {
    if (!CANONICAL_FIELDS.has(key)) continue;
    const selector = cleanText(selectorValue, 300);
    if (!selector) continue;
    if (/password|secret|token|cvv|cvc|card.?number|ssn/i.test(selector)) continue;
    mapping[key] = selector;
  }

  return mapping;
}

function reusableFormName(value: unknown) {
  const name = cleanText(value, 160);
  if (!name) return null;
  return name.toLowerCase() === 'anonymous' ? null : name;
}

export async function GET(request: NextRequest) {
  const auth = await adminWorkspace();
  if ('error' in auth) return auth.error;

  const siteId = cleanText(request.nextUrl.searchParams.get('site_id'), 100);
  const sourceId = cleanText(request.nextUrl.searchParams.get('source_id'), 100);
  const admin = createAdminClient();

  let query = admin
    .from('tracking_forms')
    .select(FORM_SELECT)
    .eq('organization_id', auth.organizationId)
    .order('last_seen_at', { ascending: false });

  if (sourceId) query = query.eq('tracking_source_id', sourceId);

  if (siteId) {
    const { data: source, error: sourceError } = await admin
      .from('tracking_sources')
      .select('organization_site_id,metadata')
      .eq('organization_id', auth.organizationId)
      .eq('source_type', 'website')
      .contains('metadata', { public_site_id: siteId })
      .maybeSingle();

    if (sourceError) return jsonError(sourceError.message, 500);
    if (!source?.organization_site_id) {
      return jsonError('Website Site ID was not found in this workspace.', 404);
    }
    query = query.eq('organization_site_id', source.organization_site_id);
  }

  const { data, error } = await query;
  if (error) return jsonError(error.message, 500);

  return NextResponse.json(
    { ok: true, forms: data ?? [] },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function PATCH(request: NextRequest) {
  if (!sameOrigin(request)) return jsonError('Invalid request origin.', 403);

  const auth = await adminWorkspace();
  if ('error' in auth) return auth.error;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return jsonError('Invalid form configuration payload.', 400);
  }

  const raw = body as Record<string, unknown>;
  const id = cleanText(raw.id, 100);
  if (!id) return jsonError('Detected form ID is required.', 400);

  const requestedStatus = cleanText(raw.status, 20);
  const status =
    requestedStatus && ['detected', 'enabled', 'ignored'].includes(requestedStatus)
      ? requestedStatus
      : null;
  const mapping = sanitizeMapping(raw.fieldMapping ?? raw.field_mapping);
  const leadCaptureEnabled = raw.leadCaptureEnabled === true || raw.lead_capture_enabled === true;

  const update: Record<string, unknown> = {
    field_mapping: mapping,
    lead_capture_enabled: leadCaptureEnabled,
    updated_at: new Date().toISOString(),
  };
  if (status) update.status = status;
  if (leadCaptureEnabled) update.status = 'enabled';
  if (status === 'ignored') update.lead_capture_enabled = false;

  const admin = createAdminClient();
  const { data: target, error: targetError } = await admin
    .from('tracking_forms')
    .select(FORM_SELECT)
    .eq('id', id)
    .eq('organization_id', auth.organizationId)
    .maybeSingle();

  if (targetError) return jsonError(targetError.message, 500);
  if (!target) return jsonError('Detected form was not found in this workspace.', 404);

  const sharedName = reusableFormName(target.form_name);
  let updateQuery = admin
    .from('tracking_forms')
    .update(update)
    .eq('organization_id', auth.organizationId)
    .eq('organization_site_id', target.organization_site_id);

  if (sharedName) {
    updateQuery = updateQuery
      .eq('form_name', sharedName)
      .eq('method', target.method);
  } else {
    updateQuery = updateQuery.eq('id', id);
  }

  const { data: updatedRows, error } = await updateQuery.select(FORM_SELECT);
  if (error) return jsonError(error.message, 500);

  const rows = updatedRows ?? [];
  const updated = rows.find((row) => row.id === id) ?? rows[0] ?? null;
  if (!updated) return jsonError('Detected form was not found in this workspace.', 404);

  return NextResponse.json(
    {
      ok: true,
      form: updated,
      applied_to: rows.length,
      reusable_profile: Boolean(sharedName),
      reusable_form_name: sharedName,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
