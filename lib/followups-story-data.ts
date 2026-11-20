import "server-only";

import { buildFollowupsStory, type FollowupsStory, type StoryTask } from "@/lib/followups-story";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentOrganizationId } from "@/lib/workspace";

// Every open task (due now or in the next week) with the context a person
// needs to act on it: what the lead last said, whether they are waiting, the
// course and its value. Read with the service client for the business the
// signed-in user was just verified to belong to (same pattern as the Home
// story); team members only get tasks on their own leads or assigned to them.

type TaskRow = {
  id: string; lead_id: string; title: string | null; description: string | null; due_at: string | null;
  created_by_id: string | null; task_type: string | null; assigned_to: string | null;
};
type LeadRow = {
  id: string; lead_code: string | null; display_name: string | null; first_name: string | null; last_name: string | null;
  current_stage: string; current_contact_channel: string | null; lead_origin: string | null; owner_user_id: string | null;
  last_inbound_at: string | null; last_outbound_at: string | null; potential_value: number | string | null;
  potential_currency: string | null; interested_course_id: string | null;
};

function chunks<T>(items: T[], size = 150): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export async function getFollowupsStory(now = new Date()): Promise<FollowupsStory | null> {
  try {
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return null;
    const organizationId = await requireCurrentOrganizationId(supabase, auth.user.id);
    const { data: isAdmin } = await supabase.rpc("can_manage_organization", { p_organization_id: organizationId });
    const admin = createAdminClient();

    const until = new Date(now.getTime() + 7 * 86_400_000).toISOString();
    const tasks: TaskRow[] = [];
    for (let from = 0; from < 10000; from += 1000) {
      const { data, error } = await admin.from("tasks")
        .select("id, lead_id, title, description, due_at, created_by_id, task_type, assigned_to")
        .eq("organization_id", organizationId).in("status", ["open", "snoozed"])
        .not("due_at", "is", null).lte("due_at", until)
        .order("id", { ascending: true }).range(from, from + 999);
      if (error) throw new Error(error.message);
      tasks.push(...((data ?? []) as TaskRow[]));
      if (!data || data.length < 1000) break;
    }

    const leadIds = [...new Set(tasks.map((t) => t.lead_id).filter(Boolean))];
    const leads = new Map<string, LeadRow>();
    const lastText = new Map<string, string>();
    for (const ids of chunks(leadIds)) {
      const [leadRes, msgRes] = await Promise.all([
        admin.from("leads")
          .select("id, lead_code, display_name, first_name, last_name, current_stage, current_contact_channel, lead_origin, owner_user_id, last_inbound_at, last_outbound_at, potential_value, potential_currency, interested_course_id")
          .eq("organization_id", organizationId).in("id", ids),
        admin.from("messages").select("lead_id, body, created_at")
          .eq("organization_id", organizationId).in("lead_id", ids).eq("direction", "inbound")
          .order("created_at", { ascending: false }).limit(ids.length * 4),
      ]);
      if (leadRes.error) throw new Error(leadRes.error.message);
      for (const l of (leadRes.data ?? []) as LeadRow[]) leads.set(l.id, l);
      for (const m of (msgRes.data ?? []) as Array<{ lead_id: string; body: string | null }>) {
        if (!lastText.has(m.lead_id) && m.body?.trim()) lastText.set(m.lead_id, m.body.replace(/\s+/g, " ").slice(0, 120));
      }
    }

    const courseIds = [...new Set([...leads.values()].map((l) => l.interested_course_id).filter((v): v is string => Boolean(v)))];
    const courseName = new Map<string, string>();
    if (courseIds.length) {
      const { data } = await admin.from("courses").select("id, name").eq("organization_id", organizationId).in("id", courseIds);
      for (const c of (data ?? []) as Array<{ id: string; name: string | null }>) if (c.name) courseName.set(c.id, c.name);
    }

    const rows: StoryTask[] = [];
    for (const t of tasks) {
      const l = leads.get(t.lead_id);
      if (!l || !t.due_at) continue;
      if (isAdmin !== true && l.owner_user_id !== auth.user.id && t.assigned_to !== auth.user.id) continue;
      const name = l.display_name?.trim() || [l.first_name, l.last_name].filter(Boolean).join(" ").trim() || l.lead_code || "Lead";
      const value = l.potential_value == null ? null : Number(l.potential_value);
      rows.push({
        id: t.id,
        leadId: t.lead_id,
        leadName: name,
        leadCode: l.lead_code ?? "",
        stage: l.current_stage,
        title: t.title ?? "Follow-up",
        description: t.description,
        dueAt: t.due_at,
        createdById: t.created_by_id,
        taskType: t.task_type ?? "follow_up",
        channel: l.current_contact_channel ?? "other",
        origin: l.lead_origin,
        lastInboundAt: l.last_inbound_at,
        lastOutboundAt: l.last_outbound_at,
        lastInboundText: lastText.get(t.lead_id) ?? null,
        value: value != null && Number.isFinite(value) && value > 0 ? value : null,
        currency: l.potential_currency,
        course: l.interested_course_id ? courseName.get(l.interested_course_id) ?? null : null,
      });
    }
    return buildFollowupsStory(rows, now);
  } catch (error) {
    console.error("followups_story_failed", error instanceof Error ? error.message : error);
    return null;
  }
}
