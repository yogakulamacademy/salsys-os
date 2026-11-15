import fs from "node:fs";
import path from "node:path";

const read = (file) => fs.readFileSync(path.join(process.cwd(), file), "utf8");
const home = read("app/home/page.tsx");
const reader = read("lib/home-v1-metric-truth.ts");
const migration = read(
  "supabase/migrations/20261115103000_home_v1_historical_qualification_and_pipeline_v1.sql",
);
const failures = [];
const expect = (ok, message) => { if (!ok) failures.push(message); };

expect(
  home.includes("getHomeV1MetricTruth(periodFallback)") &&
    home.includes("metricTruth.qualification") &&
    home.includes("metricTruth.pipeline"),
  "Home must read separate server-authorized metric truth.",
);
expect(
  home.includes("historicalQualification?.qualifiedLeads") &&
    home.includes("metricTruth.qualification.cohortLeads === periodAnalytics.leads.current") &&
    home.includes("metricTruth.qualification.historyCovered === metricTruth.qualification.cohortLeads"),
  "Historical qualification requires reconciliation with the selected acquisition cohort and stage history coverage.",
);
expect(
  home.includes('evidenceState={historicalQualification ? "derived" : "unknown"}') &&
    home.includes('evidenceState={pipelineTruth ?') &&
    reader.includes("qualificationResponse.error") &&
    reader.includes("pipelineResponse.error"),
  "Missing or malformed metrics must fail closed to unknown rather than fall back to a misleading calculation.",
);
expect(
  reader.includes("valuedCount + missingValueCount + missingCurrencyCount !== eligibleCount") &&
    reader.includes("entry.opportunities, 0) !== valuedCount") &&
    reader.includes("qualifiedLeads > cohortLeads"),
  "Parse returned metrics with count conservation and evidence checks.",
);
expect(
  migration.includes("h.changed_at < p_end_exclusive") &&
    migration.includes("h.to_stage::text in (") &&
    migration.includes("'qualified','high_intent','payment_pending','enrolled'"),
  "Qualification must use actual milestone transition timestamps before the selected cutoff.",
);
expect(
  migration.includes("l.status = 'open'::lead_status") &&
    migration.includes("l.current_stage::text in (") &&
    migration.includes("'new','contacted','engaged','qualified'") &&
    migration.includes("'high_intent','payment_pending'") &&
    migration.includes("potential_value > 0 and currency is not null"),
  "Opportunity value must include only eligible open stages and require explicit positive value and currency.",
);
expect(
  !migration.includes("l.potential_currency, 'INR'") &&
    migration.includes("missing_value_count") &&
    migration.includes("missing_currency_count") &&
    migration.includes("eligible_count"),
  "Pipeline must not guess unknown currencies and must expose coverage.",
);
expect(
  migration.includes("public.has_organization_role(") &&
    migration.includes("public.session_is_bound_to_organization(p_organization_id)") &&
    migration.includes("revoke all on function public.get_home_v1_pipeline_snapshot(uuid)") &&
    migration.includes("revoke all on function public.get_home_v1_qualification_snapshot(uuid,timestamptz,timestamptz)"),
  "New metrics RPCs must enforce privileged organization access with explicit grants.",
);
expect(
  home.includes("pipelineTruth.missingValueCount + pipelineTruth.missingCurrencyCount") &&
    !home.includes("unvaluedOpenLeads") &&
    home.includes("unvaluedCurrentOpen != null && unvaluedCurrentOpen > 0"),
  "Home valuation attention must use the eligible pipeline snapshot, not legacy counts.",
);

if (failures.length) {
  console.error("Home V1 Phase 2 contracts failed:");
  for (const failure of failures) console.error("- " + failure);
  process.exit(1);
}
console.log("Home V1 Phase 2 source and SQL contracts passed.");
