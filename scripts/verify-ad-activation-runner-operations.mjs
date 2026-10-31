import fs from "node:fs";

const controls = fs.readFileSync("lib/ad-activation/runner-controls.ts", "utf8");
const runner = fs.readFileSync("lib/ad-activation/execution-runner.ts", "utf8");
const trigger = fs.readFileSync("app/api/ad-activation/meta/runner/route.ts", "utf8");
const health = fs.readFileSync("app/api/ad-activation/meta/health/route.ts", "utf8");
const migration = fs.readFileSync("supabase/migrations/20261031070000_ad_activation_runner_controls.sql", "utf8");
const vercel = fs.readFileSync("vercel.json", "utf8");
const policy = fs.readFileSync("lib/ad-activation/transport-policy.ts", "utf8");

for (const [source, tokens, label] of [
  [controls, [
    "AD_ACTIVATION_RUNNER_ENABLED",
    '=== "true"',
    "acquire_ad_activation_runner_lease_v1",
    "release_ad_activation_runner_lease_v1",
  ], "runner controls"],
  [runner, [
    "isAdActivationRunnerEnabled",
    "acquireAdActivationRunnerLease",
    "releaseAdActivationRunnerLease",
    'emptySummary("busy"',
    "runnerLeaseSeconds",
  ], "execution runner"],
  [trigger, [
    "AD_ACTIVATION_RUNNER_SECRET",
    "CRON_SECRET",
    "bearerMatchesAnySecret",
    "runMetaAdActivationExecutionCycle",
    'limit: 10',
    '"Cache-Control": "no-store"',
  ], "runner route"],
  [health, [
    "v_ad_activation_runner_health_v1",
    "runnerEnabled",
    "transportEnabled",
    "bearerMatchesAnySecret",
  ], "health route"],
  [migration, [
    "ad_activation_runner_state",
    "acquire_ad_activation_runner_lease_v1",
    "release_ad_activation_runner_lease_v1",
    "for update",
    "runner_already_active",
    "v_ad_activation_runner_health_v1",
  ], "runner migration"],
  [vercel, [
    '"path": "/api/ad-activation/meta/runner"',
  ], "Vercel cron"],
]) {
  for (const token of tokens) {
    if (!source.includes(token)) {
      throw new Error(`${label} contract missing: ${token}`);
    }
  }
}

if (!policy.includes("AD_ACTIVATION_TRANSPORT_ENABLED = false as const")) {
  throw new Error("Phase 7D.3 must not enable provider transport.");
}

if (/console\.(log|error|warn)/.test(trigger + health + controls + runner)) {
  throw new Error("Activation operational controls must not log request/provider payloads.");
}

for (const forbidden of [
  "access_token",
  "email",
  "phone",
  "crm_notes",
  "message_content",
  "provider_response_body",
]) {
  if (migration.toLowerCase().includes(forbidden) && forbidden !== "provider_response_body") {
    throw new Error(`Runner state migration must remain aggregate-only: ${forbidden}`);
  }
}

console.log("Ad activation runner operational control contracts: PASS");
