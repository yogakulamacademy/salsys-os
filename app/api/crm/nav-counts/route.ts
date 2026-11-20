import { NextResponse } from "next/server";

import { getHomeStory } from "@/lib/home-story-data";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentOrganizationId } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export type CrmNavCounts = { waiting: number; overdue: number; paying: number; saysPaid: number };

// Badge counts for the CRM menu. Business-wide numbers, so admins and managers
// only; others get no badges. Cached for 3 minutes per business so moving
// between pages doesn't recount every time.
const cache = new Map<string, { at: number; counts: CrmNavCounts }>();
const TTL_MS = 3 * 60_000;

export async function GET() {
  const headers = { "Cache-Control": "private, no-store" };
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false }, { status: 401, headers });
    const organizationId = await requireCurrentOrganizationId(supabase, user.id);
    const { data: isAdmin } = await supabase.rpc("can_manage_organization", { p_organization_id: organizationId });
    if (isAdmin !== true) return NextResponse.json({ ok: true, counts: null }, { headers });

    const hit = cache.get(organizationId);
    if (hit && Date.now() - hit.at < TTL_MS) return NextResponse.json({ ok: true, counts: hit.counts }, { headers });

    const admin = createAdminClient();
    const [story, overdue, paying] = await Promise.all([
      getHomeStory(),
      admin.from("tasks").select("id", { count: "exact", head: true }).eq("organization_id", organizationId)
        .in("status", ["open", "snoozed"]).lt("due_at", new Date().toISOString()),
      admin.from("leads").select("id", { count: "exact", head: true }).eq("organization_id", organizationId)
        .eq("current_stage", "payment_pending").neq("status", "archived"),
    ]);
    const counts: CrmNavCounts = {
      waiting: story?.waitingThisWeek ?? 0,
      overdue: overdue.count ?? 0,
      paying: paying.count ?? 0,
      saysPaid: story?.saysPaid.length ?? 0,
    };
    cache.set(organizationId, { at: Date.now(), counts });
    return NextResponse.json({ ok: true, counts }, { headers });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500, headers });
  }
}
