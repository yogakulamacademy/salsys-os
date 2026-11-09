import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { inspectReadOnlyGateRequest, type GateToolId } from './read-only-tool-gate-v1';

/**
 * AI-09E: server-owned Supabase Auth -> future dedicated binding RPC preflight.
 *
 * REVIEW-ONLY. Not imported by Co-Pilot, routes, or Knowledge actions.
 * The dedicated DB RPC named below is intentionally NOT installed, so this
 * module fails closed in any existing hosted environment.
 *
 * NO authorization to read data or run tools is returned by this module.
 * A future read-and-audit SQL transaction must still re-validate the signed
 * session, direct tenant binding, role, per-resource access and consent.
 */
export const READ_ONLY_AUTH_BOUNDARY_RUNTIME_WIRED = false as const;

/** Explicit new RPC, never current_tenant_organization_id() or a fallback. */
export const REQUIRED_BOUND_SESSION_RPC = 'ai_read_current_bound_session_v1' as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ReviewDenial = 'invalid_request' | 'unauthenticated' | 'binding_unavailable' | 'binding_denied';

type ReviewResult =
  | Readonly<{ ok: false; reason: ReviewDenial; mayExecute: false }>
  | Readonly<{
      ok: true;
      decision: 'session_binding_review_only';
      toolId: GateToolId;
      organizationId: string;
      nextRequiredControl: 'atomic_resource_read_and_committed_audit';
      mayExecute: false;
    }>;

function deny(reason: ReviewDenial): ReviewResult {
  return Object.freeze({ ok: false, reason, mayExecute: false as const });
}

function plainRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return null;
  if (Reflect.ownKeys(value).some(k => typeof k !== 'string')) return null;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Object.values(descriptors).some(d => !Object.hasOwn(d, 'value'))) return null;
  return value as Record<string, unknown>;
}

function exactly(value: Record<string, unknown>, fields: readonly string[]): boolean {
  return Reflect.ownKeys(value).length === fields.length &&
    fields.every(key => Object.hasOwn(value, key));
}

/**
 * Only a reviewed, server-owned private SQL function may supply this shape.
 * An RPC response is not by itself proof of a trusted migration. DBA/security
 * must approve its effective grants, security-definer owner and session locks.
 *
 * Critical: generic SalsysOS workspace resolvers may auto-bind or fall back
 * to the only active membership. Neither behavior is acceptable for AI tools.
 */
function inspectDirectBinding(value: unknown, authenticatedUserId: string, requestedOrganizationId: string): boolean {
  const row = plainRecord(value);
  if (!row || !exactly(row, [
    'schema_version', 'user_id', 'session_id', 'organization_id',
    'membership_role', 'session_active', 'membership_active',
    'organization_active', 'binding_source',
  ])) return false;

  return row.schema_version === 1 &&
    typeof row.user_id === 'string' && UUID.test(row.user_id) &&
    row.user_id === authenticatedUserId &&
    typeof row.session_id === 'string' && UUID.test(row.session_id) &&
    typeof row.organization_id === 'string' && UUID.test(row.organization_id) &&
    row.organization_id === requestedOrganizationId &&
    (row.membership_role === 'owner' || row.membership_role === 'admin') &&
    row.session_active === true &&
    row.membership_active === true &&
    row.organization_active === true &&
    row.binding_source === 'direct_live_session_binding';
}

/**
 * This checks the user from Auth.getUser() on a server cookie-scoped Supabase
 * client, not from model or browser-proposed actor/role/session IDs.
 *
 * It then calls ONLY a proposed dedicated RPC with the requested organization
 * ID as a *scope hint*. That RPC is uninstalled, and the code never uses a
 * service-role client or a general fallback workspace helper.
 *
 * A valid preview reveals no actor, session or CRM data; mayExecute remains
 * false. It must never be treated as an execution authorization.
 */
export async function previewCurrentAuthenticatedReadBoundary(proposal: unknown): Promise<ReviewResult> {
  const request = inspectReadOnlyGateRequest(proposal);
  if (!request) return deny('invalid_request');

  try {
    const session = await createClient();
    const { data: { user }, error: authError } = await session.auth.getUser();
    if (authError || !user?.id || !UUID.test(user.id)) return deny('unauthenticated');

    // This RPC MUST later be owned/approved by an independent DBA; it must
    // resolve auth.uid() and auth.jwt().session_id internally and require the
    // live auth.sessions row and exact tenant_session_bindings record.
    // Never pass actor/session/role, never invoke service-role bypass helpers.
    const { data: binding, error: bindingError } = await session.rpc(
      REQUIRED_BOUND_SESSION_RPC,
      { p_organization_id: request.organizationId },
    );
    if (bindingError || !binding) return deny('binding_unavailable');
    if (!inspectDirectBinding(binding, user.id, request.organizationId)) {
      return deny('binding_denied');
    }

    // This is NOT a lead grant or consent check. AI-09D's future production
    // replacement must do that inside the actual read + audit transaction.
    return Object.freeze({
      ok: true as const,
      decision: 'session_binding_review_only' as const,
      toolId: request.toolId,
      organizationId: request.organizationId,
      nextRequiredControl: 'atomic_resource_read_and_committed_audit' as const,
      mayExecute: false as const,
    });
  } catch {
    // Never return provider diagnostics, SQL errors, session IDs or JWT.
    return deny('binding_unavailable');
  }
}
