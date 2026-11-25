import "server-only";

import { isDataQuality, type DataQuality } from "@/lib/data-quality";
import type { CourseRef } from "@/lib/person-checks";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentOrganizationId } from "@/lib/workspace";

/** Data quality for admins of the signed-in business; null otherwise or on failure. */
export async function getDataQuality(): Promise<{ data: DataQuality; courses: CourseRef[] } | null> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const org = await requireCurrentOrganizationId(supabase, user.id);
    const { data: isAdmin } = await supabase.rpc("can_manage_organization", { p_organization_id: org });
    if (isAdmin !== true) return null;
    const admin = createAdminClient();
    const [dq, courses] = await Promise.all([
      admin.rpc("data_quality_v1", { p_organization_id: org }),
      admin.from("courses").select("id, name").eq("organization_id", org).limit(300),
    ]);
    if (dq.error || !isDataQuality(dq.data)) return null;
    return {
      data: dq.data,
      courses: ((courses.data ?? []) as Array<{ id: string; name: string | null }>).filter((c) => c.name).map((c) => ({ id: c.id, name: c.name! })),
    };
  } catch {
    return null;
  }
}
