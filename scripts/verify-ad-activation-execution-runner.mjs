import fs from "node:fs";

const runner = fs.readFileSync("lib/ad-activation/execution-runner.ts", "utf8");
const queue = fs.readFileSync("lib/ad-activation/provider-queue.ts", "utf8");
const migration = fs.readFileSync(
  "supabase/migrations/20261031064442_ad_activation_provider_filtered_claim_v2.sql",
  "utf8",
);
const policy = fs.readFileSync("lib/ad-activation/transport-policy.ts", "utf8");

for (const token of [
  "runMetaAdActivationExecutionCycle",
  "AD_ACTIVATION_TRANSPORT_ENABLED === false",
  "claimAdActivationCanaryDelivery",
  'provider: "meta"',
  "renewAdActivationDeliveryLease",
  "prepareAdActivationProviderDryRun",
  "executeAdActivationTransport",
  "metaCustomAudienceTransportAdapter",
  "finalizeAdActivationDelivery",
  'emptySummary("disabled"',
]) {
  if (!runner.includes(token)) {
    throw new Error(`execution runner contract missing: ${token}`);
  }
}

for (const token of [
  '"claim_ad_activation_deliveries_v2"',
  '"renew_ad_activation_delivery_lease_v1"',
  "p_provider: provider",
]) {
  if (!queue.includes(token)) {
    throw new Error(`provider queue contract missing: ${token}`);
  }
}

for (const token of [
  "create or replace function public.claim_ad_activation_deliveries_v2",
  "join public.integration_connections ic",
  "and ic.provider = v_provider",
  "and ic.status = 'connected'",
  "create or replace function public.renew_ad_activation_delivery_lease_v1",
  "and q.lease_token = p_lease_token",
  "and q.lease_expires_at > v_now",
  "to service_role",
]) {
  if (!migration.includes(token)) {
    throw new Error(`provider-scoped claim/lease contract missing: ${token}`);
  }
}

if (!policy.includes("AD_ACTIVATION_TRANSPORT_ENABLED = false as const")) {
  throw new Error("Phase 7D.2 must keep live provider transport disabled.");
}

const disabledGuard = runner.indexOf("if (AD_ACTIVATION_TRANSPORT_ENABLED === false)");
const claimCall = runner.indexOf("const delivery = await claimAdActivationCanaryDelivery");
if (disabledGuard < 0 || claimCall < 0 || disabledGuard > claimCall) {
  throw new Error("Transport-disabled guard must execute before any queue claim.");
}

for (const forbidden of [
  "console.log",
  "console.error",
  "META_ACCESS_TOKEN",
  "graph.facebook.com",
  "datamanager.googleapis.com",
]) {
  if (runner.includes(forbidden)) {
    throw new Error(`execution runner contains forbidden transport/secret token: ${forbidden}`);
  }
}

console.log("Ad activation execution runner contracts: PASS");
