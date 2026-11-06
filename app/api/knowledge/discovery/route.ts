import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireCurrentOrganizationId } from '@/lib/workspace';
import { readBoundedJson } from '@/lib/security/bounded-json-body';
import { isExplicitCrossSiteRequest } from '@/lib/security/fetch-metadata';
import { parseWebsiteSeed, WebsiteScopeError } from '@/lib/knowledge-discovery/url-policy';
import { discoveryPilotEnabled, discoveryHostAllowed } from '@/lib/knowledge-discovery/pilot-gate';
import { discoveryDomainVerified, discoveryVerificationHost } from '@/lib/knowledge-discovery/domain-verification';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noStore = { 'Cache-Control': 'no-store' };
const json = (value: object, status = 200) => NextResponse.json(value, { status, headers: noStore });
type StartBody = { url?: unknown; maxPages?: unknown };
type CancelBody = { jobId?: unknown };

function sameOrigin(request: NextRequest): boolean {
  if (isExplicitCrossSiteRequest(request)) return false;
  const origin = request.headers.get('origin');
  if (!origin) return request.headers.get('sec-fetch-site') === 'same-origin';
  try {
    const parsed = new URL(origin);
    return parsed.origin === request.nextUrl.origin;
  } catch { return false; }
}

async function adminContext() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return null;
  const organizationId = await requireCurrentOrganizationId(supabase, user.id);
  const { data: allowed, error: permissionError } = await supabase
    .rpc('can_manage_organization', { p_organization_id: organizationId });
  if (permissionError || allowed !== true) return null;
  return { supabase, organizationId, userId: user.id };
}

