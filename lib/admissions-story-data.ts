import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentOrganizationId } from "@/lib/workspace";

// Extra facts for Pipeline & admissions (owner request, 20 Nov 2026):
// - demand per upcoming batch, from the course interests leads actually showed
//   (no lead is linked to a batch yet, so the old "Hot" column was always 0);
// - leads sitting at Payment pending for weeks (did they pay?).
// Read with the service client for the business the signed-in user belongs
// to; only counts and the user's visible leads are returned.

export type BatchDemand = { interested: number; ready: number };
export type StalePaymentLead = { id: string; name: string; course: string | null; days: number };
export type AdmissionsExtras = {
  demand: Record<string, BatchDemand>;
  stalePayment: StalePaymentLead[];
  paymentPendingTotal: number;
};

const READY = new Set(["high_intent", "payment_pending"]);
const DAY = 86_400_000;

const norm = (v: string | null | undefined) => (v ?? "").trim().toLowerCase().replace(/\s+/g, "-");

export async function getAdmissionsExtras(batchIds: string[], now = new Date()): Promise<AdmissionsExtras | null> {
  try {
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return null;
    const organizationId = await requireCurrentOrganizationId(supabase, auth.user.id);
    const { data: isAdmin } = await supabase.rpc("can_manage_organization", { p_organization_id: organizationId });
    const admin = createAdminClient();

    const [batches, interests, paying] = await Promise.all([
      batchIds.length
        ? admin.from("course_batches").select("id, course_id, location, mode").eq("organization_id", organizationId).in("id", batchIds.slice(0, 300))
        : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
      (async () => {
        // The API returns at most 1,000 rows per request.
        const rows: unknown[] = [];
        for (let from = 0; from < 20000; from += 1000) {
          const { data, error } = await admin.from("lead_course_interests").select("lead_id, course_id, location, leads!inner(current_stage, status)")
            .eq("organization_id", organizationId).eq("status", "active").neq("leads.status", "archived")
            .order("lead_id", { ascending: true }).range(from, from + 999);
          if (error) throw new Error(error.message);
          rows.push(...(data ?? []));
          if (!data || data.length < 1000) break;
        }
        return { data: rows };
      })(),
      (() => {
        let q = admin.from("leads").select("id, display_name, owner_user_id, interested_course_id, courses:interested_course_id(name)")
          .eq("organization_id", organizationId).eq("current_stage", "payment_pending").neq("status", "archived").limit(500);
        if (isAdmin !== true) q = q.eq("owner_user_id", auth.user!.id);
        return q;
      })(),
    ]);

    // course -> location -> { interested, ready }; "" = place not known yet.
    const byCourse = new Map<string, Map<string, BatchDemand>>();
    for (const row of (interests.data ?? []) as Array<{ course_id: string; location: string | null; leads: { current_stage: string } | Array<{ current_stage: string }> }>) {
      const lead = Array.isArray(row.leads) ? row.leads[0] : row.leads;
      if (!lead || ["lost", "unqualified", "duplicate", "enrolled", "closed_won"].includes(lead.current_stage)) continue;
      const place = norm(row.location).replace(/^bengaluru-.*/, "bengaluru");
      const m = byCourse.get(row.course_id) ?? new Map<string, BatchDemand>();
      const d = m.get(place) ?? { interested: 0, ready: 0 };
      d.interested += 1;
      if (READY.has(lead.current_stage)) d.ready += 1;
      m.set(place, d);
      byCourse.set(row.course_id, m);
    }

    const demand: Record<string, BatchDemand> = {};
    for (const b of (batches.data ?? []) as Array<{ id: string; course_id: string; location: string | null; mode: string | null }>) {
      const m = byCourse.get(b.course_id);
      if (!m) { demand[b.id] = { interested: 0, ready: 0 }; continue; }
      const place = norm(b.mode === "online" ? "online" : b.location);
      // Leads who named this place, plus those who haven't said where yet.
      const here = m.get(place) ?? { interested: 0, ready: 0 };
      const open = m.get("") ?? { interested: 0, ready: 0 };
      demand[b.id] = { interested: here.interested + open.interested, ready: here.ready + open.ready };
    }

    // When each payment-pending lead got there.
    const payRows = (paying.data ?? []) as Array<{ id: string; display_name: string | null; courses: { name: string } | Array<{ name: string }> | null }>;
    const stalePayment: StalePaymentLead[] = [];
    if (payRows.length) {
      const { data: hist } = await admin.from("lead_stage_history").select("lead_id, changed_at")
        .in("lead_id", payRows.map((r) => r.id)).eq("to_stage", "payment_pending").order("changed_at", { ascending: false }).limit(2000);
      const since = new Map<string, string>();
      for (const h of (hist ?? []) as Array<{ lead_id: string; changed_at: string }>) if (!since.has(h.lead_id)) since.set(h.lead_id, h.changed_at);
      for (const r of payRows) {
        const at = since.get(r.id);
        if (!at) continue;
        const days = Math.floor((now.getTime() - Date.parse(at)) / DAY);
        if (days < 7) continue;
        const course = Array.isArray(r.courses) ? r.courses[0]?.name ?? null : r.courses?.name ?? null;
        stalePayment.push({ id: r.id, name: r.display_name ?? "Lead", course, days });
      }
      stalePayment.sort((a, b) => b.days - a.days);
    }
    return { demand, stalePayment, paymentPendingTotal: payRows.length };
  } catch (error) {
    console.error("Admissions extras failed", error instanceof Error ? error.message : error);
    return null;
  }
}
