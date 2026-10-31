"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { useMockData } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";

const PAYMENT_KINDS = ["deposit", "balance", "full", "other"] as const;
type VerifiedPaymentKind = (typeof PAYMENT_KINDS)[number];

function textValue(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  return value || null;
}

function numberValue(formData: FormData, key: string) {
  const raw = textValue(formData, key);
  if (raw === null) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function currencyValue(formData: FormData, key: string) {
  const value = (textValue(formData, key) ?? "").toUpperCase();
  return value === "USD" || value === "INR" ? value : null;
}

function paidAtValue(formData: FormData) {
  const raw = textValue(formData, "paid_at");
  if (!raw) return new Date().toISOString();
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function refreshPaymentSurfaces(leadId: string) {
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/leads");
  revalidatePath("/follow-ups");
  revalidatePath("/dashboard");
  revalidatePath("/revenue");
}

export async function reportPaymentClaimAction(
  leadId: string,
  formData: FormData,
) {
  if (useMockData) {
    redirect(`/leads/${leadId}?notice=mock-payment-claim`);
  }

  const amount = numberValue(formData, "claimed_amount");
  const currency = currencyValue(formData, "claimed_currency");

  if (amount !== null && amount <= 0) {
    redirect(
      `/leads/${leadId}?error=${encodeURIComponent(
        "Claimed amount must be greater than zero.",
      )}`,
    );
  }

  if (amount !== null && !currency) {
    redirect(
      `/leads/${leadId}?error=${encodeURIComponent(
        "Select INR or USD for the reported payment.",
      )}`,
    );
  }

  const supabase = await createClient();
  const { error } = await (supabase as any).rpc("report_payment_claim_v1", {
    p_lead_id: leadId,
    p_claimed_amount: amount,
    p_currency: amount !== null ? currency : null,
    p_reference: textValue(formData, "payment_reference"),
    p_note: textValue(formData, "payment_notes"),
    p_message_id: null,
  });

  if (error) {
    redirect(`/leads/${leadId}?error=${encodeURIComponent(error.message)}`);
  }

  refreshPaymentSurfaces(leadId);
  redirect(`/leads/${leadId}?notice=payment-claim-reported`);
}

export async function verifyPaymentAction(
  leadId: string,
  formData: FormData,
) {
  if (useMockData) {
    redirect(`/leads/${leadId}?notice=mock-payment-verified`);
  }

  const amount = numberValue(formData, "payment_amount");
  const currency = currencyValue(formData, "payment_currency");
  const kindRaw = textValue(formData, "payment_kind");
  const paymentKind = PAYMENT_KINDS.includes(kindRaw as VerifiedPaymentKind)
    ? (kindRaw as VerifiedPaymentKind)
    : null;
  const paidAt = paidAtValue(formData);

  if (amount === null || amount <= 0) {
    redirect(
      `/leads/${leadId}?error=${encodeURIComponent(
        "Enter a valid verified payment amount.",
      )}`,
    );
  }

  if (!currency) {
    redirect(
      `/leads/${leadId}?error=${encodeURIComponent("Select INR or USD.")}`,
    );
  }

  if (!paymentKind) {
    redirect(
      `/leads/${leadId}?error=${encodeURIComponent(
        "Select a valid payment type.",
      )}`,
    );
  }

  if (!paidAt) {
    redirect(
      `/leads/${leadId}?error=${encodeURIComponent("Invalid payment date.")}`,
    );
  }

  const evidence = textValue(formData, "evidence_note");
  const reference = textValue(formData, "payment_reference");

  if (!reference && !evidence) {
    redirect(
      `/leads/${leadId}?error=${encodeURIComponent(
        "Add a transaction reference or verification evidence before marking a payment paid.",
      )}`,
    );
  }

  const supabase = await createClient();
  const { data, error } = await (supabase as any).rpc("verify_payment_v1", {
    p_lead_id: leadId,
    p_amount: amount,
    p_currency: currency,
    p_payment_kind: paymentKind,
    p_provider: textValue(formData, "payment_provider"),
    p_reference: reference,
    p_paid_at: paidAt,
    p_evidence_note: evidence,
    p_payment_check_task_id: textValue(formData, "payment_check_task_id"),
  });

  if (error) {
    redirect(`/leads/${leadId}?error=${encodeURIComponent(error.message)}`);
  }

  refreshPaymentSurfaces(leadId);

  const result = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const notice = result.closed_won_triggered === true
    ? "payment-verified-closed-won"
    : "payment-verified";

  redirect(`/leads/${leadId}?notice=${notice}`);
}

export async function recordRefundAction(
  leadId: string,
  formData: FormData,
) {
  if (useMockData) {
    redirect(`/leads/${leadId}?notice=mock-refund`);
  }

  const amount = numberValue(formData, "refund_amount");
  const currency = currencyValue(formData, "refund_currency");
  const paidAt = paidAtValue(formData);

  if (amount === null || amount <= 0) {
    redirect(
      `/leads/${leadId}?error=${encodeURIComponent(
        "Enter a valid refund amount.",
      )}`,
    );
  }

  if (!currency) {
    redirect(
      `/leads/${leadId}?error=${encodeURIComponent("Select INR or USD.")}`,
    );
  }

  if (!paidAt) {
    redirect(
      `/leads/${leadId}?error=${encodeURIComponent("Invalid refund date.")}`,
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect("/login");
  }

  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select("organization_id")
    .eq("id", leadId)
    .maybeSingle();

  if (leadError || !lead?.organization_id) {
    redirect(
      `/leads/${leadId}?error=${encodeURIComponent(
        leadError?.message || "Unable to resolve the lead workspace.",
      )}`,
    );
  }

  const provider = textValue(formData, "refund_provider");
  const reference = textValue(formData, "refund_reference");
  const notes = textValue(formData, "refund_notes");

  const { data: payment, error } = await supabase
    .from("payments")
    .insert({
      organization_id: lead.organization_id,
      lead_id: leadId,
      payment_kind: "refund",
      status: "refunded",
      amount,
      currency,
      provider,
      external_payment_id: reference,
      paid_at: paidAt,
      metadata: {
        source: "crm_manual_refund",
        recorded_by: user.id,
        recorded_at: new Date().toISOString(),
        notes,
      },
    })
    .select("id")
    .single();

  if (error) {
    redirect(`/leads/${leadId}?error=${encodeURIComponent(error.message)}`);
  }

  const { error: activityError } = await supabase.from("activities").insert({
    lead_id: leadId,
    activity_type: "refund_recorded",
    actor_type: "human",
    actor_id: user.id,
    title: "Refund recorded",
    details: `${currency} ${amount}` + (provider ? ` · ${provider}` : ""),
    metadata: {
      payment_id: payment.id,
      payment_kind: "refund",
      currency,
      amount,
      reference,
    },
  });

  if (activityError) {
    redirect(
      `/leads/${leadId}?error=${encodeURIComponent(
        `Refund was recorded, but audit logging failed: ${activityError.message}`,
      )}`,
    );
  }

  refreshPaymentSurfaces(leadId);
  redirect(`/leads/${leadId}?notice=refund-recorded`);
}
