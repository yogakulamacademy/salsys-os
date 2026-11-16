import fs from "node:fs";
import path from "node:path";

const read = (file) => fs.readFileSync(path.join(process.cwd(), file), "utf8");
const home = read("app/home/page.tsx");
const period = read("lib/dashboard-period-data.ts");
const source = read("lib/home-source-intelligence.ts");
const page = read("app/home/sources/page.tsx");
const sql = read("supabase/migrations/20261115103000_home_v1_historical_qualification_and_pipeline_v1.sql");
const failures = [];
const expect = (condition, label) => { if (!condition) failures.push(label); };

expect(period.includes("normalizeFirstTouchSource(row.first_touch_source)") &&
  period.includes("return [...grouped.entries()]") &&
  !period.includes(".slice(0, 5)"),
  "Normalize full acquisition cohort before source ranking, without dropping sources.");
expect(source.includes("cohortLeads") &&
  source.includes("historicalCount !== cohortLeads") &&
  source.includes("historicalQualified !== qualifiedTotal") &&
  source.includes("observedCount === cohortLeads"),
  "Source quality must reconcile historical milestone counts to the full cohort.");
expect(sql.includes("normalized_sources as (") &&
  sql.includes("when lower(btrim(s.source)) in (") &&
  sql.includes("group by s.source") &&
  !sql.includes("limit 25"),
  "The qualification RPC must normalize and aggregate all channels without top-N truncation.");
expect(home.includes("reconcileHomeSourceQualification(") &&
  home.includes("buildHomeSourceSignals(") &&
  home.includes("rows={validatedSourceQuality ? validatedSourceQuality.map(") &&
  home.includes(": null}") &&
  home.includes("sourceDetailHref"),
  "Home must show channel quality only when reconciled and route to scoped details.");
expect(page.includes("getDashboardPeriodAnalytics(query)") &&
  page.includes("getHomeV1MetricTruth(period)") &&
  page.includes("reconcileHomeSourceQualification(") &&
  page.includes("Recorded milestone rate") &&
  page.includes("Back to Home"),
  "The detailed source report must share the exact Home reporting period and milestone evidence.");
expect(page.includes("This is not a source-to-cash conversion report") &&
  page.includes("Source-attributed collections will remain unavailable"),
  "No unsupported source-to-cash attribution claims.");
expect(source.includes("not proof the leads were low quality"),
  "Keep the low-milestone diagnostic distinct from causal claims.");
if (failures.length) {
  console.error("Home source intelligence contracts failed:");
  for (const failure of failures) console.error("- " + failure);
  process.exit(1);
}
console.log("Home source intelligence source and cohort contracts passed.");
