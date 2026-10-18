import { NextRequest, NextResponse } from 'next/server';

import { getLatestClaudeSeoIntelligence, runClaudeSeoIntelligence } from '@/lib/seo/claude-intelligence';
import { requireSingleActiveTenant } from '@/lib/tenant/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 90;

const MUTATION_ROLES = new Set(['owner', 'admin', 'manager']);

function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : 'Claude SEO intelligence failed.';
  if (message === 'AUTH_REQUIRED') return { status: 401, error: 'Authentication required.' };
  if (message === 'ACTIVE_TENANT_REQUIRED') return { status: 403, error: 'An active organization is required.' };
  if (message === 'MULTIPLE_ACTIVE_TENANTS') return { status: 409, error: 'Account tenant configuration requires attention.' };
  if (message === 'CLAUDE_NOT_CONFIGURED') return { status: 503, error: 'Claude analysis is not configured.' };
  if (message.startsWith('CLAUDE_REQUEST_FAILED_')) return { status: 502, error: 'Claude API request failed.' };
  return { status: 503, error: 'Claude SEO intelligence is temporarily unavailable.' };
}

export async function GET() {
  try {
    const tenant = await requireSingleActiveTenant();
    const analysis = await getLatestClaudeSeoIntelligence(tenant.organizationId);
    return NextResponse.json({
      ok: true,
      analysis,
      live_rank_provider_connected: false,
      ranking_evidence_status: 'unavailable_without_live_rank_provider',
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const safe = safeError(error);
    return NextResponse.json({ ok: false, error: safe.error }, { status: safe.status, headers: { 'Cache-Control': 'no-store' } });
  }
}

export async function POST(_request: NextRequest) {
  try {
    const tenant = await requireSingleActiveTenant();
    if (!MUTATION_ROLES.has(tenant.role)) {
      return NextResponse.json({ ok: false, error: 'You do not have permission to run Claude SEO analysis.' }, { status: 403 });
    }

    const analysis = await runClaudeSeoIntelligence(tenant.organizationId);
    return NextResponse.json({
      ok: true,
      analysis,
      guardrail: 'analysis_only_human_approval_required',
      live_rank_provider_connected: false,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const safe = safeError(error);
    return NextResponse.json({ ok: false, error: safe.error }, { status: safe.status, headers: { 'Cache-Control': 'no-store' } });
  }
}
