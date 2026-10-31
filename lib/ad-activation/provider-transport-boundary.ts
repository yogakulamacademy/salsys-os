import "server-only";

import type { AdActivationProviderDryRun } from "@/lib/ad-activation/provider-dry-run";
import type { AdActivationProviderResult } from "@/lib/ad-activation/types";
import { AD_ACTIVATION_TRANSPORT_ENABLED } from "@/lib/ad-activation/transport-policy";

export type AdActivationTransportContext = {
  organizationId: string;
  connectionId: string;
  destinationId: string;
  outboxId: string;
};

export type AdActivationTransportAdapter = {
  provider: "meta" | "google";
  send(input: {
    context: AdActivationTransportContext;
    prepared: Extract<AdActivationProviderDryRun, { status: "ready" }>;
  }): Promise<AdActivationProviderResult>;
};

/**
 * Hard transport boundary for Phase 7C.
 *
 * No adapter is invoked while transport is disabled. This means credential
 * decryption and provider HTTP calls remain unreachable through this execution
 * path even if an adapter is accidentally registered.
 */
export async function executeAdActivationTransport(input: {
  context: AdActivationTransportContext;
  prepared: AdActivationProviderDryRun;
  adapters?: readonly AdActivationTransportAdapter[];
}): Promise<AdActivationProviderResult> {
  const prepared = input.prepared;
  if (prepared.status !== "ready") {
    return { status: "skipped", reason: prepared.reason };
  }

  if (AD_ACTIVATION_TRANSPORT_ENABLED === false) {
    return { status: "skipped", reason: "provider_transport_disabled" };
  }

  // This branch is intentionally unreachable in Phase 7C. A later authorized
  // phase must change the compile-time policy and add reviewed live adapters.
  const adapter = input.adapters?.find((candidate) => candidate.provider === prepared.provider);
  if (!adapter) {
    return { status: "failed", errorCode: "provider_adapter_missing", errorMessage: "No provider transport adapter is registered." };
  }

  return adapter.send({
    context: input.context,
    prepared,
  });
}
