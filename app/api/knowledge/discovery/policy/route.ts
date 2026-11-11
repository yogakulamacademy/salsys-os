import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireCurrentOrganizationId } from '@/lib/workspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const SHA = /^[a-f0-9]{64}$/;
const noStore = { 'Cache-Control': 'no-store' };
const json = (body: object, status = 200) =>
  NextResponse.json(body, { status, headers: noStore });

/**
 * KB-06E: read-only operator-registered policy artifact.
 * DO NOT conflate DB registry with independent legal/policy authorization.
 * No grant/approval UI, no service-role application reads or writes.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user || !UUID.test(user.id))
      return json({ ok: false, error: 'Unauthorized' }, 403);
    const org = await requireCurrentOrganizationId(supabase, user.id);
    if (!UUID.test(org ?? '')) return json({ ok: false, error: 'Unauthorized' }, 403);
    const access = await supabase.rpc('can_manage_organization', {
      p_organization_id: org,
    });
    if (access.error || access.data !== true)
      return json({ ok: false, error: 'Unauthorized' }, 403);

    // OFF by default. Never query unapplied KB tables/functions on main.
    if (process.env.KNOWLEDGE_DISCOVERY_POLICY_REVIEW_ENABLED !== 'true')
      return json({ ok: true, reviewEnabled: false, available: false });

    // Strict exact-session tenant actor is rechecked inside the RPC.
    const { data, error } = await supabase.rpc('get_knowledge_discovery_policy_preview_v1', {
      p_organization_id: org,
    });
    if (error) return json({ ok: false, error: 'Policy review unavailable' }, 403);
    if (data?.ok !== true)
      return json({ ok: true, reviewEnabled: true, available: false });

    const version = data.policyVersion;
    const digest = data.policySha256;
    const policyText = data.policyText;
    const reference = data.sourceReference;
    const recordedAt = data.recordedAt;
    const registryRecordedAt = data.registryRecordedAt;
    if (typeof version !== 'string' || version.trim().length < 1 || version.length > 100 ||
        typeof digest !== 'string' || !SHA.test(digest) ||
        typeof policyText !== 'string' ||
        Buffer.byteLength(policyText, 'utf8') < 40 || Buffer.byteLength(policyText, 'utf8') > 16000 ||
        typeof reference !== 'string' || reference.trim().length < 1 || reference.length > 500 ||
        typeof recordedAt !== 'string' || !Number.isFinite(Date.parse(recordedAt)) ||
        typeof registryRecordedAt !== 'string' || !Number.isFinite(Date.parse(registryRecordedAt)) ||
        createHash('sha256').update(policyText, 'utf8').digest('hex') !== digest)
      return json({ ok: false, error: 'Policy artifact verification failed' }, 503);

    return json({
      ok: true, reviewEnabled: true, available: true,
      // Registered document, not independent legal-review proof or permission.
      policyVersion: version, policySha256: digest, policyText,
      sourceReference: reference, recordedAt, registryRecordedAt,
    });
  } catch {
    return json({ ok: false, error: 'Policy review unavailable' }, 503);
  }
}
