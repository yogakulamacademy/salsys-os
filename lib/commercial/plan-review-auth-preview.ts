import 'server-only';

/**
 * R13-P1 PRE-RELEASE AUTHORIZATION ADAPTER.
 *
 * Inert until imported by a separately reviewed server route/service. Reuses
 * SalsysOS's authenticated tenant resolver and independently re-checks
 * current active membership, profile and organization via the session client.
 *
 * Does NOT query future saas_* tables, expose a public endpoint, or hold a
 * service-role credential. It does NOT prove session revocation handling or
 * real second-tenant acceptance; those require independent verification.
 */
import { createClient } from '@/lib/supabase/server';
import { getCurrentWorkspaceContext } from '@/lib/workspace';

export type CommercialReviewScope = 'platform_plan_review' | 'current_tenant_plan_read';

export type CommercialReviewAuthContext = Readonly<{
  actorUserId: string;
  organizationId: string;
  organizationSlug: string;
  role: 'owner' | 'admin';
  scope: CommercialReviewScope;
  readonlyOnly: true;
  canChangeSubscriptions: false;
  canCharge: false;
  canActivateCapabilities: false;
}>;

type VerifiedIdentity = Readonly<{
  actorUserId: string;
  organizationId: string;
  organizationSlug: string;
  role: 'owner' | 'admin';
}>;

async function verifyCurrentCommercialIdentity(): Promise<VerifiedIdentity> {
  const session = await createClient();
  const { data: { user }, error: authError } = await session.auth.getUser();
  if (authError || !user?.id) {
    throw new Error('commercial_authentication_required');
  }

  // The tenant is resolved by the existing authenticated SalsysOS workspace
  // contract. Never use a caller-supplied organization or role.
  const workspace = await getCurrentWorkspaceContext(session);
  const active = workspace.activeWorkspace;
  if (!active || !workspace.activeOrganizationId ||
      workspace.activeOrganizationId !== active.organizationId) {
    throw new Error('commercial_active_tenant_required');
  }
  if (!['owner', 'admin'].includes(active.role)) {
    throw new Error('commercial_owner_or_admin_required');
  }

  // Workspace data alone must not elevate a stale/revoked membership.
  const [profileResult, memberResult, organizationResult] = await Promise.all([
    session.from('profiles')
      .select('active')
      .eq('id', user.id)
      .maybeSingle(),
    session.from('organization_members')
      .select('role,active')
      .eq('user_id', user.id)
      .eq('organization_id', active.organizationId)
      .eq('active', true)
      .maybeSingle(),
    session.from('organizations')
      .select('id,slug,status')
      .eq('id', active.organizationId)
      .maybeSingle(),
  ]);

  if (profileResult.error || profileResult.data?.active !== true) {
    throw new Error('commercial_active_profile_required');
  }

  const member = memberResult.data;
  if (memberResult.error || member?.active !== true ||
      !['owner', 'admin'].includes(String(member.role))) {
    throw new Error('commercial_active_owner_membership_required');
  }

  const organization = organizationResult.data;
  if (organizationResult.error || organization?.status !== 'active' ||
      organization?.id !== active.organizationId ||
      organization?.slug !== active.organizationSlug) {
    throw new Error('commercial_active_organization_required');
  }

  // Fail closed if stale workspace role disagrees with current membership.
  if (active.role !== member.role) {
    throw new Error('commercial_membership_role_changed');
  }

  return Object.freeze({
    actorUserId: user.id,
    organizationId: organization.id,
    organizationSlug: organization.slug,
    role: member.role as 'owner' | 'admin',
  });
}

export async function requireCommercialPlatformReviewPreview():
  Promise<CommercialReviewAuthContext> {
  const current = await verifyCurrentCommercialIdentity();
  if (current.organizationSlug !== 'salsysos') {
    throw new Error('commercial_platform_tenant_required');
  }
  return Object.freeze({
    ...current,
    scope: 'platform_plan_review',
    readonlyOnly: true,
    canChangeSubscriptions: false,
    canCharge: false,
    canActivateCapabilities: false,
  });
}

/**
 * This permits only the CURRENT session-bound tenant, never an arbitrary
 * organization ID chosen by a caller. It returns identity/scope only, not
 * commercial records. A later service must separately accept R13-P0 ACLs.
 */
export async function requireCurrentTenantPlanReadPreview():
  Promise<CommercialReviewAuthContext> {
  const current = await verifyCurrentCommercialIdentity();
  return Object.freeze({
    ...current,
    scope: 'current_tenant_plan_read',
    readonlyOnly: true,
    canChangeSubscriptions: false,
    canCharge: false,
    canActivateCapabilities: false,
  });
}
