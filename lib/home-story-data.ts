import "server-only";

import { buildHomeStory, saysTheyPaid, type HomeStory, type StoryLead } from "@/lib/home-story";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentOrganizationId } from "@/lib/workspace";

// Facts for the Home "story" (owner request, 19 Nov 2026): who is waiting,
// interested leads going cold, old unanswered leads to win back, when leads
// message, and this week vs last week. Counts and the short lists are read
// with the service client for the business the signed-in user was just
// verified to belong to (the reply-attention view is too slow under per-row
// RLS); team members only ever get their own assigned leads in the lists.

/** Reads every row (the API returns at most 1,000 per request). */
async function allRows<T>(page: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>, cap = 20000): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < cap; from += 1000) {
    const { data, error } = await page(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

const OPEN_STAGES = ["new", "contacted", "engaged", "qualified", "high_intent", "payment_pending", "not_now", "nurture"];

export async function getHomeStory(now = new Date()): Promise<HomeStory | null> {
  try {
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return null;
    const organizationId = await requireCurrentOrganizationId(supabase, auth.user.id);
    const { data: isAdmin } = await supabase.rpc("can_manage_organization", { p_organization_id: organizationId });
    const admin = createAdminClient();

    const since30 = new Date(now.getTime() - 30 * 86_400_000).toISOString();
    const since14 = new Date(now.getTime() - 14 * 86_400_000).toISOString();
    const since7 = new Date(now.getTime() - 7 * 86_400_000).toISOString();
    const since24 = new Date(now.getTime() - 86_400_000).toISOString();

    const leadRows: Array<{ id: string; display_name: string | null; current_stage: string; interested_course_id: string | null; owner_user_id: string | null }> = [];
    for (let from = 0; from < 20000; from += 1000) {
      let q = admin.from("leads").select("id, display_name, current_stage, interested_course_id, owner_user_id")
        .eq("organization_id", organizationId).neq("status", "archived").in("current_stage", OPEN_STAGES)
        .order("id", { ascending: true }).range(from, from + 999);
      if (isAdmin !== true) q = q.eq("owner_user_id", auth.user.id);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      leadRows.push(...((data ?? []) as typeof leadRows));
      if (!data || data.length < 1000) break;
    }

    const [attention, hours, thisWeek, lastWeek, lostOpen, courses, aiReplies] = await Promise.all([
      allRows<{ lead_id: string; last_inbound_at: string | null }>((a, b) => admin.from("v_lead_inbox_attention").select("lead_id, last_inbound_at")
        .eq("organization_id", organizationId).eq("needs_reply", true).order("lead_id", { ascending: true }).range(a, b)),
      allRows<{ created_at: string }>((a, b) => admin.from("messages").select("created_at")
        .eq("organization_id", organizationId).eq("direction", "inbound").gte("created_at", since30).order("created_at", { ascending: true }).range(a, b)),
      admin.from("leads").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).gte("created_at", since7),
      admin.from("leads").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).gte("created_at", since14).lt("created_at", since7),
      admin.from("tasks").select("id", { count: "exact", head: true }).eq("organization_id", organizationId)
        .eq("created_by_id", "ai_stage_lost_v1").eq("status", "open"),
      admin.from("courses").select("id, name").eq("organization_id", organizationId).limit(500),
      admin.from("messages").select("id", { count: "exact", head: true }).eq("organization_id", organizationId)
        .eq("sender_type", "ai").gte("created_at", since24),
    ]);

    const visible = new Map(leadRows.map((l) => [l.id, l]));
    const courseName = new Map(((courses.data ?? []) as Array<{ id: string; name: string }>).map((c) => [c.id, c.name]));
    const waiting: StoryLead[] = [];
    for (const row of attention) {
      const lead = visible.get(row.lead_id);
      if (!lead || !row.last_inbound_at) continue;
      waiting.push({
        id: lead.id, name: lead.display_name ?? "Lead", stage: lead.current_stage,
        course: lead.interested_course_id ? courseName.get(lead.interested_course_id) ?? null : null,
        lastInboundAt: row.last_inbound_at, quote: null,
      });
    }

    // Leads who wrote that they paid or enrolled (last 60 days), with no payment
    // or enrolment recorded and still open.
    const PAID_WORDS = ["payment made", "made the payment", "made payment", "payment done", "payment is done", "have paid", "i paid", "already paid", "paid the fee", "have enrolled", "i enrolled", "payment completed", "transferred the"];
    const paidMsgs = await allRows<{ lead_id: string; body: string | null; created_at: string }>((a, b) => admin.from("messages")
      .select("lead_id, body, created_at").eq("organization_id", organizationId).eq("direction", "inbound")
      .gte("created_at", new Date(now.getTime() - 60 * 86_400_000).toISOString())
      .or(PAID_WORDS.map((w) => `body.ilike.%${w}%`).join(","))
      .order("created_at", { ascending: false }).range(a, b), 3000);
    const paidCandidates = new Map<string, { body: string; at: string }>();
    for (const m of paidMsgs) {
      if (!visible.has(m.lead_id) || paidCandidates.has(m.lead_id) || !saysTheyPaid(m.body)) continue;
      paidCandidates.set(m.lead_id, { body: (m.body ?? "").replace(/\s+/g, " ").slice(0, 90), at: m.created_at });
    }
    let saysPaid: StoryLead[] = [];
    if (paidCandidates.size) {
      const ids = [...paidCandidates.keys()];
      const [{ data: pays }, { data: enrs }] = await Promise.all([
        admin.from("payments").select("lead_id").in("lead_id", ids).in("status", ["pending", "paid"]),
        admin.from("enrollments").select("lead_id").in("lead_id", ids),
      ]);
      const recorded = new Set([...(pays ?? []), ...(enrs ?? [])].map((r: { lead_id: string }) => r.lead_id));
      saysPaid = ids.filter((id) => !recorded.has(id)).map((id) => {
        const lead = visible.get(id)!;
        const c = paidCandidates.get(id)!;
        return {
          id, name: lead.display_name ?? "Lead", stage: lead.current_stage,
          course: lead.interested_course_id ? courseName.get(lead.interested_course_id) ?? null : null,
          lastInboundAt: c.at, quote: c.body,
        };
      });
    }

    const story = buildHomeStory({
      saysPaid,
      now,
      waiting,
      inboundTimes: hours.map((m) => m.created_at),
      leadsThisWeek: thisWeek.count ?? null,
      leadsLastWeek: lastWeek.count ?? null,
      lostSuggestions: lostOpen.count ?? 0,
      aiRepliesToday: aiReplies.count ?? 0,
    });

    // The lead's own last words for the short "going cold" list.
    if (story.goingCold.length) {
      const ids = story.goingCold.map((l) => l.id);
      const { data: msgs } = await admin.from("messages").select("lead_id, body, created_at")
        .in("lead_id", ids).eq("direction", "inbound").order("created_at", { ascending: false }).limit(60);
      const latest = new Map<string, string>();
      for (const m of (msgs ?? []) as Array<{ lead_id: string; body: string | null }>) {
        const body = (m.body ?? "").trim();
        if (!latest.has(m.lead_id) && body && !/^(Shared an Instagram|\[Instagram )/i.test(body)) latest.set(m.lead_id, body.replace(/\s+/g, " ").slice(0, 90));
      }
      story.goingCold = story.goingCold.map((l) => ({ ...l, quote: latest.get(l.id) ?? null }));
    }
    return story;
  } catch (error) {
    console.error("Home story failed", error instanceof Error ? error.message : error);
    return null;
  }
}
