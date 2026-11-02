import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceContext } from "@/lib/workspace";
import { isMockMode } from "@/lib/data";

export async function GET(request: NextRequest) {
  const reply = (body: unknown, status = 200) =>
    NextResponse.json(body, {
      status,
      headers: { "Cache-Control": "private, no-store", Vary: "Cookie" },
    });
  const db = await createClient();
  const {
    data: { user },
    error,
  } = await db.auth.getUser();
  if (error || !user) return reply({ error: "Sign in to search." }, 401);
  const context = await getCurrentWorkspaceContext(db);
  const workspace = context.activeWorkspace;
  if (
    !workspace ||
    !["owner", "admin", "manager", "admissions"].includes(workspace.role)
  )
    return reply({ error: "Workspace access required." }, 403);
  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2 || q.length > 80) return reply({ results: [] });
  if (isMockMode()) return reply({ results: [], demo: true });
  const pattern = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
  const org = workspace.organizationId;
  const privileged = workspace.role !== "admissions";
  // Session-bound reads only. No admin client, message bodies or contact identifiers.
  const [leads, courses, campaigns, taskNames] = await Promise.all([
    db
      .from("leads")
      .select("id,display_name,lead_code")
      .eq("organization_id", org)
      .neq("status", "archived")
      .ilike("display_name", pattern)
      .order("id")
      .limit(6),
    privileged
      ? db
          .from("courses")
          .select("id,name")
          .eq("organization_id", org)
          .ilike("name", pattern)
          .order("id")
          .limit(4)
      : Promise.resolve({ data: [], error: null }),
    privileged
      ? db
          .from("campaigns")
          .select("id,name")
          .eq("organization_id", org)
          .ilike("name", pattern)
          .order("id")
          .limit(4)
      : Promise.resolve({ data: [], error: null }),
    db
      .from("tasks")
      .select("id,title,lead_id")
      .eq("organization_id", org)
      .ilike("title", pattern)
      .order("id")
      .limit(4),
  ]);
  const ids = (leads.data ?? []).map((l) => l.id);
  const [conversations, tasks, people] = ids.length
    ? await Promise.all([
        db
          .from("conversations")
          .select("id,lead_id,channel")
          .eq("organization_id", org)
          .in("lead_id", ids)
          .order("id")
          .limit(6),
        db
          .from("tasks")
          .select("id,title,lead_id")
          .eq("organization_id", org)
          .in("lead_id", ids)
          .in("status", ["open", "snoozed"])
          .order("due_at")
          .limit(6),
        privileged
          ? db
              .from("person_leads")
              .select("person_id,lead_id,person:persons!inner(status)")
              .eq("organization_id", org)
              .eq("person.status", "active")
              .in("lead_id", ids)
              .order("id")
              .limit(6)
          : Promise.resolve({ data: [], error: null }),
      ])
    : [
        { data: [], error: null },
        { data: [], error: null },
        { data: [], error: null },
      ];
  const names = new Map(
    (leads.data ?? []).map((l) => [l.id, l.display_name || l.lead_code]),
  );
  const results = [
    ...(leads.data ?? []).map((l) => ({
      id: `lead-${l.id}`,
      kind: "Lead",
      title: l.display_name || l.lead_code,
      href: `/leads/${l.id}`,
    })),
    ...[
      ...new Map((people.data ?? []).map((p) => [p.person_id, p])).values(),
    ].map((p) => ({
      id: `person-${p.person_id}`,
      kind: "Contact",
      title: names.get(p.lead_id) || "Customer profile",
      href: `/customer-360/${p.person_id}`,
    })),
    ...(conversations.data ?? []).map((c) => ({
      id: `conversation-${c.id}`,
      kind: "Conversation",
      title: `${names.get(c.lead_id)} · ${c.channel}`,
      href: `/conversations?lead=${c.lead_id}`,
    })),
    ...[
      ...new Map(
        [...(taskNames.data ?? []), ...(tasks.data ?? [])].map((t) => [
          t.id,
          t,
        ]),
      ).values(),
    ].map((t) => ({
      id: `task-${t.id}`,
      kind: "Task",
      title: t.title,
      href: `/leads/${t.lead_id}`,
    })),
    ...(courses.data ?? []).map((c) => ({
      id: `course-${c.id}`,
      kind: "Course",
      title: c.name,
      href: `/course-management?course=${c.id}`,
    })),
    ...(campaigns.data ?? []).map((c) => ({
      id: `campaign-${c.id}`,
      kind: "Campaign",
      title: c.name,
      href: `/campaigns?q=${encodeURIComponent(c.name)}`,
    })),
  ];
  return reply({
    results,
    partial: [
      leads,
      courses,
      campaigns,
      taskNames,
      conversations,
      tasks,
      people,
    ].some((r) => r.error),
  });
}
