import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { getWorkspaceContextForUser } from '@/lib/workspace';
import { bearerMatchesAnySecret } from '@/lib/security/machine-bearer-auth';
import { inspectInstagramEchoSubscription, reconcileInstagramMessageHistory } from '@/lib/integrations/instagram-history-reconciliation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function reply(payload: Record<string, unknown>, status = 200) {
  return NextResponse.json(payload, { status, headers: { 'Cache-Control': 'no-store' } });
}

// Cron is server-authenticated and is entirely dormant until explicitly enabled.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || !bearerMatchesAnySecret(request.headers.get('authorization'), [secret])) {
    return reply({ ok: false, error: 'Unauthorized' }, 401);
  }
  if (process.env.INSTAGRAM_HISTORY_SYNC_ENABLED !== 'true') {
    return reply({ ok: true, enabled: false, customerMessageSent: false });
  }
  try {
    const admin = createAdminClient();
    const { data: connections, error } = await admin.from('integration_connections')
      .select('organization_id,external_account_id')
      .eq('provider', 'instagram').eq('status', 'connected').limit(10);
    if (error) throw new Error('Instagram integration inventory failed.');
    const results: Array<Record<string, unknown>> = [];
    for (const connection of connections ?? []) {
      if (!connection.organization_id || !connection.external_account_id) continue;
      try {
        const report = await reconcileInstagramMessageHistory({
          organizationId: String(connection.organization_id),
          accountId: String(connection.external_account_id),
          apply: true,
        });
        results.push({ ok: true, ...report });
      } catch (err) {
        console.error('Instagram history reconciliation pass failed.', {
          organizationId: connection.organization_id,
          error: err instanceof Error ? err.message : 'Unknown history error',
        });
        results.push({ ok: false, error: 'Provider history synchronization failed.' });
      }
    }
    const ok = results.every(row => row.ok === true);
    return reply({ ok, enabled: true, runs: results, customerMessageSent: false }, ok ? 200 : 502);
  } catch {
    return reply({ ok: false, error: 'Instagram history synchronization failed.', customerMessageSent: false }, 500);
  }
}

// Admin-only same-origin manual preview; write mode requires deployment flag.
export async function POST(request: NextRequest) {
  if (request.headers.get('origin') !== request.nextUrl.origin) {
    return reply({ ok: false, error: 'Invalid request origin.' }, 403);
  }
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return reply({ ok: false, error: 'Authentication required.' }, 401);

  const { data: profile, error: profileError } = await supabase.from('profiles')
    .select('active').eq('id', user.id).maybeSingle();
  if (profileError || profile?.active !== true) return reply({ ok: false, error: 'Account inactive.' }, 403);

  const workspace = await getWorkspaceContextForUser(supabase, user.id);
  if (!workspace.activeWorkspace || !['owner', 'admin'].includes(workspace.activeWorkspace.role)) {
    return reply({ ok: false, error: 'Admin workspace access required.' }, 403);
  }

  const length = Number(request.headers.get('content-length') || '0');
  if (!Number.isFinite(length) || length > 2048) return reply({ ok: false, error: 'Invalid body.' }, 413);
  const body = await request.json().catch(() => null) as { connectionId?: unknown; apply?: unknown; mode?: unknown } | null;
  if (!body || typeof body !== 'object') return reply({ ok: false, error: 'Invalid JSON body.' }, 400);
  const apply = body.apply === true;
  if (apply && process.env.INSTAGRAM_HISTORY_SYNC_ENABLED !== 'true') {
    return reply({ ok: false, error: 'Instagram history import is not enabled for this deployment.' }, 409);
  }

  const admin = createAdminClient();
  const organizationId = workspace.activeWorkspace.organizationId;
  const connectionId = typeof body.connectionId === 'string' ? body.connectionId.trim() : '';
  if (!/^[0-9a-f-]{36}$/i.test(connectionId)) {
    return reply({ ok: false, error: 'Invalid Instagram connection.' }, 400);
  }
  const { data: connection, error: connectedError } = await admin.from('integration_connections')
    .select('id,external_account_id')
    .eq('organization_id', organizationId).eq('provider', 'instagram')
    .eq('status', 'connected').eq('id', connectionId).maybeSingle();
  if (connectedError || !connection?.external_account_id) {
    return reply({ ok: false, error: 'Instagram account is not linked to this workspace.' }, 403);
  }
  try {
    if (body.mode === 'echo_status') {
      const status = await inspectInstagramEchoSubscription(
        organizationId, String(connection.external_account_id),
      );
      return reply({ ok: true, ...status });
    }
    const report = await reconcileInstagramMessageHistory({
      organizationId, accountId: String(connection.external_account_id), apply,
    });
    return reply({ ok: true, ...report });
  } catch (err) {
    console.error('Instagram history preview/import failed.', {
      organizationId, message: err instanceof Error ? err.message : 'Unknown error',
    });
    return reply({ ok: false, error: 'Instagram message history is unavailable for this connection.', customerMessageSent: false }, 502);
  }
}
