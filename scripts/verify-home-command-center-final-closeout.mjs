import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const homePage = read("app/home/page.tsx");
const homeLayout = read("app/home/layout.tsx");
const periodData = read("lib/dashboard-period-data.ts");
const migration = read(
  "supabase/migrations/20261101095500_home_command_center_final_closeout_v1.sql",
);

const failures = [];
const expect = (condition, message) => {
  if (!condition) failures.push(message);
};

expect(
  homeLayout.includes("requirePrivilegedWorkspaceAccess") &&
    homeLayout.includes("await requirePrivilegedWorkspaceAccess()"),
  "Home route tree must use the canonical privileged workspace access guard.",
);

expect(
  !homePage.includes('.from("profiles")') &&
    !homePage.includes(".from('profiles')") &&
    !homePage.includes("profile.role"),
  "Home page must not re-authorize through legacy global profiles.role.",
);

expect(
  homePage.includes("Selected-period evidence is incomplete"),
  "Home must visibly disclose incomplete selected-period evidence.",
);
expect(
  homePage.includes("Period KPIs stay unknown rather than falling back to all-time snapshot totals"),
  "Home must state that unavailable period KPIs are not replaced by snapshot totals.",
);
expect(
  homePage.includes("const totalLeads = periodAnalytics.available.leads") &&
    homePage.includes(": null;"),
  "Selected-period lead totals must fail closed to unknown.",
);
expect(
  !homePage.includes(": metrics.total;") &&
    !homePage.includes(": counts.qualified ?? 0;") &&
    !homePage.includes("primaryRevenue.collected, primaryRevenue.currency"),
  "Home must not silently substitute current/all-time snapshot values into selected-period KPIs.",
);
expect(
  homePage.includes('label="Enrolled leads"') &&
    homePage.includes("not the authoritative operational Enrollment-record count"),
  "CRM enrolled-stage evidence must be labeled distinctly from operational Enrollment records.",
);
expect(
  periodData.includes('.eq("to_stage", "enrolled")') &&
    periodData.includes("uniqueLeadIds"),
  "The enrolled-lead period metric must remain grounded in unique CRM stage-history evidence.",
);
expect(
  homePage.includes("Selected-period payment evidence is unavailable") &&
    homePage.includes("Current snapshot revenue has not been substituted"),
  "Revenue trend must disclose unavailable period evidence without snapshot substitution.",
);
expect(
  homePage.includes("Current all-time source totals have not been substituted"),
  "Acquisition quality must not silently replace unavailable period data with all-time sources.",
);
expect(
  homePage.includes('label="Collected in period"') &&
    homePage.includes('label="Current pipeline value"') &&
    homePage.includes('label="Current weighted value"'),
  "Home must distinguish period collected revenue from current pipeline snapshot values.",
);
expect(
  homePage.includes("batch.capacity != null && batch.capacity > 0") &&
    homePage.includes('"Capacity not set"'),
  "Home must keep missing/non-positive batch capacity unknown.",
);

expect(
  migration.includes("get_dashboard_snapshot_internal_v1") &&
    migration.includes("b.start_date >= current_date") &&
    migration.includes("b\\.end_date\\s+>=\\s+current_date") &&
    migration.includes("expected exactly one legacy end-date upcoming boundary"),
  "Home migration must defensively replace exactly the legacy end-date batch boundary with the future-start boundary.",
);

if (failures.length) {
  console.error("Home / Command Center final closeout contract failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Home / Command Center final closeout contract passed.");
