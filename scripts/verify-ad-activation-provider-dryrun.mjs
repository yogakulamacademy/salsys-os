import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const resolver = read("lib/ad-activation/identifier-resolution.ts");
const meta = read("lib/ad-activation/providers/meta-custom-audience.ts");
const google = read("lib/ad-activation/providers/google-data-manager.ts");
const orchestrator = read("lib/ad-activation/provider-dry-run.ts");

for (const token of ["person_identifiers", "hashedActivationEmails", "hashedActivationPhones", "persons", "input.action === \"add\""]) {
  if (!resolver.includes(token)) throw new Error(`identifier resolver missing: ${token}`);
}
for (const token of ["EMAIL_SHA256", "PHONE_SHA256", "DELETE", "/users", "assertSha256Hex"]) {
  if (!meta.includes(token)) throw new Error(`Meta dry-run contract missing: ${token}`);
}
for (const token of ["IngestAudienceMembers", "RemoveAudienceMembers", "validateOnly: true", "encoding: \"HEX\"", "CONSENT_GRANTED", "customerMatchTermsOfServiceStatus", "assertSha256Hex"]) {
  if (!google.includes(token)) throw new Error(`Google Data Manager dry-run contract missing: ${token}`);
}
for (const token of ["validateAdActivationDeliveryBeforeSend", "ad_audience_destinations", "integration_connections", "resolveHashedAdActivationIdentifiers", "unsupported_provider"]) {
  if (!orchestrator.includes(token)) throw new Error(`provider dry-run orchestrator missing: ${token}`);
}
for (const source of [resolver, meta, google, orchestrator]) {
  for (const forbidden of ["fetch(", "axios", "graph.facebook.com", "datamanager.googleapis.com"]) {
    if (source.includes(forbidden)) throw new Error(`dry-run code must not perform provider transport: ${forbidden}`);
  }
}
if (/console\.(log|info|debug|warn)\(/.test(resolver)) {
  throw new Error("identifier resolver must not log raw identifier material");
}

console.log("Ad activation provider dry-run contracts: PASS");
