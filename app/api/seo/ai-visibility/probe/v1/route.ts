import { NextRequest, NextResponse } from 'next/server';

import {
  getLatestAiVisibilityProbe,
  runClaudeAiVisibilityProbe,
  type AiVisibilityProbeKind,
} from '@/lib/seo/ai-visibility-probe';
import { requireSingleActiveTenant } from '@/lib/tenant/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 90;

const MUTATION_ROLES = new Set(['owner', 'admin', 'manager']);
const SUPPORTED_PROBE_KINDS = new Set<AiVisibilityProbeKind>([
  'brand_visibility',
  'answer_visibility',
  'recommendation_visibility',
]);

function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : 'AI visibility probe failed.';
  if (message === 'AUTH_REQUIRED') return { status: 401, error: 'Authentication required.' };
  if (message === 'ACTIVE_TENANT_REQUIRED') return { status: 403, error: 'An active organization is required.' };
  if (message === 'MULTIPLE_ACTIVE_TENANTS') return { status: 409, error: 'Account tenant configuration requires attention.' };
  if (message === 'CLAUDE_NOT_CONFIGURED') return { status: 503, error: 'Claude visibility probing is not configured.' };
  if (message === 'AI_VISIBILITY_PROMPT_INVALID') return { status: 400, error: 'Probe prompt is required and must be 4,000 characters or fewer.' };
  if (message === 'AI_VISIBILITY_BRAND_IDENTITY_UNAVAILABLE') return { status: 409, error: 'Organization identity is not sufficient for deterministic visibility matching.' };
  if (message.startsWith('AI_VISIBILITY_SITE_FAILED:')) return { status: 400, error: 'The selected site is not available for this organization.' };
  if (message.startsWith('CLAUDE_REQUEST_FAILED_')) return { status: 502, error: 'Claude API request failed.' };
  return { status: 503, error: 'AI visibility probing is temporarily unavailable.' };
}

function textOrNull(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export async function GET() {
  try {
    const tenant = await requireSingleActiveTenant();
    const probe = await getLatestAiVisibilityProbe(tenant.organizationId);
    return NextResponse.json({
      ok: true,
      probe,
      guardrails: {
        observed_evidence_only: true,
        citation_measurement_supported: false,
        readiness_is_not_visibility: true,
      },
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const safe = safeError(error);
    return NextResponse.json(
      { ok: false, error: safe.error },
      { status: safe.status, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const tenant = await requireSingleActiveTenant();
    if (!MUTATION_ROLES.has(tenant.role)) {
      return NextResponse.json(
        { ok: false, error: 'You do not have permission to run AI visibility probes.' },
        { status: 403, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const promptText = typeof body?.prompt === 'string' ? body.prompt.trim() : '';
    const rawProbeKind = typeof body?.probeKind === 'string' ? body.probeKind.trim() : '';
    if (!SUPPORTED_PROBE_KINDS.has(rawProbeKind as AiVisibilityProbeKind)) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Unsupported probe kind. Use brand_visibility, answer_visibility, or recommendation_visibility.',
        },
        { status: 400, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const result = await runClaudeAiVisibilityProbe({
      organizationId: tenant.organizationId,
      createdBy: tenant.userId,
      siteId: textOrNull(body?.siteId),
      probeKind: rawProbeKind as AiVisibilityProbeKind,
      promptText,
      locale: textOrNull(body?.locale),
      countryCode: textOrNull(body?.countryCode),
    });

    return NextResponse.json({
      ok: true,
      result,
      guardrails: {
        observed_evidence_only: true,
        prompt_injected_brand_identity: false,
        citation_measurement_supported: false,
        deterministic_brand_matching: true,
      },
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const safe = safeError(error);
    return NextResponse.json(
      { ok: false, error: safe.error },
      { status: safe.status, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
