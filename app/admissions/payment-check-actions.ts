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

/**
 * Paid: admins confirm in one step; others log it for an admin to verify.
 * One payment can cover several courses (owner request, 25 Nov 2026): the form
 * sends course_id / batch_id / amount once per course. Each course becomes its
 * own enrolment; the website checkout, if any, is matched to the first one.
 */
export async function confirmPaidAction(leadId: string, form: FormData): Promise<Result> {
  const supabase = await createClient();
  const paidOn = str(form.get("paid_on"));
  const paidAt = paidOn ? new Date(`${paidOn}T12:00:00+05:30`).toISOString() : null;
  const currency = str(form.get("currency")) ?? "INR";
  const method = str(form.get("method"));
  const reference = str(form.get("reference"));
  const kind = str(form.get("kind")) === "deposit" ? "deposit" : "full";
  const courseIds = form.getAll("course_id");
  const batchIds = form.getAll("batch_id");
  const amounts = form.getAll("amount");
  const lines = courseIds.map((c, i) => ({ courseId: uuid(c), batchId: uuid(batchIds[i] ?? null), amount: num(amounts[i] ?? null) })).slice(0, 6);
  if (!lines.length || lines.some((l) => !l.courseId)) return { ok: false, error: "Choose the course for each line" };
  if (lines.some((l) => !l.amount || l.amount <= 0)) return { ok: false, error: "Enter the amount paid for each course" };
  if (new Set(lines.map((l) => `${l.courseId}:${l.batchId ?? ""}`)).size !== lines.length) return { ok: false, error: "The same course and batch is listed twice" };
  const asAdmin = form.get("as_admin") === "1";
  const checkoutId = uuid(form.get("checkout_id"));

  let done = 0;
  for (const [i, line] of lines.entries()) {
    const { error } = asAdmin
      ? await supabase.rpc("confirm_payment_and_enrol_v1", {
          p_lead_id: leadId, p_amount: line.amount, p_currency: currency, p_paid_at: paidAt,
          p_method: method, p_payment_kind: kind, p_reference: reference,
          p_course_id: line.courseId, p_batch_id: line.batchId, p_checkout_payment_id: i === 0 ? checkoutId : null,
          p_note: lines.length > 1 ? `Confirmed from Check who paid (course ${i + 1} of ${lines.length})` : "Confirmed from Check who paid",
        })
      : await supabase.rpc("record_enrollment_v1", {
          p_lead_id: leadId, p_payment_plan: kind === "deposit" ? "instalment" : "full", p_amount_paid: line.amount,
          p_paid_at: paidAt, p_payment_method: method, p_payment_reference: reference,
          p_expected_payment_date: null, p_course_id: line.courseId, p_batch_id: line.batchId,
          p_total_value: null, p_currency: currency,
          p_note: lines.length > 1 ? `Logged from Check who paid (course ${i + 1} of ${lines.length})` : "Logged from Check who paid",
        });
    if (error) {
      if (done) refresh([leadId]);
      return { ok: false, error: done ? `${done} of ${lines.length} courses saved. The next one failed: ${error.message}` : error.message };
    }
    done += 1;
  }
  refresh([leadId]);
  const courses = lines.length > 1 ? `${lines.length} courses` : "1 course";
  return asAdmin
    ? { ok: true, message: `Payment confirmed · enrolled in ${courses} · moved to Closed won` }
    : { ok: true, message: `Logged for ${courses} · an admin will verify the payment` };
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

/** This is our own test: Unqualified, flagged, checkouts cancelled, left out of all numbers. Manager or admin. */
export async function markTestLeadAction(leadId: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_lead_as_test_v1", { p_lead_id: leadId, p_reason: "Marked from Check who paid" });
  if (error) return { ok: false, error: error.message };
  refresh([leadId]);
  return { ok: true, message: "Marked as a test · left out of all numbers" };
}
