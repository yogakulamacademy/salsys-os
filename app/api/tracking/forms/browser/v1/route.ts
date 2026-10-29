import { createHash } from 'node:crypto';

import { NextRequest, NextResponse } from 'next/server';

import { createAdminClient } from '@/lib/supabase/admin';
import {
  consumeTrackingRateLimit,
  corsHeadersForTrackingOrigin,
  resolveBrowserTrackingSource,
} from '@/lib/tracking/runtime';

export const dynamic = 'force-dynamic';

const ALLOWED_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete']);
const ALLOWED_FIELD_TYPES = new Set([
  'text',
  'email',
  'tel',
  'number',
  'date',
  'month',
  'select',
  'textarea',
  'checkbox',
  'radio',
  'hidden',
  'url',
  'other',
]);

class PublicRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function json(
  body: Record<string, unknown>,
  status: number,
  headers: Record<string, string>,
) {
  return NextResponse.json(body, {
    status,
    headers: { ...headers, 'Cache-Control': 'no-store' },
  });
}

function browserOrigin(request: NextRequest) {
  return request.headers.get('origin')?.trim() || null;
}

function publicSiteId(request: NextRequest) {
  return (
    request.nextUrl.searchParams.get('site_id')?.trim() ||
    request.headers.get('x-salsys-site-id')?.trim() ||
    null
  );
}

function declaredContentLength(request: NextRequest) {
  const header = request.headers.get('content-length');
  if (!header) return null;

  const value = Number(header);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

async function readBoundedJson(request: NextRequest, maxBytes: number) {
  const declared = declaredContentLength(request);
  if (declared !== null && declared > maxBytes) {
    throw new PublicRequestError('Payload too large.', 413);
  }

  if (!request.body) {
    throw new PublicRequestError('Invalid form discovery payload.', 400);
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        throw new PublicRequestError('Payload too large.', 413);
      }

      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return JSON.parse(new TextDecoder().decode(body)) as unknown;
  } catch {
    throw new PublicRequestError('Invalid form discovery payload.', 400);
  }
}

function cleanText(value: unknown, max: number) {
  return typeof value === 'string' && value.trim()
    ? value.trim().slice(0, max)
    : null;
}

function normalizePath(value: unknown, fallback = '/') {
  const text = cleanText(value, 1000) ?? fallback;
  if (!text.startsWith('/')) return fallback;
  return text.split('#')[0] || fallback;
}

function safeMethod(value: unknown) {
  const method = (cleanText(value, 10) ?? 'post').toLowerCase();
  return ALLOWED_METHODS.has(method) ? method : 'post';
}

function formKey(input: {
  pagePath: string;
  formName: string | null;
  formAction: string | null;
  method: string;
}) {
  return createHash('sha256')
    .update(
      [input.pagePath, input.formName ?? '', input.formAction ?? '', input.method].join('|'),
      'utf8',
    )
    .digest('hex')
    .slice(0, 40);
}

type FieldInventory = {
  selector: string;
  name: string | null;
  type: string;
  label: string | null;
  required: boolean;
};

function sanitizeField(value: unknown): FieldInventory | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const selector = cleanText(row.selector, 300);
  if (!selector || /password|secret|token|cvv|cvc|card.?number|ssn/i.test(selector)) {
    return null;
  }

  const requestedType = (cleanText(row.type, 30) ?? 'other').toLowerCase();
  const type = ALLOWED_FIELD_TYPES.has(requestedType) ? requestedType : 'other';
  const name = cleanText(row.name, 160);
  if (name && /password|secret|token|cvv|cvc|card.?number|ssn/i.test(name)) {
    return null;
  }

  return {
    selector,
    name,
    type,
    label: cleanText(row.label, 200),
    required: row.required === true,
  };
}

function sanitizeForm(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const pagePath = normalizePath(row.pagePath ?? row.page_path);
  const formName = cleanText(row.formName ?? row.form_name, 160);
  const formActionRaw = cleanText(row.formAction ?? row.form_action, 1000);
  const formAction = formActionRaw ? normalizePath(formActionRaw, pagePath) : null;
  const method = safeMethod(row.method);
  const rawFields = Array.isArray(row.fields) ? row.fields : [];
  const fields = rawFields
    .map(sanitizeField)
    .filter((field): field is FieldInventory => Boolean(field))
    .slice(0, 60);

  return {
    formKey: formKey({ pagePath, formName, formAction, method }),
    pagePath,
    formName,
    formAction,
    method,
    fields,
    likelyLeadForm: row.likelyLeadForm === true || row.likely_lead_form === true,
    containsPassword: row.containsPassword === true || row.contains_password === true,
  };
}

async function resolveRequest(request: NextRequest) {
  const origin = browserOrigin(request);
  const siteId = publicSiteId(request);
  const source = await resolveBrowserTrackingSource(origin, siteId);
  const cors = corsHeadersForTrackingOrigin(origin, Boolean(source));
  return { origin, siteId, source, cors };
}