export async function GET() {
  try {
    const ctx = await adminContext();
    if (!ctx) return json({ ok: false, error: 'Unauthorized' }, 403);
    const onboarding = await ctx.supabase.from('organization_onboarding').select('website_url')
      .eq('organization_id', ctx.organizationId).maybeSingle();
    if (onboarding.error) throw new Error('website_read_failed');
    const configuredWebsite = onboarding.data?.website_url ?? null;
    let enabled = false;
    if (configuredWebsite && discoveryPilotEnabled()) {
      try {
        const website = parseWebsiteSeed(configuredWebsite);
        enabled = website.protocol === 'https:' && discoveryHostAllowed(website.hostname);
      }
      catch { enabled = false; }
    }
    // Before isolated schema deployment or while paused, never touch the
    // still-unavailable discovery tables or pretend empty history is verified.
    if (!enabled) return json({
      ok: true, configuredWebsite, discoveryEnabled: false,
      historyAvailable: false, jobs: [], pages: [],
    });
    const website = parseWebsiteSeed(configuredWebsite!);
    const proof = await ctx.supabase.from('knowledge_discovery_domain_verifications')
      .select('verified_at,verified_until')
      .eq('organization_id', ctx.organizationId)
      .eq('hostname', discoveryVerificationHost(website.hostname)).maybeSingle();
    if (proof.error) throw new Error('ownership_read_failed');
    const websiteVerified = discoveryDomainVerified(proof.data);
    const jobs = await ctx.supabase.from('knowledge_discovery_jobs')
      .select('id,seed_url,status,max_pages,pages_discovered,pages_fetched,pages_blocked,pages_failed,pages_skipped,last_error_code,created_at,finished_at')
      .eq('organization_id', ctx.organizationId).order('created_at', { ascending: false }).limit(10);
    if (jobs.error) throw new Error('read_failed');
    const latest = jobs.data?.[0];
    let pages: unknown[] = [];
    if (latest) {
      const result = await ctx.supabase.from('knowledge_discovery_pages')
        .select('id,url,status,depth,http_status,page_title,failure_code')
        .eq('organization_id', ctx.organizationId).eq('job_id', latest.id)
        .order('depth').order('discovered_at').limit(50);
      if (result.error) throw new Error('pages_failed');
      pages = result.data ?? [];
    }
    return json({ ok: true, configuredWebsite, pilotEnabled: true,
      websiteVerified, discoveryEnabled: websiteVerified,
      historyAvailable: true, jobs: jobs.data ?? [], pages });
  } catch {
    return json({ ok: false, error: 'Discovery data unavailable' }, 503);
  }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return json({ ok: false, error: 'Origin rejected' }, 403);
  const body = await readBoundedJson<StartBody>(request, 4 * 1024);
  if (!body.ok) return json({ ok: false, error: body.error }, body.status);
  try {
    const ctx = await adminContext();
    if (!ctx) return json({ ok: false, error: 'Unauthorized' }, 403);
    const { data: configured, error: configuredError } = await ctx.supabase
      .from('organization_onboarding').select('website_url')
      .eq('organization_id', ctx.organizationId).maybeSingle();
    if (configuredError) throw new Error('configuration_unavailable');
    if (!discoveryPilotEnabled()) return json({
      ok: false, error: 'Website discovery is not enabled for this environment.',
    }, 503);
    if (!configured?.website_url) {
      return json({ ok: false, error: 'Add the business website to the organization profile first.' }, 409);
    }
    const source = parseWebsiteSeed(configured.website_url);
    if (!discoveryHostAllowed(source.hostname)) {
      return json({ ok: false, error: 'This website is not approved for the discovery pilot.' }, 403);
    }
    if (source.protocol !== 'https:') {
      return json({ ok: false, error: 'HTTPS is required to verify website ownership.' }, 400);
    }
    const { data: proof, error: proofError } = await ctx.supabase
      .from('knowledge_discovery_domain_verifications')
      .select('verified_at,verified_until')
      .eq('organization_id', ctx.organizationId)
      .eq('hostname', discoveryVerificationHost(source.hostname)).maybeSingle();
    if (proofError) throw new Error('ownership_unavailable');
    if (!discoveryDomainVerified(proof)) {
      return json({ ok: false, error: 'Verify ownership of your business website before scanning.' }, 409);
    }
    const candidate = parseWebsiteSeed(typeof body.value.url === 'string' ? body.value.url : source.href);
    const canonical = (host: string) => host.toLowerCase().replace(/\.$/, '');
    if (canonical(source.hostname) !== canonical(candidate.hostname)) {
      return json({ ok: false, error: 'Website must match the configured business domain.' }, 400);
    }
    const maxPages = typeof body.value.maxPages === 'number' ? body.value.maxPages : 30;
    if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 50) {
      return json({ ok: false, error: 'Page limit must be 1–50.' }, 400);
    }
    const admin = createAdminClient();
    const { data: created, error: insertError } = await admin
      .from('knowledge_discovery_jobs')
      .insert({ organization_id: ctx.organizationId, created_by: ctx.userId,
        seed_url: source.origin + '/', max_pages: maxPages, status: 'queued' })
      .select('id').single();
    if (insertError) {
      if (insertError.code === '23505') return json({ ok: false, error: 'A scan is already in progress.' }, 409);
      if (insertError.code === 'P0001' &&
          ['discovery_daily_scan_limit', 'discovery_scan_cooldown'].includes(insertError.message ?? '')) {
        return json({ ok: false, error: 'Website discovery scan limit reached. Try again later.' }, 429);
      }
      throw insertError;
    }
    const { error: pageError } = await admin.from('knowledge_discovery_pages')
      .insert({ organization_id: ctx.organizationId, job_id: created.id,
        url: source.origin + '/', depth: 0, status: 'discovered' });
    if (pageError) {
      await admin.from('knowledge_discovery_jobs')
        .update({ status: 'failed', last_error_code: 'seed_insert_failed', finished_at: new Date().toISOString() })
        .eq('id', created.id).eq('organization_id', ctx.organizationId);
      throw pageError;
    }
    return json({ ok: true, jobId: created.id, status: 'queued' }, 202);
  } catch (error) {
    if (error instanceof WebsiteScopeError) return json({ ok: false, error: error.message }, 400);
    return json({ ok: false, error: 'Unable to queue website scan.' }, 503);
  }
}

export async function DELETE(request: NextRequest) {
  if (!sameOrigin(request)) return json({ ok: false, error: 'Origin rejected' }, 403);
  const body = await readBoundedJson<CancelBody>(request, 2 * 1024);
  if (!body.ok) return json({ ok: false, error: body.error }, body.status);
  const jobId = typeof body.value.jobId === 'string' ? body.value.jobId : '';
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(jobId)) {
    return json({ ok: false, error: 'Valid job ID required' }, 400);
  }
  try {
    const ctx = await adminContext();
    if (!ctx) return json({ ok: false, error: 'Unauthorized' }, 403);
    const { data, error } = await createAdminClient().from('knowledge_discovery_jobs')
      .update({ status: 'cancelled', lease_token: null, lease_until: null,
        finished_at: new Date().toISOString() })
      .eq('organization_id', ctx.organizationId).eq('id', jobId)
      .in('status', ['queued', 'running']).select('id').maybeSingle();
    if (error) throw error;
    if (!data) return json({ ok: false, error: 'Active scan not found' }, 404);
    return json({ ok: true, status: 'cancelled' });
  } catch {
    return json({ ok: false, error: 'Unable to cancel scan' }, 503);
  }
}
