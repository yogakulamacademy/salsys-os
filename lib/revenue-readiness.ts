import { createClient } from "@/lib/supabase/server";
import { requireCurrentOrganizationId } from "@/lib/workspace";

export type RevenueReadiness = {
  available: boolean;
  openLeads: number;
  unvaluedLeads: number;
  undatedLeads: number;
  valuedUndatedLeads: number;
  pendingPaymentRequests: number;
  warning: string | null;
};

type RevenueReadinessPayload = {
  open_leads?: number | string | null;
  unvalued_leads?: number | string | null;
  undated_leads?: number | string | null;
  valued_undated_leads?: number | string | null;
  pending_payment_requests?: number | string | null;
};

export async function getRevenueReadiness(): Promise<RevenueReadiness> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return unavailable("Revenue readiness could not resolve the authenticated user.");
  }

  let organizationId: string;
  try {
    organizationId = await requireCurrentOrganizationId(supabase, user.id);
  } catch (error) {
    return unavailable(
      error instanceof Error
        ? error.message
        : "Revenue readiness could not resolve the current organization.",
    );
  }

  const { data, error } = await supabase.rpc("get_revenue_readiness_v1", {
    p_organization_id: organizationId,
  });

  if (error) {
    return unavailable(`Revenue readiness unavailable: ${error.message}`);
  }

  const payload = (data ?? {}) as RevenueReadinessPayload;

  return {
    available: true,
    openLeads: toNumber(payload.open_leads),
    unvaluedLeads: toNumber(payload.unvalued_leads),
    undatedLeads: toNumber(payload.undated_leads),
    valuedUndatedLeads: toNumber(payload.valued_undated_leads),
    pendingPaymentRequests: toNumber(payload.pending_payment_requests),
    warning: null,
  };
}

function unavailable(message: string): RevenueReadiness {
  return {
    available: false,
    openLeads: 0,
    unvaluedLeads: 0,
    undatedLeads: 0,
    valuedUndatedLeads: 0,
    pendingPaymentRequests: 0,
    warning: message,
  };
}

function toNumber(value: unknown) {
  const numeric = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}
