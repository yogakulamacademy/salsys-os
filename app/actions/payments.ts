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
