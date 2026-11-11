/**
 * Server-only operational gate for the website-discovery pilot.
 *
 * Default is OFF, even if the API routes are deployed. Explicit enablement,
 * a nonempty exact-host allowlist and no emergency pause are all required.
 * This is a pilot safety boundary, NOT domain ownership verification.
 */
export function discoveryPilotEnabled(): boolean {
  return process.env.KNOWLEDGE_DISCOVERY_PILOT_ENABLED === 'true'
    && process.env.KNOWLEDGE_DISCOVERY_PAUSED !== 'true';
}

function canonicalHost(value: string): string {
  return value.toLowerCase().trim().replace(/\.$/, '');
}

/** Exact host authorization: apex and www are separate. Never allow suffix, alias or substring matches. */
export function discoveryHostAllowed(hostname: string): boolean {
  if (!discoveryPilotEnabled()) return false;
  const host = canonicalHost(hostname);
  const allowed = (process.env.KNOWLEDGE_DISCOVERY_ALLOWED_HOSTS ?? '')
    .split(',')
    .map(canonicalHost)
    .filter(value => /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(value) && value.includes('.'));
  return allowed.includes(host);
}
