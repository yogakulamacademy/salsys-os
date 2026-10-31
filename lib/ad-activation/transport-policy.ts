import "server-only";

/**
 * Phase 7C keeps provider transport deliberately disabled.
 *
 * This is a compile-time policy boundary, not an environment toggle. A later
 * explicitly authorized phase must change code and pass review before any
 * provider transmission can occur.
 */
export const AD_ACTIVATION_TRANSPORT_ENABLED = false as const;

export function assertAdActivationTransportDisabled() {
  if (AD_ACTIVATION_TRANSPORT_ENABLED !== false) {
    throw new Error("Ad activation transport policy drift detected.");
  }
}
