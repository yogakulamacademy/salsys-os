import "server-only";

import { buildTasksIntelligence, type TaskFact, type TasksIntelligence } from "@/lib/tasks-intelligence";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentOrganizationId } from "@/lib/workspace";

// Live data for the Smart Tasks briefing. Admins and managers only (it is a
// whole-business view); read with the service client for the business the
// signed-in user was just verified to belong to. Test leads are left out.

type TaskRow = {
  id: string; lead_id: string; title: string | null; status: string; due_at: string | null;
  created_at: string; completed_at: string | null; assigned_to: string | null;
};

const WINDOW_DAYS = 21;
const chunks = <T,>(xs: T[], n = 150) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

export async function getTasksIntelligence(now = new Date()): Promise<TasksIntelligence | null> {
  try {
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return null;
    const org = await requireCurrentOrganizationId(supabase, auth.user.id);
    const { data: canSee } = await supabase.rpc("can_administer_organization_crm", { p_organization_id: org });
    if (canSee !== true) return null;
    const admin = createAdminClient();

    const since = new Date(now.getTime() - WINDOW_DAYS * 86_400_000).toISOString();
    const cols = "id, lead_id, title, status, due_at, created_at, completed_at, assigned_to";
    const rows = new Map<string, TaskRow>();
    for (const filter of ["recent", "open"] as const) {
      for (let from = 0; from < 20000; from += 1000) {
        let q = admin.from("tasks").select(cols).eq("organization_id", org);
        q = filter === "recent" ? q.or(`created_at.gte.${since},completed_at.gte.${since}`) : q.in("status", ["open", "snoozed"]);
        const { data, error } = await q.order("id").range(from, from + 999);
        if (error) throw new Error(error.message);
        for (const r of (data ?? []) as TaskRow[]) rows.set(r.id, r);
        if (!data || data.length < 1000) break;
      }
    }

    const leadIds = [...new Set([...rows.values()].map((r) => r.lead_id).filter(Boolean))];
    const owner = new Map<string, string | null>();
    const test = new Set<string>();
    for (const ids of chunks(leadIds)) {
      const { data, error } = await admin.from("leads").select("id, owner_user_id, metadata").eq("organization_id", org).in("id", ids);
      if (error) throw new Error(error.message);
      for (const l of (data ?? []) as Array<{ id: string; owner_user_id: string | null; metadata: Record<string, unknown> | null }>) {
        owner.set(l.id, l.owner_user_id);
        if (l.metadata?.test_lead === true) test.add(l.id);
      }
    }

    // Who answered last, for open follow-ups only.
    const open = [...rows.values()].filter((r) => (r.status === "open" || r.status === "snoozed") && !test.has(r.lead_id));
    const earliest = open.reduce((m, r) => (r.created_at < m ? r.created_at : m), now.toISOString());
    const lastOut = new Map<string, string>();
    const lastIn = new Map<string, string>();
    for (const ids of chunks([...new Set(open.map((r) => r.lead_id))])) {
      const { data, error } = await admin.from("messages").select("lead_id, direction, created_at")
        .eq("organization_id", org).in("lead_id", ids).gte("created_at", earliest)
        .order("created_at", { ascending: false }).limit(5000);
      if (error) throw new Error(error.message);
      for (const m of (data ?? []) as Array<{ lead_id: string; direction: string; created_at: string }>) {
        const map = m.direction === "outbound" ? lastOut : m.direction === "inbound" ? lastIn : null;
        if (map && !map.has(m.lead_id)) map.set(m.lead_id, m.created_at);
      }
    }

    const people = [...new Set([...rows.values()].map((r) => r.assigned_to ?? owner.get(r.lead_id) ?? null).filter((v): v is string => Boolean(v)))];
    const names = new Map<string, string>();
    if (people.length) {
      const { data } = await admin.from("profiles").select("id, full_name").in("id", people);
      for (const p of (data ?? []) as Array<{ id: string; full_name: string | null }>) names.set(p.id, p.full_name?.trim() || "Team member");
    }

    const facts: TaskFact[] = [];
    for (const r of rows.values()) {
      if (test.has(r.lead_id)) continue;
      const who = r.assigned_to ?? owner.get(r.lead_id) ?? null;
      const out = lastOut.get(r.lead_id);
      const inn = lastIn.get(r.lead_id);
      facts.push({
        id: r.id, leadId: r.lead_id, createdAt: r.created_at, completedAt: r.completed_at, status: r.status,
        dueAt: r.due_at, title: (r.title ?? "Follow-up").trim() || "Follow-up",
        ownerName: who ? names.get(who) ?? "Team member" : null,
        answered: Boolean(out && out > r.created_at && (!inn || inn <= out)),
      });
    }
    return buildTasksIntelligence(facts, now, WINDOW_DAYS);
  } catch (error) {
    console.error("tasks_intelligence_failed", error instanceof Error ? error.message : error);
    return null;
  }
}
