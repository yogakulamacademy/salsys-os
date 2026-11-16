"use server";

import { revalidatePath } from "next/cache";

import { useMockData } from "@/lib/config";
import { MAX_DISCOUNT, offerMessage } from "@/lib/offer-suggestion";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentOrganizationId } from "@/lib/workspace";

export type OfferDecisionResult =
  | { ok: true; status: "approved" | "declined"; message?: string }
  | { ok: false; error: string };

const OFFER_KINDS = new Set(["early_bird_and_deposit", "package_price", "limited_time_discount", "pay_to_book", "custom"]);
const VERDICTS = new Set(["likely", "maybe", "unlikely"]);
const UUID = /^[0-9a-f-]{36}$/i;

function text(formData: FormData, key: string, max: number) {
  return String(formData.get(key) ?? "").trim().slice(0, max);
}

function safeJson(raw: string, fallback: unknown) {
  try {
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

/**
 * Records a person's decision on the AI-suggested offer. Approving never sends
 * anything: it returns the offer text, which the Inbox places in the reply box.
 * The database enforces membership, price completeness and the >20% manager rule.
 */
export async function recordOfferDecisionAction(formData: FormData): Promise<OfferDecisionResult> {
  if (useMockData) return { ok: false, error: "Demo mode does not record offers." };
  const leadId = text(formData, "lead_id", 36);
  const decision = text(formData, "decision", 10);
  const offerKind = text(formData, "offer_kind", 40) || "custom";
  if (!UUID.test(leadId)) return { ok: false, error: "Lead not found." };
  if (decision !== "approved" && decision !== "declined") return { ok: false, error: "Choose approve or decline." };
  if (!OFFER_KINDS.has(offerKind)) return { ok: false, error: "Unknown offer type." };

  const basePrice = Number(text(formData, "base_price", 20).replace(/[^0-9.]/g, ""));
  const discount = Math.round(Number(text(formData, "discount_percent", 3) || "0"));
  const validHours = Math.round(Number(text(formData, "valid_hours", 4) || "0"));
  const currency = text(formData, "currency", 3).toUpperCase();
  const depositText = text(formData, "deposit_text", 80);
  const courseLabel = text(formData, "course_label", 200);
  const confidence = Math.round(Number(text(formData, "ai_confidence", 3) || "0"));
  const verdict = text(formData, "ai_verdict", 10);
  if (!Number.isFinite(discount) || discount < 0 || discount > MAX_DISCOUNT) return { ok: false, error: `Discount must be 0–${MAX_DISCOUNT}%.` };
  if (!VERDICTS.has(verdict)) return { ok: false, error: "Missing AI confidence." };
  if (decision === "approved" && (!Number.isFinite(basePrice) || basePrice <= 0)) return { ok: false, error: "Enter the course price before approving." };
  if (decision === "approved" && !courseLabel) return { ok: false, error: "Enter the course or batch for this offer." };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Your session has expired. Sign in again." };
  const organizationId = await requireCurrentOrganizationId(supabase, user.id);

  const { data, error } = await supabase.rpc("record_lead_offer_decision_v1", {
    p_organization_id: organizationId,
    p_lead_id: leadId,
    p_status: decision,
    p_offer_kind: offerKind,
    p_course_label: courseLabel || null,
    p_currency: decision === "approved" ? currency : null,
    p_base_price: decision === "approved" ? basePrice : null,
    p_discount_percent: discount,
    p_deposit_text: depositText || null,
    p_valid_hours: decision === "approved" ? validHours : null,
    p_ai_confidence: Math.max(0, Math.min(100, confidence)),
    p_ai_verdict: verdict,
    p_ai_factors: safeJson(text(formData, "ai_factors", 4000), []),
    p_ai_suggested: safeJson(text(formData, "ai_suggested", 2000), {}),
    p_decision_note: text(formData, "note", 500) || null,
  });
  if (error || !data) return { ok: false, error: error?.message || "The decision could not be saved." };

  revalidatePath("/conversations");
  if (decision === "declined") return { ok: true, status: "declined" };
  return {
    ok: true,
    status: "approved",
    message: offerMessage({
      firstName: text(formData, "first_name", 60),
      courseLabel,
      basePrice,
      currency,
      discountPercent: discount,
      depositText: depositText || "a deposit",
      validHours,
    }),
  };
}

/** Records whether the lead enrolled after an approved offer; this is what sharpens the confidence %. */
export async function recordOfferOutcomeAction(formData: FormData): Promise<OfferDecisionResult> {
  if (useMockData) return { ok: false, error: "Demo mode does not record outcomes." };
  const offerId = text(formData, "offer_id", 36);
  const outcome = text(formData, "outcome", 20);
  if (!UUID.test(offerId) || (outcome !== "enrolled" && outcome !== "not_enrolled")) return { ok: false, error: "Invalid outcome." };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Your session has expired. Sign in again." };
  const organizationId = await requireCurrentOrganizationId(supabase, user.id);
  const { error } = await supabase.rpc("record_lead_offer_outcome_v1", { p_organization_id: organizationId, p_offer_id: offerId, p_outcome: outcome });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/conversations");
  return { ok: true, status: "approved" };
}
