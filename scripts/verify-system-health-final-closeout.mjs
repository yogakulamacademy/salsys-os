import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");

const layout = read("app/system-health/layout.tsx");
const page = read("app/system-health/page.tsx");
const readiness = read("app/system-health/operational-readiness-section.tsx");

const failures = [];
const expect = (condition, message) => {
  if (!condition) failures.push(message);
};

expect(
  layout.includes('const BASE_HEALTH_STATUSES = new Set(["healthy", "warning", "critical"])'),
  "Base operational health must whitelist the exact status vocabulary before the mature page renders.",
);
expect(
  layout.includes("loadBaseOperationalEvidence(organizationId)") &&
    layout.includes("baseEvidence.available ?") &&
    layout.includes("<OperationalEvidenceUnavailable evidence={baseEvidence} />"),
  "The parent System Health layout must fail closed when canonical operational evidence cannot be verified.",
);
expect(
  layout.includes('.from("v_system_health")') &&
    layout.includes('.eq("organization_id", organizationId)'),
  "The fail-closed evidence gate must read the canonical health view and remain explicitly tenant-scoped.",
);
expect(
  layout.includes("rows.length === 0") &&
    layout.includes("will not infer zero incidents or a healthy state from missing evidence"),
  "An empty operational-health result must not be presented as a healthy zero-state.",
);
expect(
  layout.includes("unknownStatuses.length > 0") &&
    layout.includes("Verify the source view before treating the workspace as healthy"),
  "Unrecognized base health states must block the healthy overview and require verification.",
);
expect(
  layout.includes('if (value === "healthy") return "healthy";') &&
    layout.includes('if (value === "warning") return "warning";') &&
    layout.includes('return "unknown";'),
  "Data Integrity must explicitly preserve healthy/warning and map every other state to unknown.",
);
expect(
  layout.includes("Integrity status is not recognized by the current System Health") &&
    layout.includes("Missing integrity evidence is not treated as healthy"),
  "Data Integrity must visibly disclose unknown or missing evidence instead of defaulting green.",
);

for (const status of [
  "healthy",
  "critical",
  "warning",
  "inactive",
  "configuration_blocked",
]) {
  expect(
    readiness.includes(`if (value === "${status}") return "${status}";`),
    `Operational Readiness must explicitly recognize ${status}.`,
  );
}
expect(
  readiness.includes('return "unknown";') &&
    readiness.includes('if (status === "unknown")') &&
    readiness.includes("Verify the source view before treating this capability as healthy"),
  "Operational Readiness must render unfamiliar states as unknown, never healthy.",
);
expect(
  readiness.includes('.from("v_system_operational_readiness_v1")') &&
    readiness.includes('.from("v_google_ads_operational_readiness_v1")') &&
    readiness.includes('.from("v_commerce_event_readiness_v1")') &&
    readiness.match(/\.eq\("organization_id", organizationId\)/g)?.length >= 3,
  "Operational Readiness service-role reads for base, Google Ads, and commerce must remain explicitly tenant-scoped.",
);
expect(
  readiness.includes("Google Ads readiness is temporarily unavailable.") &&
    readiness.includes("Commerce event readiness is temporarily unavailable."),
  "Companion readiness-source failures must be disclosed rather than silently omitted.",
);
expect(
  page.includes("await requireAdminAccess()") &&
    page.includes('.eq(\n          "organization_id",\n          organizationId\n        )'),
  "The mature System Health page must retain its owner/admin access and tenant-scoped service-role reads.",
);
expect(
  layout.includes('workspace.activeWorkspace.role !== "owner"') &&
    layout.includes('workspace.activeWorkspace.role !== "admin"'),
  "The System Health parent route boundary must remain owner/admin only.",
);

if (failures.length) {
  console.error("System Health final closeout contract failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("System Health final closeout contract passed.");
