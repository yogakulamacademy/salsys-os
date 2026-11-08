import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireCurrentOrganizationId } from '@/lib/workspace';
import { isExplicitCrossSiteRequest } from '@/lib/security/fetch-metadata';
import { parseWebsiteSeed } from '@/lib/knowledge-discovery/url-policy';
import { discoveryPilotEnabled, discoveryHostAllowed } from '@/lib/knowledge-discovery/pilot-gate';
import { fetchPublicWeb, evaluateRobots } from '@/lib/knowledge-discovery/public-fetch';
import {
  DOMAIN_PROOF_PATH, newDomainChallenge, domainProofMatches,
  discoveryVerificationHost, discoveryDomainVerified,
} from '@/lib/knowledge-discovery/domain-verification';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;
const noStore = { 'Cache-Control': 'no-store' };
const json = (body: object, status = 200) =>
  NextResponse.json(body, { status, headers: noStore });

function sameOrigin(request: NextRequest): boolean {
  if (isExplicitCrossSiteRequest(request)) return false;
  const origin = request.headers.get('origin');
  if (!origin) return request.headers.get('sec-fetch-site') === 'same-origin';
  try { return new URL(origin).origin === request.nextUrl.origin; }
  catch { return false; }
}

async function context() {
  const client = await createClient();
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) return null;
  const org = await requireCurrentOrganizationId(client, user.id);
  const { data: canManage, error: permissionError } =
    await client.rpc('can_manage_organization', { p_organization_id: org });
  if (permissionError || canManage !== true) return null;
  // KB-09K: a generic admin check alone does not establish a live,
  // tenant-bound auth.sessions entry for a privileged proof workflow.
  const { data: boundActor, error: actorError } = await client.rpc(
    'kb_discovery_consent_actor_v1', { p_org: org },
  );
  if (actorError || boundActor !== user.id) return null;
  const { data: onboarding, error: websiteError } = await client
    .from('organization_onboarding').select('website_url').eq('organization_id', org).maybeSingle();
  if (websiteError || !onboarding?.website_url) return null;
  const seed = parseWebsiteSeed(onboarding.website_url);
  // A proof must be hosted directly at the configured HTTPS hostname.
  if (seed.protocol !== 'https:' || !discoveryPilotEnabled() || !discoveryHostAllowed(seed.hostname)) return null;
  return { client, org, userId: user.id, seed, hostname: discoveryVerificationHost(seed.hostname) };
}

type VerificationRow = {
  issued_at: string;
  challenge_expires_at: string;
  challenge_hash: string;
  verified_at: string | null;
  verified_until: string | null;
};

async function readVerification(org: string, hostname: string): Promise<VerificationRow | null> {
  const { data, error } = await createAdminClient().from('knowledge_discovery_domain_verifications')
    .select('issued_at,challenge_expires_at,challenge_hash,verified_at,verified_until')
    .eq('organization_id', org).eq('hostname', hostname).maybeSingle();
  if (error) throw error;
  return data as VerificationRow | null;
}

export async function GET() {
  try {
    const ctx = await context();
    if (!ctx) return json({ ok: false, error: 'Not authorized or pilot not enabled' }, 403);
    const row = await readVerification(ctx.org, ctx.hostname);
    return json({ ok: true, hostname: ctx.seed.hostname, proofPath: DOMAIN_PROOF_PATH,
      status: discoveryDomainVerified(row) ? 'verified' :
        row && Date.parse(row.challenge_expires_at) > Date.now() ? 'pending' : 'unverified',
      challengeExpiresAt: row?.challenge_expires_at ?? null,
      verifiedUntil: row?.verified_until ?? null });
  } catch {
    return json({ ok: false, error: 'Ownership status unavailable' }, 503);
  }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return json({ ok: false, error: 'Origin rejected' }, 403);
  try {
    const ctx = await context();
    if (!ctx) return json({ ok: false, error: 'Not authorized or pilot not enabled' }, 403);
    // The database owns the cooldown check and the upsert in one transaction.
    // Two simultaneous admin requests cannot issue conflicting valid tokens.
    const challenge = newDomainChallenge();
    const { data: expiry, error } = await ctx.client.rpc(
      'issue_knowledge_discovery_challenge_for_admin_v1',
      {
        p_organization_id: ctx.org,
        p_hostname: ctx.hostname,
        p_challenge_hash: challenge.tokenHash,
      },
    );
    if (error?.code === 'P0001' && error.message === 'domain_already_verified') {
      return json({ ok: false, error: 'Website ownership is already verified.' }, 409);
    }
    if (error?.code === 'P0001' && error.message === 'domain_challenge_cooldown') {
      return json({ ok: false,
        error: 'An ownership challenge was recently issued. Try again later.' }, 429);
    }
    if (error || !expiry) throw error ?? new Error('Challenge issue failed');
    return json({ ok: true, hostname: ctx.seed.hostname, proofPath: DOMAIN_PROOF_PATH,
      token: challenge.token, challengeExpiresAt: expiry, status: 'pending' }, 201);
  } catch {
    return json({ ok: false, error: 'Could not issue ownership challenge' }, 503);
  }
}

