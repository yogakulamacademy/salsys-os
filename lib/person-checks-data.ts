import "server-only";

import { recordVsConversation, signals, type Msg, type RecordCheck, type Signals } from "@/lib/person-checks";

type Admin = ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>;

/**
 * Data for one lead's "record vs conversation" and "signals" cards. Callers
 * pass a lead the signed-in user can already see (from their row-level
 * secured lead list); reads are scoped to the business. Never throws.
 */
export async function getRecordCheck(admin: Admin, organizationId: string, leadId: string, stageLabel: string): Promise<{ check: RecordCheck; signals: Signals; messages: number } | null> {
  try {
    const [leadRes, msgRes, courseRes, contactRes, interestRes] = await Promise.all([
      admin.from("leads").select("id, interested_course_id, potential_value, potential_currency").eq("organization_id", organizationId).eq("id", leadId).maybeSingle(),
      admin.from("messages").select("direction, body, created_at").eq("organization_id", organizationId).eq("lead_id", leadId)
        .in("direction", ["inbound", "outbound"]).order("created_at", { ascending: false }).limit(400),
      admin.from("courses").select("id, name").eq("organization_id", organizationId).limit(300),
      admin.from("lead_contacts").select("value, contact_type").eq("lead_id", leadId).in("contact_type", ["phone", "whatsapp"]).limit(10),
      admin.from("lead_course_interests").select("course_id, status").eq("organization_id", organizationId).eq("lead_id", leadId).limit(20),
    ]);
    const lead = leadRes.data as { id: string; interested_course_id: string | null; potential_value: number | string | null; potential_currency: string | null } | null;
    if (!lead) return null;
    const courses = ((courseRes.data ?? []) as Array<{ id: string; name: string | null }>).filter((c) => c.name).map((c) => ({ id: c.id, name: c.name! }));
    const nameOf = new Map(courses.map((c) => [c.id, c.name]));
    const crmCourse = lead.interested_course_id && nameOf.has(lead.interested_course_id) ? { id: lead.interested_course_id, name: nameOf.get(lead.interested_course_id)! } : null;

    let priceRange: { min: number; max: number; currency: string } | null = null;
    if (crmCourse) {
      const currency = (lead.potential_currency ?? "INR").toUpperCase();
      const { data } = await admin.from("course_prices").select("regular_price, offer_price, currency")
        .eq("organization_id", organizationId).eq("course_id", crmCourse.id).eq("active", true).limit(50);
      const prices = ((data ?? []) as Array<{ regular_price: number | string | null; offer_price: number | string | null; currency: string | null }>)
        .filter((p) => (p.currency ?? "INR").toUpperCase() === currency)
        .flatMap((p) => [p.offer_price, p.regular_price].map(Number).filter((n) => Number.isFinite(n) && n > 0));
      if (prices.length) priceRange = { min: Math.min(...prices), max: Math.max(...prices), currency };
    }

    const messages: Msg[] = ((msgRes.data ?? []) as Array<{ direction: string; body: string | null; created_at: string }>)
      .map((m) => ({ direction: m.direction === "inbound" ? "inbound" as const : "outbound" as const, body: m.body ?? "", at: m.created_at }))
      .reverse();
    const value = lead.potential_value == null ? null : Number(lead.potential_value);
    const check = recordVsConversation({
      messages, courses, crmCourse,
      otherInterests: ((interestRes.data ?? []) as Array<{ course_id: string; status: string | null }>)
        .filter((i) => i.status !== "dropped").map((i) => nameOf.get(i.course_id)).filter((n): n is string => Boolean(n)),
      value: Number.isFinite(value) ? value : null, currency: lead.potential_currency, priceRange,
      savedNumbers: ((contactRes.data ?? []) as Array<{ value: string | null }>).map((c) => c.value ?? "").filter(Boolean),
      stageLabel,
    });
    return { check, signals: signals(messages), messages: messages.length };
  } catch {
    return null;
  }
}
