"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

// "Check who paid" (owner-approved mockup, 25 Nov 2026). Every action goes
// through a database function that checks the user's permission itself.

type Result = { ok: true; message: string } | { ok: false; error: string };

function refresh(leadIds: string[] = []) {
  for (const path of ["/admissions", "/leads", "/personas", "/home", "/follow-ups", "/enrollments"]) revalidatePath(path);
  for (const id of leadIds) revalidatePath(`/leads/${id}`);
}

const str = (v: FormDataEntryValue | null) => { const s = String(v ?? "").trim(); return s || null; };
const num = (v: FormDataEntryValue | null) => { const n = Number(String(v ?? "").replace(/[, ]/g, "")); return Number.isFinite(n) && String(v ?? "").trim() !== "" ? n : null; };
const uuid = (v: FormDataEntryValue | null) => { const s = str(v); return s && /^[0-9a-f-]{36}$/i.test(s) ? s : null; };

/** Paid: admins confirm in one step; others log it for an admin to verify. */
export async function confirmPaidAction(leadId: string, form: FormData): Promise<Result> {
  const supabase = await createClient();
  const paidOn = str(form.get("paid_on"));
  const paidAt = paidOn ? new Date(`${paidOn}T12:00:00+05:30`).toISOString() : null;
  const common = {
    amount: num(form.get("amount")),
    currency: str(form.get("currency")) ?? "INR",
    method: str(form.get("method")),
    reference: str(form.get("reference")),
    courseId: uuid(form.get("course_id")),
    batchId: uuid(form.get("batch_id")),
    kind: str(form.get("kind")) === "deposit" ? "deposit" : "full",
  };
  if (form.get("as_admin") === "1") {
    const { error } = await supabase.rpc("confirm_payment_and_enrol_v1", {
      p_lead_id: leadId, p_amount: common.amount, p_currency: common.currency, p_paid_at: paidAt,
      p_method: common.method, p_payment_kind: common.kind, p_reference: common.reference,
      p_course_id: common.courseId, p_batch_id: common.batchId, p_checkout_payment_id: uuid(form.get("checkout_id")),
      p_note: "Confirmed from Check who paid",
    });
    if (error) return { ok: false, error: error.message };
    refresh([leadId]);
    return { ok: true, message: "Payment confirmed · enrolled · moved to Closed won" };
  }
  const { error } = await supabase.rpc("record_enrollment_v1", {
    p_lead_id: leadId, p_payment_plan: common.kind === "deposit" ? "instalment" : "full", p_amount_paid: common.amount,
    p_paid_at: paidAt, p_payment_method: common.method, p_payment_reference: common.reference,
    p_expected_payment_date: null, p_course_id: common.courseId, p_batch_id: common.batchId,
    p_total_value: null, p_currency: common.currency, p_note: "Logged from Check who paid",
  });
  if (error) return { ok: false, error: error.message };
  refresh([leadId]);
  return { ok: true, message: "Logged · an admin will verify the payment" };
}

/** Still deciding: a follow-up on the chosen day. */
export async function stillDecidingAction(leadId: string, days: number, note: string | null): Promise<Result> {
  const supabase = await createClient();
  const due = new Date(Date.now() + Math.max(1, Math.min(60, days)) * 86_400_000);
  due.setUTCHours(4, 30, 0, 0); // 10:00 IST
  const { error } = await supabase.rpc("create_followup_task", {
    p_lead_id: leadId, p_title: "Payment check: still deciding", p_due_at: due.toISOString(),
    p_description: note ? note.slice(0, 500) : "From Check who paid: they haven't paid yet.",
  });
  if (error) return { ok: false, error: error.message };
  refresh([leadId]);
  return { ok: true, message: `Follow-up set for ${due.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` };
}

/** Not joining: Not now (they can come back) or Lost. Also used to remove your own number. */
export async function notJoiningAction(leadId: string, stage: "not_now" | "lost", reason: string): Promise<Result> {
  if (stage !== "not_now" && stage !== "lost") return { ok: false, error: "Choose Not now or Lost" };
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const { error } = await supabase.rpc("set_lead_stage", {
    p_lead_id: leadId, p_new_stage: stage, p_changed_by_type: "human",
    p_changed_by_id: claims?.claims?.sub ?? null, p_reason: reason.slice(0, 300),
  });
  if (error) return { ok: false, error: error.message };
  refresh([leadId]);
  return { ok: true, message: stage === "not_now" ? "Moved to Not now" : "Moved to Lost" };
}

/** The website checkout never went through: reject each attempt. Admin only (checked in the database). */
export async function checkoutNotReceivedAction(leadId: string, paymentIds: string[]): Promise<Result> {
  const supabase = await createClient();
  for (const id of paymentIds.filter((x) => /^[0-9a-f-]{36}$/i.test(x)).slice(0, 20)) {
    const { error } = await supabase.rpc("verify_enrollment_payment_v1", {
      p_payment_id: id, p_decision: "reject", p_note: "Checkout not completed (checked from Check who paid)", p_course_id: null, p_batch_id: null,
    });
    if (error) return { ok: false, error: error.message };
  }
  refresh([leadId]);
  return { ok: true, message: "Marked as not received" };
}

/** Same person: merge into the lead the user keeps. Manager or admin (checked in the database). */
export async function mergePeopleAction(keepLeadId: string, mergeLeadId: string): Promise<Result> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("merge_people_by_lead_v1", {
    p_keep_lead_id: keepLeadId, p_merge_lead_id: mergeLeadId, p_reason: "Same person, from Check who paid",
  });
  if (error) return { ok: false, error: error.message };
  refresh([keepLeadId, mergeLeadId]);
  const changed = (data as { changed?: boolean } | null)?.changed;
  return { ok: true, message: changed === false ? "Already the same person" : "Merged into one person · both enquiries kept" };
}
