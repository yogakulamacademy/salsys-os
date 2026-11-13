import { NextRequest, NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireCurrentOrganizationId } from '@/lib/workspace';
import {
  detectExplicitInstagramIntent,
  INSTAGRAM_REPLY_EXPERIMENTS,
} from '@/lib/instagram/reply-experiments-v1';
import { resolveVerifiedInstagramExperiment } from '@/lib/instagram/reply-resolution-server-v1';

export const dynamic = 'force-dynamic';

const noStore = { 'Cache-Control': 'no-store' };
function reply(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: noStore });
}

/**
 * Human-review preview ONLY. No event/log is written, and no provider call.
 * Authorization and Instagram policy are checked independently of the text.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ leadId: string }> },
) {
  if (process.env.IG_REPLY_VARIANTS_ENABLED !== 'true') {
    return reply({ ok: false, error: 'Instagram reply experiments are disabled.' }, 404);
  }
  if (request.headers.get('origin') !== request.nextUrl.origin) {
    return reply({ ok: false, error: 'Invalid request origin.' }, 403);
  }
  if (Number(request.headers.get('content-length') || 0) > 512) {
    return reply({ ok: false, error: 'Request too large.' }, 413);
  }
  const { leadId } = await context.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(leadId)) {
    return reply({ ok: false, error: 'Invalid lead identity.' }, 400);
  }

  let experimentId = '';
  try {
    const input = await request.text();
    if (input.length > 512) return reply({ ok: false, error: 'Request too large.' }, 413);
    const parsed = JSON.parse(input) as Record<string, unknown>;
    experimentId = typeof parsed.experimentId === 'string' ? parsed.experimentId : '';
  } catch {
    return reply({ ok: false, error: 'Invalid request payload.' }, 400);
  }
  if (!INSTAGRAM_REPLY_EXPERIMENTS.some(item => item.id === experimentId)) {
    return reply({ ok: false, error: 'Unknown Instagram experiment.' }, 400);
  }

  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return reply({ ok: false, error: 'Sign in required.' }, 401);

    const organizationId = await requireCurrentOrganizationId(supabase, user.id);
    const { data: canWork, error: accessError } = await supabase.rpc(
      'can_work_lead', { p_lead_id: leadId },
    );
    if (accessError || canWork !== true) {
      return reply({ ok: false, error: 'Lead access denied.' }, 403);
    }

    const admin = createAdminClient();
    const { data: conversation, error: conversationError } = await admin
      .from('conversations')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('lead_id', leadId)
      .eq('channel', 'instagram')
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();

    if (conversationError || !conversation) {
      return reply({ ok: false, error: 'No authorized Instagram conversation found.' }, 404);
    }

    const resolution = await resolveVerifiedInstagramExperiment({
      organizationId, leadId, experimentId,
    });
    if (!resolution.ok) {
      return reply({
        ok: false,
        error: 'Verified CRM fields are missing or the reply format is unsupported.',
        reason: resolution.reason,
        customerMessageSent: false,
      }, 422);
    }

    const { data: policy, error: policyError } = await admin.rpc(
      'evaluate_instagram_dm_send_policy_v1',
      {
        p_organization_id: organizationId,
        p_conversation_id: conversation.id,
        p_now: new Date().toISOString(),
        p_automated: false,
        p_human_approved: true,
      },
    );
    const policyRow = policy && typeof policy === 'object' && !Array.isArray(policy)
      ? policy as { allowed?: boolean; reasons?: unknown }
      : {};
    const allowed = !policyError && policyRow.allowed === true;

    const { data: inbound } = await admin
      .from('messages')
      .select('body')
      .eq('organization_id', organizationId)
      .eq('conversation_id', conversation.id)
      .eq('direction', 'inbound')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    return reply({
      ...resolution,
      canSendNow: allowed,
      policyReasons: allowed ? [] : Array.isArray(policyRow.reasons) ? policyRow.reasons.filter(x => typeof x === 'string') : ['policy_not_verified'],
      observedReplySignals: detectExplicitInstagramIntent(typeof inbound?.body === 'string' ? inbound.body : ''),
      customerMessageSent: false,
      previewOnly: true,
    });
  } catch {
    return reply({ ok: false, error: 'Instagram preview unavailable.' }, 503);
  }
}
