import 'server-only';

/**
 * This first-customer Instagram experiment catalog is education-specific.
 * Deployment must explicitly name allowed tenant IDs; a global switch alone
 * must never expose these drafts to every SalsysOS customer.
 */
export function instagramReplyVariantsEnabledForOrganization(
  organizationId: string | null | undefined,
): boolean {
  if (process.env.IG_REPLY_VARIANTS_ENABLED !== 'true' || !organizationId) {
    return false;
  }
  const approvedTenants = (process.env.IG_REPLY_VARIANTS_ALLOWED_ORGANIZATIONS ?? '')
    .split(',')
    .map(value => value.trim().toLowerCase())
    .filter(Boolean);
  return approvedTenants.includes(organizationId.toLowerCase());
}
