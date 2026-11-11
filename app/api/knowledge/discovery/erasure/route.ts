import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireCurrentOrganizationId } from '@/lib/workspace';
import { readBoundedJson } from '@/lib/security/bounded-json-body';
import { isExplicitCrossSiteRequest } from '@/lib/security/fetch-metadata';
import { parseWebsiteSeed } from '@/lib/knowledge-discovery/url-policy';
import { discoveryVerificationHost } from '@/lib/knowledge-discovery/domain-verification';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const json = (value: object, status = 200) => NextResponse.json(value, {
  status, headers: { 'Cache-Control': 'no-store' },
});

function isSameOrigin(request: NextRequest): boolean {
  if (isExplicitCrossSiteRequest(request)) return false;
  const origin = request.headers.get('origin');
  if (!origin) return request.headers.get('sec-fetch-site') === 'same-origin';
  try { return new URL(origin).origin === request.nextUrl.origin; }
  catch { return false; }
}

/**
 * KB-06C: explicitly requested deletion of discovery JOB/PAGE METADATA only.
 * Disabled by default. Does NOT erase future source quotations, AI proposals,
 * customer records or legal audit records. No service-role application writes.
 */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return json({ ok: false, error: 'Origin rejected' }, 403);
  if (process.env.KNOWLEDGE_DISCOVERY_METADATA_ERASURE_ENABLED !== 'true')
    return json({ ok: false, error: 'Metadata erasure disabled' }, 503);
  const body = await readBoundedJson<{ hostname?: unknown; expectedRevision?: unknown }>(
    request, 1024,
  );
  if (!body.ok) return json({ ok: false, error: body.error }, body.status);
  const { hostname, expectedRevision } = body.value;
  if (typeof hostname !== 'string' || hostname.length > 253 ||
      !Number.isSafeInteger(expectedRevision) || (expectedRevision as number) < 2)
    return json({ ok: false, error: 'Exact hostname and withdrawn consent revision required' }, 400);
  let host: string;
  try {
    const site = parseWebsiteSeed('https://' + hostname + '/');
    host = discoveryVerificationHost(site.hostname);
    if (site.hostname !== hostname || site.protocol !== 'https:')
      return json({ ok: false, error: 'Invalid hostname' }, 400);
  } catch { return json({ ok: false, error: 'Invalid hostname' }, 400); }

  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user || !UUID.test(user.id))
      return json({ ok: false, error: 'Unauthorized' }, 403);
    const org = await requireCurrentOrganizationId(supabase, user.id);
    if (!UUID.test(org ?? '')) return json({ ok: false, error: 'Unauthorized' }, 403);
    const authorized = await supabase.rpc('can_manage_organization', {
      p_organization_id: org,
    });
    if (authorized.error || authorized.data !== true)
      return json({ ok: false, error: 'Unauthorized' }, 403);
    // The database also independently checks auth.sessions + exact tenant session binding.
    const { data, error } = await supabase.rpc('erase_knowledge_discovery_metadata_v1', {
      p_organization_id: org,
      p_hostname: host,
      p_expected_revision: expectedRevision,
    });
    if (error) return json({ ok: false, error: 'Metadata erasure rejected' }, 403);
    if (data?.ok !== true)
      return json({ ok: false, error: 'Metadata erasure not eligible or already completed' }, 409);
    return json({
      ok: true, status: 'discovery_metadata_erased',
      jobsDeleted: data.jobsDeleted, pagesDeleted: data.pagesDeleted,
    });
  } catch {
    return json({ ok: false, error: 'Metadata erasure unavailable' }, 503);
  }
}
