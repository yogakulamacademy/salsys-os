import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { ClaimedAdActivationDelivery } from "@/lib/ad-activation/delivery-queue";

export type AdActivationExecutionProvider = "meta" | "google";

export async function claimAdActivationDeliveriesForProvider(
  provider: AdActivationExecutionProvider,
  limit = 10,
  leaseSeconds = 300,
): Promise<ClaimedAdActivationDelivery[]> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc(
    "claim_ad_activation_deliveries_v2",
    {
      p_provider: provider,
      p_limit: limit,
      p_lease_seconds: leaseSeconds,
    },
  );

  if (error) {
    throw new Error(`Provider-scoped ad activation claim failed: ${error.message}`);
  }

  return Array.isArray(data)
    ? (data as ClaimedAdActivationDelivery[])
    : [];
}

export async function renewAdActivationDeliveryLease(
  delivery: Pick<ClaimedAdActivationDelivery, "outbox_id" | "lease_token">,
  leaseSeconds = 300,
): Promise<{ renewed: boolean; reason?: string; lease_expires_at?: string }> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc(
    "renew_ad_activation_delivery_lease_v1",
    {
      p_outbox_id: delivery.outbox_id,
      p_lease_token: delivery.lease_token,
      p_lease_seconds: leaseSeconds,
    },
  );

  if (error) {
    throw new Error(`Ad activation lease renewal failed: ${error.message}`);
  }

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Ad activation lease renewal returned an invalid result.");
  }

  return data as { renewed: boolean; reason?: string; lease_expires_at?: string };
}
