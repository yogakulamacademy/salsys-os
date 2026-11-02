"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { useMockData } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";
import { parsePaymentAmount } from "@/lib/payment-input";

const PAYMENT_KINDS = ["deposit", "balance", "full", "other"] as const;
type VerifiedPaymentKind = (typeof PAYMENT_KINDS)[number];

function textValue(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  return value || null;
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

  const parsedAmount = parsePaymentAmount(formData.get("claimed_amount"));
  const amount = parsedAmount.state === 'valid' ? parsedAmount.value : null;
  const currency = currencyValue(formData, "claimed_currency");

  if (parsedAmount.state === 'invalid') {
    redirect(
      `/leads/${leadId}?error=${encodeURIComponent(
        "Enter a positive claimed amount with at most two decimal places, or leave it blank.",
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

  const parsedAmount = parsePaymentAmount(formData.get("payment_amount"));
  const amount = parsedAmount.state === 'valid' ? parsedAmount.value : null;
  const currency = currencyValue(formData, "payment_currency");
  const kindRaw = textValue(formData, "payment_kind");
  const paymentKind = PAYMENT_KINDS.includes(kindRaw as VerifiedPaymentKind)
    ? (kindRaw as VerifiedPaymentKind)
    : null;
  const paidAt = paidAtValue(formData);

  if (amount === null || amount <= 0) {
    redirect(
      `/leads/${leadId}?error=${encodeURIComponent(
        "Enter a positive verified amount with at most two decimal places.",
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

  const parsedAmount = parsePaymentAmount(formData.get("refund_amount"));
  const amount = parsedAmount.state === 'valid' ? parsedAmount.value : null;
  const currency = currencyValue(formData, "refund_currency");
  const paidAt = textValue(formData, 'paid_at') ? paidAtValue(formData) : null;
  const originalPaymentId = textValue(formData, 'original_payment_id');
  const requestId = textValue(formData, 'refund_request_id');
  const notes = textValue(formData, 'refund_notes');
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  if (!originalPaymentId || !uuid.test(originalPaymentId) || !requestId || !uuid.test(requestId) || !notes) {
    redirect(`/leads/${leadId}?error=${encodeURIComponent('Select the original paid transaction and enter a refund reason. Reload the form if its request ID is missing.')}`);
  }

  if (amount === null || amount <= 0) {
    redirect(
      `/leads/${leadId}?error=${encodeURIComponent(
        "Enter a positive refund amount with at most two decimal places.",
      )}`,
    );
  }

  if (!currency) {
    redirect(
      `/leads/${leadId}?error=${encodeURIComponent("Select INR or USD.")}`,
    );
  }

  if (textValue(formData, 'paid_at') && !paidAt) {
    redirect(
      `/leads/${leadId}?error=${encodeURIComponent("Invalid refund date.")}`,
    );
  }

  const supabase = await createClient();
  const { data, error } = await (supabase as any).rpc('record_refund_v1', {
    p_lead_id: leadId,
    p_original_payment_id: originalPaymentId,
    p_request_id: requestId,
    p_amount: amount,
    p_currency: currency,
    p_provider: textValue(formData, 'refund_provider'),
    p_reference: textValue(formData, 'refund_reference'),
    p_paid_at: paidAt,
    p_note: notes,
  });

  if (error || !data || data.ok !== true || typeof data.payment_id !== 'string') {
    redirect(`/leads/${leadId}?error=${encodeURIComponent(error?.message || 'Refund confirmation was unavailable. Retry the same request before recording another refund.')}`);
  }

  refreshPaymentSurfaces(leadId);
  redirect(`/leads/${leadId}?notice=refund-recorded`);
}
