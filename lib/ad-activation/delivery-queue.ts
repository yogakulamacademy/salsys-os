import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type {
  AdActivationAction,
  AdActivationSafeMetadata,
} from "@/lib/ad-activation/types";

export type ClaimedAdActivationDelivery = {
  outbox_id: string;
  lease_token: string;
  organization_id: string;
  destination_id: string;
  audience_id: string;
  person_id: string;
  lead_id: string | null;
  membership_id: string | null;
  action: AdActivationAction;
  safe_metadata: AdActivationSafeMetadata;
  attempt_number: number;
};

export type AdActivationPreSendValidation = {
  valid: boolean;
  reason: string;
  action?: AdActivationAction;
  organization_id?: string;
  destination_id?: string;
  audience_id?: string;
  person_id?: string;
  lead_id?: string | null;
  membership_id?: string | null;
  privacy?: Record<string, unknown>;
  lease_expires_at?: string;
};

function objectResult<T>(value: unknown, label: string): T {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} returned an invalid result.`);
  }
  return value as T;
}

export async function claimAdActivationDeliveries(
  limit = 25,
  leaseSeconds = 120,
): Promise<ClaimedAdActivationDelivery[]> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc(
    "claim_ad_activation_deliveries_v1",
    {
      p_limit: limit,
      p_lease_seconds: leaseSeconds,
    },
  );

  if (error) {
    throw new Error(`Ad activation claim failed: ${error.message}`);
  }

  return Array.isArray(data)
    ? (data as ClaimedAdActivationDelivery[])
    : [];
}

export async function validateAdActivationDeliveryBeforeSend(
  delivery: Pick<ClaimedAdActivationDelivery, "outbox_id" | "lease_token">,
): Promise<AdActivationPreSendValidation> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc(
    "validate_ad_activation_delivery_v1",
    {
      p_outbox_id: delivery.outbox_id,
      p_lease_token: delivery.lease_token,
    },
  );

  if (error) {
    throw new Error(`Ad activation pre-send validation failed: ${error.message}`);
  }

  return objectResult<AdActivationPreSendValidation>(
    data,
    "Ad activation pre-send validation",
  );
}
