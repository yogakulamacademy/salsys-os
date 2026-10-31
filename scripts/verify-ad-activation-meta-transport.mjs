import fs from "node:fs";

const source = fs.readFileSync(
  "lib/ad-activation/providers/meta-transport.ts",
  "utf8",
);

for (const token of [
  'provider: "meta"',
  "getMetaAccessTokenForConnection",
  "metaGraphVersion",
  "https://graph.facebook.com/",
  'Authorization: `Bearer ${accessToken}`',
  '"Content-Type": "application/json"',
  "JSON.stringify(operation.body)",
  "classifyAdActivationProviderError",
  'response.headers.get("x-fb-request-id")',
  'providerResponseCode: "meta_custom_audience_success"',
]) {
  if (!source.includes(token)) {
    throw new Error(`Meta activation transport contract missing: ${token}`);
  }
}

for (const forbidden of [
  "console.log",
  "console.error",
  "console.warn",
  "access_token=",
  "response.text()",
  "JSON.stringify(payload)",
  "provider body",
]) {
  if (source.includes(forbidden)) {
    throw new Error(`Meta activation transport contains forbidden token: ${forbidden}`);
  }
}

const policy = fs.readFileSync(
  "lib/ad-activation/transport-policy.ts",
  "utf8",
);

if (!policy.includes("AD_ACTIVATION_TRANSPORT_ENABLED = false as const")) {
  throw new Error("Phase 7D.1 must not enable provider transport.");
}

const boundary = fs.readFileSync(
  "lib/ad-activation/provider-transport-boundary.ts",
  "utf8",
);

if (!boundary.includes('reason: "provider_transport_disabled"')) {
  throw new Error("Transport boundary must remain hard-disabled in Phase 7D.1.");
}

console.log("Ad activation Meta transport contracts: PASS");
