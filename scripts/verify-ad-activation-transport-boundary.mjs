import fs from "node:fs";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function requireText(source, expected, label) {
  if (!source.includes(expected)) throw new Error(`Missing ${label}: ${expected}`);
}

const policy = read("lib/ad-activation/transport-policy.ts");
const credential = read("lib/ad-activation/credential-boundary.ts");
const boundary = read("lib/ad-activation/provider-transport-boundary.ts");
const errors = read("lib/ad-activation/provider-errors.ts");

requireText(policy, "AD_ACTIVATION_TRANSPORT_ENABLED = false as const", "compile-time transport-off policy");
requireText(boundary, 'reason: "provider_transport_disabled"', "transport-disabled result");
requireText(boundary, "if (AD_ACTIVATION_TRANSPORT_ENABLED === false)", "pre-adapter hard guard");
requireText(credential, "credentialConfigured", "credential readiness without secret return");
requireText(credential, "transportEnabled: false", "credential readiness transport state");
requireText(errors, 'status === 429', "rate-limit classification");
requireText(errors, "status >= 500", "5xx retry classification");

for (const [name, source] of [["credential boundary", credential], ["transport boundary", boundary]]) {
  if (/decryptIntegrationSecret|getMetaAccessTokenForConnection|getGoogleAccessTokenForConnection/.test(source)) {
    throw new Error(`${name} must not decrypt/load provider credentials in Phase 7C.`);
  }
}

if (/fetch\s*\(|axios|graph\.facebook\.com|datamanager\.googleapis\.com/.test(boundary)) {
  throw new Error("Transport boundary must not contain provider network transport in Phase 7C.");
}

console.log("Ad activation credential/transport boundary contracts: PASS");