export async function PUT(request: NextRequest) {
  if (!sameOrigin(request)) return json({ ok: false, error: 'Origin rejected' }, 403);
  try {
    const ctx = await context();
    if (!ctx) return json({ ok: false, error: 'Not authorized or pilot not enabled' }, 403);
    const existing = await readVerification(ctx.org, ctx.hostname);
    if (!existing || Date.parse(existing.challenge_expires_at) <= Date.now()) {
      return json({ ok: false, error: 'Ownership challenge missing or expired.' }, 409);
    }
    const { data: canCheck, error: checkError } = await ctx.client.rpc(
      'claim_knowledge_discovery_proof_check_for_admin_v1',
      {
        p_organization_id: ctx.org,
        p_hostname: ctx.hostname,
        p_challenge_hash: existing.challenge_hash,
      },
    );
    if (checkError) throw checkError;
    if (canCheck !== true) return json({
      ok: false, error: 'Website verification was checked recently. Try again shortly.',
    }, 429);
    const verificationUrl = new URL(DOMAIN_PROOF_PATH, ctx.seed.origin);
    // Respect robots before accessing even the well-known ownership proof.
    const robots = await fetchPublicWeb(ctx.seed, new URL('/robots.txt', ctx.seed.origin), 'robots');
    if (robots.status !== 404 &&
        !evaluateRobots(robots.body, DOMAIN_PROOF_PATH, 'salsysosknowledgebot').allowed) {
      return json({ ok: false, error: 'Website robots policy blocks ownership proof.' }, 409);
    }
    const proof = await fetchPublicWeb(ctx.seed, verificationUrl, 'verification');
    if (proof.status !== 200 || !domainProofMatches(proof.body, existing.challenge_hash)) {
      return json({ ok: false, error: 'The verification file does not match the issued challenge.' }, 422);
    }
    // Reaffirm the exact signed-in owner/admin session after network I/O.
    // This is not a substitute for independently staged Auth races.
    const session = await ctx.client.rpc('kb_discovery_consent_actor_v1', {
      p_org: ctx.org,
    });
    if (session.error || session.data !== ctx.userId) {
      return json({ ok: false, error: 'Not authorized or pilot not enabled' }, 403);
    }
    // Only the server, after a real matching website proof, may request this
    // narrow service-only CAS. Never perform a privileged table UPDATE.
    const { data, error } = await createAdminClient().rpc(
      'confirm_checked_knowledge_discovery_proof_v1',
      {
        p_organization_id: ctx.org,
        p_hostname: ctx.hostname,
        p_challenge_hash: existing.challenge_hash,
      },
    );
    if (error) throw error;
    if (data?.ok !== true || data?.status !== 'verified') {
      return json({ ok: false, error: 'Ownership challenge changed or expired.' }, 409);
    }
    const verifiedUntil = data.verified_until;
    if (typeof verifiedUntil !== 'string' ||
        !Number.isFinite(Date.parse(verifiedUntil)) ||
        Date.parse(verifiedUntil) <= Date.now() ||
        Date.parse(verifiedUntil) > Date.now() + 31 * 24 * 60 * 60_000) {
      throw new Error('proof_completion_not_confirmed');
    }
    return json({ ok: true, status: 'verified', verifiedUntil });
  } catch {
    return json({ ok: false, error: 'Could not verify website ownership.' }, 503);
  }
}
