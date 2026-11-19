import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { todayIn } from "@/lib/batch-auto-close";
import { summarizeCash, type CashEnrollment, type CashPayment, type CashSummary } from "@/lib/revenue-cash";

/** Money in and money due for one business (user client, so RLS applies). */
export async function getCashSummary(client: SupabaseClient, organizationId: string, now = new Date()): Promise<CashSummary> {
  const today = todayIn("Asia/Kolkata", now);
  const monthStart = `${today.slice(0, 7)}-01T00:00:00+05:30`;
  const [{ data: monthPays }, { data: logged }, { data: enrs }] = await Promise.all([
    client.from("payments").select("amount, currency, status, payment_kind, paid_at, provider")
      .eq("organization_id", organizationId).gte("paid_at", monthStart).in("status", ["paid", "refunded", "partially_refunded"]).limit(2000),
    client.from("payments").select("amount, currency, status, payment_kind, paid_at, provider")
      .eq("organization_id", organizationId).eq("status", "pending").like("provider", "team_logged:%").limit(1000),
    client.from("enrollments").select("id, lead_id, status, total_value, currency, metadata, courses(name)")
      .eq("organization_id", organizationId).in("status", ["pending", "confirmed", "deferred"]).limit(2000),
  ]);

  const toPayment = (p: Record<string, unknown>): CashPayment => ({
    amount: Number(p.amount ?? 0), currency: (p.currency as string | null) ?? null, status: String(p.status), kind: String(p.payment_kind),
    paidAt: (p.paid_at as string | null) ?? null, teamLogged: String(p.provider ?? "").startsWith("team_logged:"),
  });
  const payments = [...(monthPays ?? []), ...(logged ?? [])].map(toPayment);

  const enrollmentRows = enrs ?? [];
  const enrIds = enrollmentRows.map((e) => String(e.id));
  const leadIds = [...new Set(enrollmentRows.map((e) => String(e.lead_id)))];
  const [{ data: enrPays }, { data: leads }] = await Promise.all([
    enrIds.length ? client.from("payments").select("enrollment_id, amount, status, payment_kind").in("enrollment_id", enrIds) : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
    leadIds.length ? client.from("leads").select("id, display_name").in("id", leadIds) : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
  ]);
  const leadName = new Map((leads ?? []).map((l) => [String(l.id), String(l.display_name ?? "Lead")]));
  const paysByEnr = new Map<string, CashEnrollment["payments"]>();
  for (const p of enrPays ?? []) {
    const k = String(p.enrollment_id);
    if (!paysByEnr.has(k)) paysByEnr.set(k, []);
    paysByEnr.get(k)!.push({ amount: Number(p.amount ?? 0), status: String(p.status), kind: String(p.payment_kind) });
  }
  const enrollments: CashEnrollment[] = enrollmentRows.map((e) => {
    const meta = (e.metadata ?? {}) as Record<string, unknown>;
    const course = Array.isArray(e.courses) ? e.courses[0] : e.courses;
    const date = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);
    return {
      id: String(e.id), leadId: String(e.lead_id), leadName: leadName.get(String(e.lead_id)) ?? "Lead",
      courseName: (course as { name?: string } | null)?.name ?? null, status: String(e.status),
      total: e.total_value == null ? null : Number(e.total_value), currency: (e.currency as string | null) ?? null,
      dueDate: date(meta.balance_due_date) ?? date(meta.expected_payment_date),
      payments: paysByEnr.get(String(e.id)) ?? [],
    };
  });
  return summarizeCash(payments, enrollments, today);
}
