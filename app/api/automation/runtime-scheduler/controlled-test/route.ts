import { createHash, timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

import { runControlledAutomationSchedulerSweep } from '@/lib/automation/runtime-scheduler';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const CONTROLLED_TEST_ORGANIZATION_ID = '566132f7-a762-474a-85e6-e31edbf6adfb';

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function safeEqualHex(left: string, right: string) {
  if (!/^[0-9a-f]{64}$/i.test(left) || !/^[0-9a-f]{64}$/i.test(right)) return false;
  return timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}

async function authorize(authorization: string | null) {
  if (!authorization?.startsWith('Bearer ')) return false;
  const token = authorization.slice('Bearer '.length).trim();
  if (!token) return false;

  const envSecret = process.env.CRON_SECRET?.trim();
  if (envSecret && safeEqualHex(sha256(token), sha256(envSecret))) return true;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('automation_scheduler_settings')
    .select('authorization_token_sha256')
    .eq('id', 1)
    .maybeSingle();

  if (error) throw error;
  const databaseDigest = String(data?.authorization_token_sha256 ?? '').trim();
  return Boolean(databaseDigest && safeEqualHex(sha256(token), databaseDigest));
}

export async function GET(request: NextRequest) {
  const startedAt = new Date().toISOString();

  try {
    if (!(await authorize(request.headers.get('authorization')))) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const admin = createAdminClient();

    const [{ data: policy, error: policyError }, { data: provider, error: providerError }] = await Promise.all([
      admin
        .from('automation_messaging_policies')
        .select('policy_enabled,autonomous_send_enabled,requires_human_approval')
        .eq('organization_id', CONTROLLED_TEST_ORGANIZATION_ID)
        .eq('channel', 'whatsapp')
        .maybeSingle(),
      admin
        .from('automation_provider_send_settings')
        .select('provider_send_enabled,pilot_mode_enabled,pilot_max_messages')
        .eq('organization_id', CONTROLLED_TEST_ORGANIZATION_ID)
        .eq('channel', 'whatsapp')
        .maybeSingle(),
    ]);

    if (policyError) throw policyError;
    if (providerError) throw providerError;

    const failClosed =
      policy?.policy_enabled === false &&
      policy?.autonomous_send_enabled === false &&
      policy?.requires_human_approval === true &&
      provider?.provider_send_enabled === false;

    if (!failClosed) {
      return NextResponse.json(
        {
          ok: false,
          startedAt,
          finishedAt: new Date().toISOString(),
          error: 'Controlled scheduler proof requires customer-send gates to remain fail-closed.',
        },
        { status: 409 },
      );
    }

    const result = await runControlledAutomationSchedulerSweep(
      admin,
      CONTROLLED_TEST_ORGANIZATION_ID,
      { limit: 1 },
    );

    return NextResponse.json({
      ok: result.jobsFailed === 0,
      controlledTest: true,
      organizationId: CONTROLLED_TEST_ORGANIZATION_ID,
      startedAt,
      finishedAt: new Date().toISOString(),
      workflowsScanned: result.workflowsScanned,
      candidatesFound: result.candidatesFound,
      jobsClaimed: result.jobsClaimed,
      jobsCompleted: result.jobsCompleted,
      jobsRequeued: result.jobsRequeued,
      jobsFailed: result.jobsFailed,
      jobsSkipped: result.jobsSkipped,
      items: result.items,
      customerMessageSendGates: 'fail_closed',
    });
  } catch (error) {
    console.error('Controlled automation scheduler proof failed:', error);
    return NextResponse.json(
      {
        ok: false,
        controlledTest: true,
        startedAt,
        finishedAt: new Date().toISOString(),
        error: 'Controlled scheduler test failed.',
      },
      { status: 500 },
    );
  }
}
