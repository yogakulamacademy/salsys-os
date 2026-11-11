/**
 * KB-06A: fail-closed, read-only tenant/hostname consent evaluator.
 *
 * Website ownership, environment allowlisting and consent are independent
 * requirements. This never creates consent or authorizes knowledge storage.
 * Missing/unapplied staging tables, bad RPC responses or expired approvals
 * must prevent any NEW discovery network request.
 */
type ConsentRecord = {
  organization_id?: unknown;
  hostname?: unknown;
  purpose?: unknown;
  status?: unknown;
  policy_version?: unknown;
  granted_by?: unknown;
  granted_at?: unknown;
  valid_until?: unknown;
  withdrawn_at?: unknown;
};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HOST=/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/;

export function discoverySiteConsentActive(
  row: unknown,
  organizationId: string,
  hostname: string,
  at = Date.now(),
): boolean {
  if (!row || typeof row!=='object' || Array.isArray(row) ||
      typeof organizationId!=='string'||!UUID.test(organizationId)||
      typeof hostname!=='string'||hostname.length>253||!HOST.test(hostname)||
      !Number.isFinite(at))return false;
  const c=row as ConsentRecord;
  if (c.organization_id!==organizationId ||
      c.hostname!==hostname ||
      c.purpose!=='website_discovery_review_only'||
      c.status!=='granted' ||
      c.withdrawn_at!==null ||
      typeof c.granted_by!=='string'||!UUID.test(c.granted_by)||
      typeof c.policy_version!=='string'||
      !c.policy_version.trim()||c.policy_version.length>100||
      typeof c.granted_at!=='string'||
      typeof c.valid_until!=='string')return false;
  const granted=Date.parse(c.granted_at);
  const expires=Date.parse(c.valid_until);
  return Number.isFinite(granted)&&Number.isFinite(expires)&&
    granted<=at&&expires>at&&expires>granted;
}
