import fs from "node:fs";

const controls = fs.readFileSync("lib/ad-activation/runner-controls.ts", "utf8");
const runner = fs.readFileSync("lib/ad-activation/execution-runner.ts", "utf8");
const queue = fs.readFileSync("lib/ad-activation/provider-queue.ts", "utf8");
const health = fs.readFileSync("app/api/ad-activation/meta/health/route.ts", "utf8");
const migration = fs.readFileSync(
  "supabase/migrations/20261031071500_ad_activation_canary_claim.sql",
  "utf8",
);
const policy = fs.readFileSync("lib/ad-activation/transport-policy.ts", "utf8");

for (const [source, tokens, label] of [
  [controls, [
    "AD_ACTIVATION_CANARY_DESTINATION_ID",
    "AD_ACTIVATION_CANARY_PERSON_ID",
    "getAdActivationCanaryScope",
  ], "canary controls"],
  [runner, [
    "getAdActivationCanaryScope",
    'canary_scope_not_configured',
    "claimAdActivationCanaryDelivery",
    "destinationId: canaryScope.destinationId",
    "personId: canaryScope.personId",
    "summary.claimed = 1",
  ], "canary runner"],
  [queue, [
    "claimAdActivationCanaryDelivery",
    '"claim_ad_activation_canary_delivery_v1"',
    "p_destination_id: input.destinationId",
    "p_person_id: input.personId",
  ], "canary queue"],
  [health, [
    "canaryConfigured",
    'mode: "canary_only"',
  ], "canary health"],
  [migration, [
    "claim_ad_activation_canary_delivery_v1",
    "q.destination_id = p_destination_id",
    "q.person_id = p_person_id",
    "and ic.provider = v_provider",
    "limit 1",
    "to service_role",
  ], "canary migration"],
]) {
  for (const token of tokens) {
    if (!source.includes(token)) {
      throw new Error(`${label} contract missing: ${token}`);
    }
  }
}

if (runner.includes("claimAdActivationDeliveriesForProvider")) {
  throw new Error("Phase 7D.4 runner must not expose a broad provider queue claim path.");
}

const transportGuard = runner.indexOf("if (AD_ACTIVATION_TRANSPORT_ENABLED === false)");
const canaryClaim = runner.indexOf("const delivery = await claimAdActivationCanaryDelivery");
if (transportGuard < 0 || canaryClaim < 0 || transportGuard > canaryClaim) {
  throw new Error("Transport-disabled guard must precede the canary queue claim.");
}

const scopeGuard = runner.indexOf("if (!canaryScope)");
if (scopeGuard < 0 || scopeGuard > canaryClaim) {
  throw new Error("Canary scope must be validated before any canary queue claim.");
}

if (!policy.includes("AD_ACTIVATION_TRANSPORT_ENABLED = false as const")) {
  throw new Error("Phase 7D.4 must not enable provider transport.");
}

console.log("Ad activation canary boundary contracts: PASS");
