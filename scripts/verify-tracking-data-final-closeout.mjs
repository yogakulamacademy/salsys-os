import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const migration = read(
  "supabase/migrations/20261101102000_tracking_data_final_closeout_v1.sql",
);
const trackingData = read("lib/tracking-data.ts");
const trackingLayout = read("app/tracking/layout.tsx");
const sourceRoute = read("app/api/tracking/sources/route.ts");
const sourceDetailRoute = read("app/api/tracking/sources/[id]/route.ts");
const tenantFoundation = read("supabase/migrations/007_tenant_schema_foundation.sql");

const failures = [];
const expect = (condition, message) => {
  if (!condition) failures.push(message);
};

expect(
  migration.includes("security definer") &&
    migration.includes("public.is_organization_member(p_organization_id)"),
  "Tracking aggregate must stay tenant-authorized and security-definer.",
);
expect(
  migration.includes("t.organization_id = p_organization_id") &&
    migration.includes("t.lead_id is null") &&
    migration.includes("public.can_access_lead(l.id)"),
  "Canonical tracking aggregate must include tenant-owned anonymous touchpoints while retaining lead access checks for linked rows.",
);
expect(
  !migration.includes("join accessible_leads al") &&
    !migration.includes("on al.id = t.lead_id"),
  "Tracking closeout must not reintroduce the linked-lead-only inner join.",
);
expect(
  migration.includes(
    "revoke all on function public.get_tracking_workspace_v2(uuid) from public, anon",
  ) &&
    migration.includes(
      "grant execute on function public.get_tracking_workspace_v2(uuid) to authenticated, service_role",
    ),
  "Anonymous execution must remain denied while authenticated tenant aggregate access remains available.",
);

expect(
  tenantFoundation.includes("create policy touchpoints_read") &&
    tenantFoundation.includes("lead_id is not null") &&
    tenantFoundation.includes("can_access_lead(lead_id)"),
  "Raw touchpoint RLS must continue requiring linked-lead access; anonymous rows must not be exposed directly.",
);

expect(
  trackingData.includes('import { cache } from "react"') &&
    trackingData.includes("export const getTrackingWorkspace = cache"),
  "Tracking workspace reads must be request-cached when shared by layout and page.",
);
expect(
  trackingData.includes("Reduced compatibility fallback") &&
    trackingData.includes("may be undercounted") &&
    trackingData.includes("fallback: true"),
  "Compatibility fallback must explicitly disclose reduced anonymous evidence.",
);
expect(
  trackingLayout.includes("Reduced tracking evidence") &&
    trackingLayout.includes("trackingWorkspace.fallback") &&
    trackingLayout.includes("do not interpret missing overview metrics as zero activity"),
  "Tracking layout must visibly disclose degraded overview evidence.",
);
expect(
  trackingLayout.includes("requireAdminWorkspaceAccess"),
  "Tracking route tree must remain owner/admin-only.",
);

for (const source of [sourceRoute, sourceDetailRoute]) {
  expect(
    source.includes("['owner', 'admin'].includes(workspace.role)"),
    "Tracking source administration must remain owner/admin-only.",
  );
  expect(
    source.includes("sameOrigin(request)"),
    "Tracking source mutations must retain same-origin protection.",
  );
  expect(
    source.includes("Cache-Control") && source.includes("no-store"),
    "Tracking credential/source responses must remain non-cacheable.",
  );
}
expect(
  sourceRoute.includes("secret_hash: secretHash") &&
    !sourceRoute.includes("secret_hash: secret,") &&
    sourceDetailRoute.includes("secret_hash: secretHash"),
  "Server tracking secrets must continue to be stored only as hashes.",
);
expect(
  sourceDetailRoute.includes("shown_once: true") &&
    sourceDetailRoute.includes("hasHistory") &&
    sourceDetailRoute.includes("Pause it instead"),
  "Secret rotation must stay one-time and source history must remain preservation-safe.",
);

if (failures.length) {
  console.error("Tracking & Data final closeout contract failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Tracking & Data final closeout contract passed.");
