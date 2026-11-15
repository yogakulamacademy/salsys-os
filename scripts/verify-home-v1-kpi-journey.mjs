import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const home = read("app/home/page.tsx");
const layout = read("app/home/layout.tsx");
const period = read("lib/dashboard-period-data.ts");
const migration = read(
  "supabase/migrations/20261115091500_home_dashboard_privileged_rpc_guard_v1.sql",
);
const failures = [];
const assert = (condition, message) => {
  if (!condition) failures.push(message);
};

const pulseStart = home.indexOf('<section aria-label="Business pulse"');
const pulseEnd = pulseStart >= 0 ? home.indexOf("</section>", pulseStart) : -1;
const pulse = pulseEnd > pulseStart ? home.slice(pulseStart, pulseEnd) : "";
const labels = [...pulse.matchAll(/\slabel="([^"]+)"/g)].map((match) => match[1]);
assert(
  labels.join("|") === "Leads|Qualified leads|Open pipeline value|Recorded collections",
  "The executive KPI order must be Leads, Qualified, Open Pipeline, Recorded Collections.",
);
assert(
  !pulse.includes('label="Needs reply"') && home.includes('label: "Needs reply"'),
  "Needs reply must stay in the operational attention queue, not the KPI row.",
);
assert(
  pulse.includes('value={openPipelineValue}') &&
    home.includes("valuedPipelineCurrencies.length === 1"),
  "The open pipeline KPI must use a single identifiable currency; mixed currencies must not be summed.",
);
assert(
  pulse.includes('statusLabel="As of now"') &&
    home.includes("Open pipeline is a current-state estimate and does not change with the period filter."),
  "Pipeline must be clearly marked as an as-of-now snapshot.",
);
assert(
  pulse.includes('evidenceState="partial"') &&
    home.includes("current stage is qualified or later") === false &&
    home.includes("whose CURRENT stage is qualified or later"),
  "Historical qualification must not be advertised as a verified as-of-period conversion.",
);
assert(
  home.includes("reconciliation pending") &&
    home.includes("Recorded payment ledger · unverified"),
  "Collections must communicate the reconciliation limitation.",
);
assert(
  home.includes("UTC reporting days") &&
    period.includes("utcStartOfDay(new Date())"),
  "Date period boundaries must be clearly labeled while organization timezone support is pending.",
);
assert(
  layout.includes("await requirePrivilegedWorkspaceAccess()") &&
    migration.includes("public.has_organization_role(") &&
    migration.includes("array['owner', 'admin', 'manager']::text[]") &&
    migration.includes("public.session_is_bound_to_organization(p_organization_id)") &&
    migration.includes("auth.role() = 'service_role'") &&
    migration.includes("errcode = '42501'"),
  "The RPC migration must enforce privileged, session-bound organization authorization.",
);
assert(
  migration.includes("revoke all on function public.get_dashboard_snapshot(uuid)") &&
    migration.includes("to authenticated, service_role"),
  "RPC execute grants must be explicit.",
);

if (failures.length) {
  console.error("Home V1 KPI journey checks failed:");
  for (const failure of failures) console.error("- " + failure);
  process.exit(1);
}
console.log("Home V1 KPI journey static contract checks passed.");
