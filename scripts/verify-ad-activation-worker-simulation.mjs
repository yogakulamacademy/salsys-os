import fs from "node:fs";
import path from "node:path";

const worker = fs.readFileSync(
  path.join(process.cwd(), "lib/ad-activation/worker-simulation.ts"),
  "utf8",
);
const dryRun = fs.readFileSync(
  path.join(process.cwd(), "lib/ad-activation/provider-dry-run.ts"),
  "utf8",
);

for (const token of [
  "runAdActivationWorkerSimulation",
  "claimDeliveries",
  "validateBeforeSend",
  "prepareAfterValidation",
  "executeAdActivationTransport",
  "assertAdActivationTransportDisabled",
  "provider_transport_disabled",
  "persisted: false",
  "finalizedPersistently: 0",
  'delivered: 0',
]) {
  if (!worker.includes(token)) {
    throw new Error(`activation worker simulation contract missing: ${token}`);
  }
}

for (const forbidden of [
  "claimAdActivationDeliveries",
  "finalizeAdActivationDelivery",
  "createAdminClient",
  "fetch(",
  "graph.facebook.com",
  "googleapis.com",
  "getMetaAccessTokenForConnection",
  "getGoogleAccessTokenForConnection",
]) {
  if (worker.includes(forbidden)) {
    throw new Error(`simulation worker must not bind live side effects: ${forbidden}`);
  }
}

for (const token of [
  "prepareAdActivationProviderDryRunAfterValidation",
  "AdActivationPreSendValidation",
  "connectionId: connection.id",
]) {
  if (!dryRun.includes(token)) {
    throw new Error(`dry-run staged preparation contract missing: ${token}`);
  }
}

console.log("Ad activation worker simulation contracts: PASS");
