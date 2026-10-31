import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export type AdActivationRunnerProvider = "meta" | "google";

export type AdActivationRunnerLease =
  | {
      acquired: true;
      provider: AdActivationRunnerProvider;
      leaseToken: string;
      leaseExpiresAt: string;
    }
  | {
      acquired: false;
      provider: AdActivationRunnerProvider;
      reason: string;
      leaseExpiresAt: string | null;
    };

export type AdActivationRunnerTelemetry = {
  status: "completed" | "disabled" | "failed";
  claimed: number;
  delivered: number;
  retry: number;
  skipped: number;
  failed: number;
  leaseLost: number;
  errorCode?: string | null;
};

export type AdActivationCanaryScope = {
  destinationId: string;
  personId: string;
};

function objectValue(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function uuidValue(value: string | undefined) {
  const candidate = value?.trim().toLowerCase() ?? "";
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(candidate)
    ? candidate
    : null;
}

/**
 * Runtime kill switch. This is intentionally opt-in: missing, blank or any
 * value other than "true" keeps the activation runner disabled.
 *
 * Live provider transport still has its own compile-time gate, so a real send
 * requires BOTH reviewed code enablement and this runtime switch.
 */
export function isAdActivationRunnerEnabled() {
  return process.env.AD_ACTIVATION_RUNNER_ENABLED?.trim().toLowerCase() === "true";
}

/**
 * Initial live operation is canary-only. Both IDs must be explicit UUIDs.
 * There is intentionally no broad/live fallback in Phase 7D.4.
 */
export function getAdActivationCanaryScope(): AdActivationCanaryScope | null {
  const destinationId = uuidValue(process.env.AD_ACTIVATION_CANARY_DESTINATION_ID);
  const personId = uuidValue(process.env.AD_ACTIVATION_CANARY_PERSON_ID);

  if (!destinationId || !personId) {
    return null;
  }

  return { destinationId, personId };
}

export async function acquireAdActivationRunnerLease(
  provider: AdActivationRunnerProvider,
  leaseSeconds = 300,
): Promise<AdActivationRunnerLease> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("acquire_ad_activation_runner_lease_v1", {
    p_provider: provider,
    p_lease_seconds: Math.max(60, Math.min(leaseSeconds, 900)),
  });

  if (error) {
    throw new Error("Ad activation runner lease acquisition failed.");
  }

  const result = objectValue(data);
  if (result.acquired === true && typeof result.lease_token === "string") {
    return {
      acquired: true,
      provider,
      leaseToken: result.lease_token,
      leaseExpiresAt: typeof result.lease_expires_at === "string" ? result.lease_expires_at : "",
    };
  }

  return {
    acquired: false,
    provider,
    reason: typeof result.reason === "string" ? result.reason : "runner_lease_unavailable",
    leaseExpiresAt: typeof result.lease_expires_at === "string" ? result.lease_expires_at : null,
  };
}

export async function releaseAdActivationRunnerLease(input: {
  provider: AdActivationRunnerProvider;
  leaseToken: string;
  telemetry: AdActivationRunnerTelemetry;
}) {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("release_ad_activation_runner_lease_v1", {
    p_provider: input.provider,
    p_lease_token: input.leaseToken,
    p_status: input.telemetry.status,
    p_claimed: input.telemetry.claimed,
    p_delivered: input.telemetry.delivered,
    p_retry: input.telemetry.retry,
    p_skipped: input.telemetry.skipped,
    p_failed: input.telemetry.failed,
    p_lease_lost: input.telemetry.leaseLost,
    p_error_code: input.telemetry.errorCode ?? null,
  });

  if (error) {
    throw new Error("Ad activation runner lease release failed.");
  }

  return objectValue(data);
}
