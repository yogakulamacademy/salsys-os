import "server-only";

import { getProviderVisibility } from "@/lib/integrations/provider-visibility";
import { createClient } from "@/lib/supabase/server";
import type { ContentGapRow } from "@/lib/seo-data";

/**
 * One-purpose read path for the Content Brief worksheet.
 *
 * Do not replace this with getSeoWorkspace(): that loader fans out to search,
 * revenue, AEO, GEO, experiments and optimization, which the worksheet never
 * displays and must not run just to inspect a content gap.
 */
export async function getContentBriefResearch(
  authorizedOrganizationId: string,
): Promise<{ contentGaps: ContentGapRow[]; contentWarning: string | null }> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(authorizedOrganizationId)) {
    throw new Error("Invalid active organization context.");
  }

  const supabase = await createClient();
  const visibility = await getProviderVisibility(supabase);

  // Explicitly bind the read to the organization obtained from the authenticated
  // membership guard, even if the user's active workspace changes between calls.
  if (visibility.organizationId !== authorizedOrganizationId) {
    throw new Error("Active organization changed; reload the workspace.");
  }

  if (!visibility.googleConnected) {
    return {
      contentGaps: [],
      contentWarning: "Google search data is not connected for this organization.",
    };
  }

  // The stable RPC validates organization membership and remains the existing
  // tenant-scoped, read-only security boundary. Do not query internal V2 RPCs.
  const { data, error } = await supabase.rpc("get_seo_content_intelligence", {
    p_organization_id: authorizedOrganizationId,
  });

  if (error) {
    return {
      contentGaps: [],
      contentWarning: "Content research evidence could not be loaded. Try again or review source health.",
    };
  }

  const payload = data && typeof data === "object" && !Array.isArray(data)
    ? data as { content_gaps?: unknown }
    : {};
  const gaps = Array.isArray(payload.content_gaps)
    ? payload.content_gaps
    : [];

  // Both size and shape are bounded before page rendering. Never trust a
  // PostgREST result to contain exclusively well-formed records.
  const contentGaps: ContentGapRow[] = gaps.slice(0, 200)
    .filter((row): row is ContentGapRow =>
      row !== null && typeof row === "object" &&
      typeof row.topic_id === "string" && typeof row.topic_name === "string");

  return {
    contentGaps,
    contentWarning: null,
  };
}
