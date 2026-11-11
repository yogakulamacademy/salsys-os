import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireCurrentOrganizationId } from '@/lib/workspace';
import { readBoundedJson } from '@/lib/security/bounded-json-body';
import { isExplicitCrossSiteRequest } from '@/lib/security/fetch-metadata';
import { parseWebsiteSeed, WebsiteScopeError } from '@/lib/knowledge-discovery/url-policy';
import { discoveryPilotEnabled, discoveryHostAllowed } from '@/lib/knowledge-discovery/pilot-gate';
import { discoveryDomainVerified, discoveryVerificationHost } from '@/lib/knowledge-discovery/domain-verification';
import { discoverySiteConsentActive } from '@/lib/knowledge-discovery/site-consent';

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
    // A verified domain is not permission to crawl it. Explicit, active,
    // purpose-limited tenant consent is a separate requirement.
    const consent = await ctx.supabase.from('knowledge_discovery_site_consents')
      .select('organization_id,hostname,purpose,status,policy_version,granted_by,granted_at,valid_until,withdrawn_at')
      .eq('organization_id',ctx.organizationId)
      .eq('hostname',discoveryVerificationHost(website.hostname)).maybeSingle();
    if (consent.error) throw new Error('consent_read_failed');
    const consentActive=discoverySiteConsentActive(
      consent.data,ctx.organizationId,discoveryVerificationHost(website.hostname),
    );
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
      websiteVerified,consentActive,discoveryEnabled:websiteVerified && consentActive,
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
    // No consent grant endpoint is exposed in this draft. An absent, wrong
    // purpose, revoked or expired consent fails before any job is queued.
    const consent = await ctx.supabase.from('knowledge_discovery_site_consents')
      .select('organization_id,hostname,purpose,status,policy_version,granted_by,granted_at,valid_until,withdrawn_at')
      .eq('organization_id',ctx.organizationId)
      .eq('hostname',discoveryVerificationHost(source.hostname)).maybeSingle();
    if (consent.error) throw new Error('consent_read_failed');
    if (!discoverySiteConsentActive(
      consent.data,ctx.organizationId,discoveryVerificationHost(source.hostname),
    )) {
      return json({ok:false,error:'Explicit website discovery consent is missing or inactive.'},403);
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
    // KB-09J draft: the signed-in user's session invokes a single atomic,
    // tenant-bound enqueue-and-seed RPC. It revalidates current ownership,
    // configured website, consent and scan limits INSIDE the transaction.
    // Never fall back to service-role INSERT if this RPC is unavailable.
    const { data: created, error: insertError } = await ctx.supabase
      .rpc('enqueue_knowledge_discovery_job_v1', {
        p_organization_id: ctx.organizationId,
        p_seed_url: source.origin + '/',
        p_max_pages: maxPages,
      });
    if (insertError) {
      if (insertError.code === '23505') {
        return json({ ok: false, error: 'A scan is already in progress.' }, 409);
      }
      if (insertError.code === 'P0001' &&
          ['discovery_daily_scan_limit', 'discovery_scan_cooldown'].includes(insertError.message ?? '')) {
        return json({ ok: false, error: 'Website discovery scan limit reached. Try again later.' }, 429);
      }
      throw insertError;
    }
    if (created?.ok !== true || created?.status !== 'queued' ||
        created?.seed_inserted !== true ||
        typeof created?.job_id !== 'string' ||
        !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(created.job_id)) {
      if (created?.reason === 'ownership_proof_not_current') {
        return json({ ok: false, error: 'Verify ownership of your business website before scanning.' }, 409);
      }
      if (created?.reason === 'consent_not_active') {
        return json({ ok: false, error: 'Explicit website discovery consent is missing or inactive.' }, 403);
      }
      if (created?.reason === 'configured_domain_mismatch') {
        return json({ ok: false, error: 'Configured business website changed. Refresh before scanning.' }, 409);
      }
      if (created?.reason === 'invalid_scan_request') {
        return json({ ok: false, error: 'Invalid website scan request.' }, 400);
      }
      throw new Error('atomic_enqueue_not_confirmed');
    }
    return json({ ok: true, jobId: created.job_id, status: 'queued' }, 202);
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
    // The signed-in user's Supabase client carries the current Auth session.
    // The database must re-check owner/admin membership and the tenant-bound
    // session under the exact job-row lock. Never use service_role here.
    const { data, error } = await ctx.supabase.rpc('cancel_knowledge_discovery_job_v1', {
      p_organization_id: ctx.organizationId,
      p_job_id: jobId,
    });
    if (error) throw error;
    if (data?.ok !== true || data?.audit_recorded !== true) {
      return json({ ok: false, error: 'Active scan not found' }, 404);
    }
    return json({ ok: true, status: 'cancelled' });
  } catch {
    return json({ ok: false, error: 'Unable to cancel scan' }, 503);
  }
}
