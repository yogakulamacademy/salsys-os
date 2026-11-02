import fs from "node:fs";
const read = (file) => fs.readFileSync(file, "utf8");
const page = read("app/home/page.tsx").replace(/\s+/g, " ");
const layout = read("app/home/layout.tsx");
const model = read("lib/home-command-center.ts");
const loader = read("lib/home-command-center-data.ts");
const migration = read(
  "supabase/migrations/20261101095500_home_command_center_final_closeout_v1.sql",
);
const failures = [];
const expect = (condition, message) => {
  if (!condition) failures.push(message);
};
expect(
  layout.includes("await requirePrivilegedWorkspaceAccess()"),
  "Home must retain its canonical privileged workspace guard.",
);
expect(
  !page.includes('.from("profiles")') && !page.includes("profile.role"),
  "Home must not authorize using global profile roles.",
);
expect(
  page.includes("Selected-period evidence is incomplete") &&
    page.includes("All-time totals are never substituted"),
  "Home must disclose incomplete period evidence and avoid snapshot substitution.",
);
expect(
  page.includes("model.leads.current === null") &&
    model.includes("current: available ? rows.length : null"),
  "Unknown selected-period counts must remain unknown.",
);
expect(
  !page.includes("metrics.total") &&
    !page.includes("snapshot.sources") &&
    !page.includes("snapshot.revenueSummary"),
  "Home must not mix current/all-time snapshots into selected-period reporting.",
);
expect(
  page.includes("Enrolled leads") &&
    page.includes("not the authoritative operational Enrollment-record count"),
  "CRM enrolled leads must stay distinct from operational Enrollment records.",
);
expect(
  model.includes('s.to_stage === "enrolled"') && model.includes("new Map("),
  "Enrolled KPI must deduplicate CRM enrolled-stage transition evidence.",
);
expect(
  model.includes("rankMap") && model.includes("period.previousEndExclusiveIso"),
  "Cohort progression must respect each period cutoff, not current stages.",
);
expect(
  loader.includes('count: "exact"') &&
    loader.includes("result.count > 10000") &&
    loader.includes("expected !== result.count"),
  "Capped or inconsistent evidence must fail closed rather than render partial totals.",
);
expect(
  loader.includes("requireCurrentOrganizationId") &&
    !loader.includes("createAdminClient"),
  "Reporting reads must retain session-bound organization scope and RLS.",
);
expect(
  page.includes("Payment evidence unavailable") &&
    page.includes("without currency conversion"),
  "Revenue must disclose unavailable evidence and keep currencies separate.",
);
expect(
  page.includes("Tasks show current work") &&
    page.includes("independent of reporting dates"),
  "Current work queues must remain explicitly separate from period reporting.",
);
expect(
  migration.includes("get_dashboard_snapshot_internal_v1") &&
    migration.includes("b.start_date >= current_date") &&
    migration.includes("b\\.end_date\\s+>=\\s+current_date") &&
    migration.includes(
      "expected exactly one legacy end-date upcoming boundary",
    ),
  "Existing upcoming-batch migration must preserve its defensive boundary correction.",
);
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("Home / Command Center evidence and access contracts passed.");
