import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(
  path.join(process.cwd(), "lib/ad-activation/provider-readiness.ts"),
  "utf8",
);

for (const token of [
  "ad_audience_destinations",
  "integration_connections",
  "destination_kind",
  "custom_audience",
  "customer_match",
  "customerMatchTermsAccepted",
  "google_operating_account_missing",
  "removeSpecificReady",
  "scopes",
  "ads_management",
  "meta_ads_management_scope_missing",
  "dryRunOnly: true",
  "transportEnabled: false",
]) {
  if (!source.includes(token)) {
    throw new Error(`activation provider readiness contract missing: ${token}`);
  }
}

for (const forbidden of [
  "person_identifiers",
  "normalized_value",
  "fetch(",
  "axios",
  "graph.facebook.com",
  "datamanager.googleapis.com",
  "SUPABASE_SERVICE_ROLE_KEY",
]) {
  if (source.includes(forbidden)) {
    throw new Error(`provider readiness must remain config-only: ${forbidden}`);
  }
}

console.log("Ad activation provider readiness contracts: PASS");
