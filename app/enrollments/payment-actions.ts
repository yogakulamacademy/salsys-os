"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

function refresh() {
  revalidatePath("/conversations");
  revalidatePath("/enrollments");
  revalidatePath("/home");
}

const num = (v: FormDataEntryValue | null) => {
  const n = Number(String(v ?? "").replace(/[, ]/g, ""));
  return Number.isFinite(n) && String(v ?? "").trim() !== "" ? n : null;
};
const str = (v: FormDataEntryValue | null) => { const s = String(v ?? "").trim(); return s || null; };

/** Mark a lead enrolled (owner or admin). Payment status is required; the rest is optional. */
export async function recordEnrollmentAction(leadId: string, form: FormData) {
  const supabase = await createClient();
  const { error, data } = await supabase.rpc("record_enrollment_v1", {
    p_lead_id: leadId,
    p_payment_plan: str(form.get("payment_plan")),
    p_amount_paid: num(form.get("amount_paid")),
    p_paid_at: str(form.get("paid_at")) ? new Date(String(form.get("paid_at"))).toISOString() : null,
    p_payment_method: str(form.get("payment_method")),
    p_payment_reference: str(form.get("payment_reference")),
    p_expected_payment_date: str(form.get("expected_payment_date")),
    p_course_id: str(form.get("course_id")),
    p_batch_id: str(form.get("batch_id")),
    p_total_value: num(form.get("total_value")),
    p_currency: str(form.get("currency")),
    p_note: str(form.get("note")),
  });
  if (error) return { ok: false as const, error: error.message };
  refresh();
  return { ok: true as const, result: data };
}

/** Log a later payment (e.g. second instalment) on an enrolment. */
export async function logEnrollmentPaymentAction(enrollmentId: string, form: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("log_enrollment_payment_v1", {
    p_enrollment_id: enrollmentId,
    p_amount: num(form.get("amount")),
    p_paid_at: str(form.get("paid_at")) ? new Date(String(form.get("paid_at"))).toISOString() : null,
    p_payment_method: str(form.get("payment_method")),
    p_payment_reference: str(form.get("payment_reference")),
  });
  if (error) return { ok: false as const, error: error.message };
  refresh();
  return { ok: true as const };
}

/** Admin: verify or reject a team-logged payment; optionally correct the course or batch. */
export async function verifyPaymentAction(paymentId: string, decision: "verify" | "reject", note?: string | null, courseId?: string | null, batchId?: string | null) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("verify_enrollment_payment_v1", {
    p_payment_id: paymentId, p_decision: decision, p_note: note ?? null, p_course_id: courseId || null, p_batch_id: batchId || null,
  });
  if (error) return { ok: false as const, error: error.message };
  refresh();
  return { ok: true as const };
}
