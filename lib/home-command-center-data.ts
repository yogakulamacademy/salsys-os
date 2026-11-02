import "server-only";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentOrganizationId } from "@/lib/workspace";
import type { DashboardPeriodSelection } from "./dashboard-period-data";
import {
  projectHome,
  type Evidence,
  type HomeInput,
} from "./home-command-center";

// Fail closed when a read is capped, fails or changes count during pagination.
// Normal authenticated client: organization predicates supplement, never replace, RLS.
export async function readHomeEvidence<T>(
  query: (offset: number) => PromiseLike<{
    data: unknown[] | null;
    error: unknown;
    count: number | null;
  }>,
): Promise<Evidence<T>> {
  const rows: T[] = [];
  const seen = new Set<string>();
  let expected: number | null = null;
  for (let page = 0; page < 20; page++) {
    let result;
    try {
      result = await query(rows.length);
    } catch {
      return { rows: [], available: false };
    }
    if (
      result.error ||
      result.count === null ||
      result.count > 10000 ||
      (expected !== null && expected !== result.count)
    )
      return { rows: [], available: false };
    expected = result.count;
    for (const row of result.data ?? []) {
      const id = (row as { id?: string | number })?.id;
      if (id === undefined || seen.has(String(id)))
        return { rows: [], available: false };
      seen.add(String(id));
    }
    rows.push(...((result.data ?? []) as T[]));
    if (rows.length === expected) return { rows, available: true };
    if (!result.data?.length || rows.length > expected) break;
  }
  return { rows: [], available: false };
}

export async function getHomeEvidence(period: DashboardPeriodSelection) {
  const db = await createClient();
  const {
    data: { user },
    error,
  } = await db.auth.getUser();
  if (error || !user) throw new Error("Unable to authenticate Home reporting.");
  const org = await requireCurrentOrganizationId(db, user.id);
  const [leads, stages, messages, payments, courses] = await Promise.all([
    readHomeEvidence<HomeInput["leads"]["rows"][number]>((offset) =>
      db
        .from("leads")
        .select(
          "id,display_name,lead_code,created_at,first_touch_source,interested_course_id",
          { count: "exact" },
        )
        .eq("organization_id", org)
        .neq("status", "archived")
        .gte("created_at", period.previousStartIso)
        .lt("created_at", period.endExclusiveIso)
        .order("id")
        .range(offset, offset + 499),
    ),
    readHomeEvidence<HomeInput["stages"]["rows"][number]>((offset) =>
      db
        .from("lead_stage_history")
        .select(
          "id,lead_id,to_stage,changed_at,lead:leads!inner(organization_id)",
          { count: "exact" },
        )
        .eq("lead.organization_id", org)
        .gte("changed_at", period.previousStartIso)
        .lt("changed_at", period.endExclusiveIso)
        .order("id")
        .range(offset, offset + 499),
    ),
    readHomeEvidence<HomeInput["messages"]["rows"][number]>((offset) =>
      db
        .from("messages")
        .select(
          "id,conversation_id,lead_id,created_at,direction,sender_type,status",
          { count: "exact" },
        )
        .eq("organization_id", org)
        .gte("created_at", period.previousStartIso)
        .lt("created_at", period.endExclusiveIso)
        .order("id")
        .range(offset, offset + 499),
    ),
    readHomeEvidence<HomeInput["payments"]["rows"][number]>((offset) =>
      db
        .from("payments")
        .select("id,lead_id,amount,currency,payment_kind,status,paid_at", {
          count: "exact",
        })
        .eq("organization_id", org)
        .gte("paid_at", period.previousStartIso)
        .lt("paid_at", period.endExclusiveIso)
        .in("status", ["paid", "refunded"])
        .order("id")
        .range(offset, offset + 499),
    ),
    readHomeEvidence<HomeInput["courses"]["rows"][number]>((offset) =>
      db
        .from("courses")
        .select("id,name", { count: "exact" })
        .eq("organization_id", org)
        .order("id")
        .range(offset, offset + 499),
    ),
  ]);
  return projectHome({ leads, stages, messages, payments, courses }, period);
}
