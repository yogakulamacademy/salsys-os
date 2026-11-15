import fs from "node:fs";
import path from "node:path";

const read = (file) => fs.readFileSync(path.join(process.cwd(), file), "utf8");
const reader = read("lib/home-opportunity-valuation.ts");
const page = read("app/revenue/valuation/page.tsx");
const revenue = read("app/revenue/page.tsx");
const home = read("app/home/page.tsx");
const guard = read("app/revenue/layout.tsx");
const failures = [];
const check = (ok, reason) => { if (!ok) failures.push(reason); };

check(
  guard.includes("await requirePrivilegedWorkspaceAccess()") &&
  reader.includes("await requirePrivilegedWorkspaceAccess()"),
  "Valuation route and data loader must enforce privileged workspace access.",
);
check(
  reader.includes('.eq("organization_id", workspace.organizationId)') &&
  reader.includes('.eq("status", "open")') &&
  reader.includes('.in("current_stage", ELIGIBLE_STAGES)'),
  "All valuation counts must be tenant-scoped and limited to eligible open stages.",
);
check(
  reader.includes('.in("current_stage", PRIORITY_STAGES)') &&
  reader.includes('.in("current_stage", OTHER_STAGES)') &&
  reader.includes(".limit(20)"),
  "Bounded priority and recent queues must use distinct open-stage cohorts.",
);
check(
  reader.includes("potential_value.is.null,potential_value.lte.0,potential_currency.is.null"),
  "Valuation queue must include missing potential values and missing currencies.",
);
check(
  page.includes("getOpportunityValuationQueue()") &&
  page.includes("getCourseBatches()") &&
  page.includes("isEducationCoreEnabledForCurrentSession()"),
  "Valuation readiness must use existing lead and authorized course batch read models.",
);
check(
  page.includes("options.length === 1") &&
  page.includes("Confirm the actual batch, package and negotiated amount before saving.") &&
  page.includes("No amount is assigned automatically here."),
  "Batch prices must remain suggestions requiring human review.",
);
check(
  page.includes("/leads/${lead.id}/edit") &&
  !reader.includes(".update(") &&
  !reader.includes(".insert(") &&
  !reader.includes(".delete("),
  "Valuation queue must be read-only and link to the existing audited Lead Edit workflow.",
);
check(
  home.includes('<Link href="/revenue/valuation"') &&
  revenue.includes('<Link href="/revenue/valuation"'),
  "Home and Revenue readiness prompts must route to the new queue.",
);
if (failures.length) {
  console.error("Home valuation queue contract failure:");
  for (const failure of failures) console.error("- " + failure);
  process.exit(1);
}
console.log("Home valuation queue static contract checks passed.");
