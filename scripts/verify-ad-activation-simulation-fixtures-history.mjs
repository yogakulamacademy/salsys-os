import fs from "node:fs";

const fixtures = fs.readFileSync("lib/ad-activation/simulation-fixtures.ts", "utf8");
const history = fs.readFileSync("lib/ad-activation/simulation-run-history.ts", "utf8");

for (const token of [
  "AD_ACTIVATION_SIMULATION_FIXTURES",
  "createAdActivationSimulationFixtureDependencies",
  '"meta_add_ready"',
  '"google_remove_ready"',
  '"privacy_rejected"',
  '"preparation_skipped"',
  '"fixture-org-001"',
  "buildMetaCustomAudienceDryRun",
  "buildGoogleDataManagerDryRun",
  'reason: "advertising_not_granted"',
  'reason: "no_exportable_identifiers"',
]) {
  if (!fixtures.includes(token)) {
    throw new Error(`simulation fixture contract missing: ${token}`);
  }
}

for (const forbidden of [
  "createAdminClient",
  "claimAdActivationDeliveries",
  "validateAdActivationDeliveryBeforeSend",
  "prepareAdActivationProviderDryRunAfterValidation",
  "finalizeAdActivationDelivery",
  "decryptIntegrationSecret",
  "fetch(",
  "graph.facebook.com",
  "googleapis.com",
  "process.env",
]) {
  if (fixtures.includes(forbidden)) {
    throw new Error(`simulation fixtures must remain deterministic and isolated: ${forbidden}`);
  }
}

for (const token of [
  "projectAdActivationSimulationRunHistory",
  'mode: "simulation_history"',
  "persistentStorage: false",
  'safetyInvariant: "transport_disabled_and_non_persistent"',
  "totalRunsObserved",
  "latestFinishedAt",
  "transportEnabled === false",
  "persistentFinalization === false",
  'liveBindings === "absent"',
  "counts.delivered === 0",
  "counts.finalizedPersistently === 0",
  "boundedLimit",
]) {
  if (!history.includes(token)) {
    throw new Error(`simulation run-history contract missing: ${token}`);
  }
}

for (const forbidden of [
  "createAdminClient",
  "supabase",
  "fetch(",
  "process.env",
  "writeFile",
  "insert(",
  "update(",
]) {
  if (history.includes(forbidden)) {
    throw new Error(`simulation run-history projection must remain pure/non-persistent: ${forbidden}`);
  }
}

console.log("Ad activation deterministic fixtures/run-history contracts: PASS");

const scenarioExecutor = fs.readFileSync(
  "lib/ad-activation/simulation-scenario-executor.ts",
  "utf8",
);

for (const token of [
  "executeAdActivationSimulationScenarios",
  "runConfiguredAdActivationSimulation",
  "createAdActivationSimulationFixtureDependencies",
  "projectAdActivationSimulationRunHistory",
  '"meta_add_ready"',
  '"google_remove_ready"',
  '"privacy_rejected"',
  '"preparation_skipped"',
  'reason: "provider_transport_disabled"',
  'reason: "advertising_not_granted"',
  'reason: "no_exportable_identifiers"',
  "deliveredZero",
  "finalizedPersistentlyZero",
  "transportEnabled: false",
  "persistentFinalization: false",
  'liveBindings: "absent"',
]) {
  if (!scenarioExecutor.includes(token)) {
    throw new Error(`Scenario executor contract missing: ${token}`);
  }
}

for (const token of [
  "createAdminClient",
  "claimAdActivationDeliveries",
  "finalizeAdActivationDelivery",
  "decryptIntegrationSecret",
  "fetch(",
  "graph.facebook.com",
  "googleapis.com",
  "process.env",
]) {
  if (scenarioExecutor.includes(token)) {
    throw new Error(`Scenario executor must not bind live capability: ${token}`);
  }
}

console.log("Ad activation deterministic scenario executor contracts: PASS");
