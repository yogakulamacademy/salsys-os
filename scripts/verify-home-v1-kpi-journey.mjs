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
const nextActions = read("lib/home-next-actions.ts");
const failures = [];
const assert = (condition, message) => {
  if (!condition) failures.push(message);
};

const pulseStart = home.indexOf('<section aria-label="Business pulse"');
const pulseEnd = pulseStart >= 0 ? home.indexOf("</section>", pulseStart) : -1;
const pulse = pulseEnd > pulseStart ? home.slice(pulseStart, pulseEnd) : "";
const labels = [...pulse.matchAll(/\slabel="([^"]+)"/g)].map((match) => match[1]);
assert(
  labels.join("|") === "Leads|Qualified|Pipeline value|Recorded collections",
  "The executive KPI order must be Leads, Qualified, Open Pipeline, Recorded Collections.",
);
assert(
  !pulse.includes('label="Needs reply"') &&
    nextActions.includes('label: "Needs reply"') &&
    home.includes("buildHomeNextActions({") &&
    home.includes("...activeAttention.map((item) => ({"),
  "Needs reply must stay in the operational attention queue, not the KPI row.",
);
assert(
  pulse.includes('value={openPipelineValue}') &&
    home.includes("pipelineHeadline(pipelineTruth.currencies)") &&
    !/reduce\(/.test(read("lib/home-data-health.ts").split("export function pipelineHeadline")[1] ?? "reduce("),
  "The open pipeline KPI must use a single identifiable currency; mixed currencies must not be summed.",
);
assert(
  pulse.includes("As of now: positive potential values on open leads") &&
    pulse.includes("does not change with the period filter") &&
    home.includes("valued · now"),
  "Pipeline must be clearly marked as an as-of-now snapshot.",
);
assert(
  home.includes("historicalQualification?.qualifiedLeads") &&
    home.includes("by period end, from recorded stage history") &&
    !home.includes("qualified leads use current stages for that lead cohort"),
  "Qualification must use historical milestone results and avoid a current-stage narrative.",
);
assert(
  home.includes("Not yet reconciled to bank or payment-provider settlement.") &&
    home.includes("pending · unreconciled") &&
    home.includes("Ledger · unreconciled"),
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

assert(
  home.includes("`${item.timing} · ${item.evidence}`") &&
    home.includes('<span className="text-xs leading-4 text-copy-muted">{item.hint}</span>') &&
    !home.includes('truncate text-xs text-copy-muted">{item.hint}'),
  "Home operational next actions must display their reason and source evidence without requiring hover.",
);

if (failures.length) {
  console.error("Home V1 KPI journey checks failed:");
  for (const failure of failures) console.error("- " + failure);
  process.exit(1);
}
console.log("Home V1 KPI journey static contract checks passed.");
