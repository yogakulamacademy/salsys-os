import "server-only";

import { createClient } from "@/lib/supabase/server";
import { requireCurrentOrganizationId } from "@/lib/workspace";
import type { QuickBatch } from "@/lib/inbox-quick-replies";

/** Next active batches for a course, with the shared/course price, for quick-reply drafts. */
export async function getUpcomingBatchesForQuickReplies(courseId: string | null | undefined): Promise<QuickBatch[]> {
  if (!courseId) return [];
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const organizationId = await requireCurrentOrganizationId(supabase, user.id);
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("course_batches")
    .select("start_date, location, mode, currency, price_shared, price_course_only")
    .eq("organization_id", organizationId)
    .eq("course_id", courseId)
    .eq("active", true)
    .gte("start_date", today)
    .order("start_date", { ascending: true })
    .limit(3);
  if (error || !data) return [];
  return data.map((row) => ({
    startDate: String(row.start_date),
    location: row.location ?? null,
    mode: row.mode ?? null,
    currency: row.currency ?? null,
    price: row.price_shared ?? row.price_course_only ?? null,
  }));
}
