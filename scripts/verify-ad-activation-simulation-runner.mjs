import fs from "node:fs";

const source = fs.readFileSync("lib/ad-activation/simulation-runner.ts", "utf8");

for (const token of [
  "runConfiguredAdActivationSimulation",
  "resolveAdActivationSimulationConfig",
  "AdActivationSimulationTelemetry",
  "AdActivationSimulationTelemetrySink",
  "assertAdActivationTransportDisabled",
  'transportEnabled: false',
  'persistentFinalization: false',
  'liveBindings: "absent"',
  "MAX_LIMIT = 50",
  "MIN_LEASE_SECONDS = 30",
  "MAX_LEASE_SECONDS = 300",
  "validationRejected",
  "preparationSkipped",
  "transportBlocked",
  "transportNonDelivery",
  "finalizedPersistently: 0",
  "delivered: 0",
]) {
  if (!source.includes(token)) {
    throw new Error(`activation simulation runner contract missing: ${token}`);
  }
}

for (const forbidden of [
  "claimAdActivationDeliveries",
  "validateAdActivationDeliveryBeforeSend",
  "prepareAdActivationProviderDryRunAfterValidation",
  "finalizeAdActivationDelivery",
  "createAdminClient",
  "decryptIntegrationSecret",
  "getMetaAccessTokenForConnection",
  "getGoogleAccessTokenForConnection",
  "fetch(",
  "graph.facebook.com",
  "googleapis.com",
  "process.env",
  "cron",
]) {
  if (source.includes(forbidden)) {
    throw new Error(`configured simulation runner must remain side-effect isolated: ${forbidden}`);
  }
}

console.log("Ad activation configured simulation/telemetry contracts: PASS");