export async function OPTIONS(request: NextRequest) {
  const origin = browserOrigin(request);
  return new NextResponse(null, {
    status: origin ? 204 : 400,
    headers: corsHeadersForTrackingOrigin(origin, Boolean(origin)),
  });
}

export async function GET(request: NextRequest) {
  const { source, cors } = await resolveRequest(request);
  if (!source) {
    return json({ ok: false, error: 'Unrecognized browser tracking origin.' }, 403, cors);
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('tracking_forms')
    .select('form_key,form_name,page_path,form_action,method,status,lead_capture_enabled,field_mapping,updated_at')
    .eq('organization_id', source.organizationId)
    .eq('organization_site_id', source.organizationSiteId)
    .neq('status', 'ignored')
    .order('last_seen_at', { ascending: false });

  if (error) {
    console.error('Browser form discovery read failed.', error);
    return json({ ok: false, error: 'Unable to load form discovery configuration.' }, 500, cors);
  }

  return json(
    {
      ok: true,
      forms: data ?? [],
      site_id: source.publicSiteId,
    },
    200,
    cors,
  );
}

export async function POST(request: NextRequest) {
  const { source, cors } = await resolveRequest(request);
  if (!source) {
    return json({ ok: false, accepted: false, error: 'Unrecognized browser tracking origin.' }, 403, cors);
  }

  const maxBytes = Math.min(source.maxPayloadBytes, 48_000);
  const declared = declaredContentLength(request);
  if (declared !== null && declared > maxBytes) {
    return json({ ok: false, accepted: false, error: 'Payload too large.' }, 413, cors);
  }

  const rate = await consumeTrackingRateLimit(source);
  if (!rate.allowed) {
    return json(
      { ok: false, accepted: false, error: 'Rate limit exceeded.' },
      429,
      { ...cors, 'Retry-After': '60' },
    );
  }

  let body: unknown;
  try {
    body = await readBoundedJson(request, maxBytes);
  } catch (error) {
    const requestError =
      error instanceof PublicRequestError
        ? error
        : new PublicRequestError('Invalid form discovery payload.', 400);

    return json(
      { ok: false, accepted: false, error: requestError.message },
      requestError.status,
      cors,
    );
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return json({ ok: false, accepted: false, error: 'Invalid form discovery payload.' }, 400, cors);
  }

  const rawForms = Array.isArray((body as Record<string, unknown>).forms)
    ? ((body as Record<string, unknown>).forms as unknown[])
    : [];
  const sanitizedForms = rawForms
    .map(sanitizeForm)
    .filter((form): form is NonNullable<ReturnType<typeof sanitizeForm>> => Boolean(form));
  const forms = Array.from(
    new Map(sanitizedForms.map((form) => [form.formKey, form])).values(),
  ).slice(0, 30);

  if (!forms.length) {
    return json({ ok: true, accepted: true, detected: 0, forms: [] }, 202, cors);
  }

  const admin = createAdminClient();
  const now = new Date().toISOString();

  const rows = forms.map((form) => ({
    organization_id: source.organizationId,
    organization_site_id: source.organizationSiteId,
    tracking_source_id: source.id,
    form_key: form.formKey,
    form_name: form.formName,
    page_path: form.pagePath,
    form_action: form.formAction,
    method: form.method,
    field_inventory: form.fields,
    last_seen_at: now,
    updated_at: now,
    metadata: {
      likely_lead_form: form.likelyLeadForm,
      contains_password: form.containsPassword,
      discovery_adapter: 'app/api/tracking/forms/browser/v1',
      public_site_id: source.publicSiteId,
    },
  }));

  const { error: upsertError } = await admin
    .from('tracking_forms')
    .upsert(rows, {
      onConflict: 'organization_id,organization_site_id,form_key',
      ignoreDuplicates: false,
    });

  if (upsertError) {
    console.error('Browser form discovery upsert failed.', upsertError);
    return json({ ok: false, accepted: false, error: 'Form discovery update failed.' }, 500, cors);
  }

  const keys = rows.map((row) => row.form_key);
  const { data: configs, error: configError } = await admin
    .from('tracking_forms')
    .select('form_key,form_name,page_path,form_action,method,status,lead_capture_enabled,field_mapping,updated_at')
    .eq('organization_id', source.organizationId)
    .eq('organization_site_id', source.organizationSiteId)
    .in('form_key', keys);

  if (configError) {
    console.error('Browser form discovery configuration read failed.', configError);
    return json({ ok: false, accepted: false, error: 'Unable to load form discovery configuration.' }, 500, cors);
  }

  return json(
    {
      ok: true,
      accepted: true,
      detected: rows.length,
      forms: configs ?? [],
      site_id: source.publicSiteId,
    },
    202,
    {
      ...cors,
      'X-RateLimit-Limit': String(rate.limit),
      'X-RateLimit-Remaining': String(rate.remaining),
    },
  );
}
