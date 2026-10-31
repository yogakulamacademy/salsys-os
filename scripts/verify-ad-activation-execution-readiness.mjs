import fs from "node:fs";

const source = fs.readFileSync("lib/ad-activation/execution-readiness.ts", "utf8");

for (const token of [
  "assessAdActivationProviderReadiness",
  "assessAdActivationCredentialReadiness",
  'privacyPreSendValidation: "required"',
  'providerPayloadPreparation: "requires_leased_pre_send_validation"',
  "structuralReady",
  "authorizedToSend: false",
  "transportEnabled: false",
  "leased_pre_send_validation_required",
  "provider_transport_disabled",
]) {
  if (!source.includes(token)) {
    throw new Error(`execution readiness contract missing: ${token}`);
  }
}

for (const forbidden of [
  "claimAdActivationDeliveries",
  "validateAdActivationDeliveryBeforeSend",
  "prepareAdActivationProviderDryRun",
  "resolveHashedAdActivationIdentifiers",
  "finalizeAdActivationDelivery",
  "decryptIntegrationSecret",
  "getMetaAccessTokenForConnection",
  "getGoogleAccessTokenForConnection",
  "fetch(",
  "axios",
  "graph.facebook.com",
  "datamanager.googleapis.com",
]) {
  if (source.includes(forbidden)) {
    throw new Error(`execution readiness must remain non-mutating/non-transport: ${forbidden}`);
  }
}

console.log("Ad activation execution readiness contracts: PASS");
