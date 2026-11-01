import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { syncYogakulamCourseCatalog } from "@/lib/integrations/yogakulam-courses";

const DEFAULT_YOGAKULAM_FEED_URL =
  "https://www.yogakulam.com/api/crm/course-batches.php";

type CatalogSyncTrigger = "manual" | "cron" | "webhook";

function yogakulamCourseFeedUrl() {
  return (
    process.env.YOGAKULAM_COURSE_FEED_URL?.trim() ||
    DEFAULT_YOGAKULAM_FEED_URL
  );
}

async function assertFeedBelongsToOrganization(organizationId: string) {
  const feedUrl = yogakulamCourseFeedUrl();
  let hostname: string;

  try {
    hostname = new URL(feedUrl).hostname.toLowerCase();
  } catch {
    throw new Error(`Invalid Yogakulam course feed URL: ${feedUrl}`);
  }

  const supabase = createAdminClient();
  const { data: site, error } = await supabase
    .from("organization_sites")
    .select("organization_id")
    .eq("hostname", hostname)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Unable to verify Yogakulam catalog tenant mapping for ${hostname}: ${error.message}`,
    );
  }

  if (!site?.organization_id) {
    throw new Error(
      `No organization site mapping exists for Yogakulam catalog host ${hostname}.`,
    );
  }

  if (String(site.organization_id) !== organizationId) {
    throw new Error(
      "CATALOG_SYNC_PROVIDER_TENANT_MISMATCH: configured organization does not own the Yogakulam course-feed hostname.",
    );
  }
}

export async function syncYogakulamCatalogAdapter({
  organizationId,
  trigger,
}: {
  organizationId: string;
  trigger: CatalogSyncTrigger;
  config: Record<string, unknown>;
}) {
  // Keep the proven Yogakulam parser/sync implementation intact. The adapter
  // boundary verifies tenant ownership before delegating to it.
  await assertFeedBelongsToOrganization(organizationId);
  return syncYogakulamCourseCatalog({ trigger });
}
