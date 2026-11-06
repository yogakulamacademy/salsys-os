#!/usr/bin/env node
// R2-P3 safe staging preflight: configuration assertions only, no network,
// database writes, live tracking calls, secrets, or customer data.
import { pathToFileURL } from "node:url";

const prohibitedHosts = new Set([
  "yogakulam.com", "www.yogakulam.com",
  "yogakulamacademy.com", "www.yogakulamacademy.com",
  "salsysos.com", "www.salsysos.com", "crm.salsysos.com",
  "salsys-os.vercel.app", "salsys-os-salsysos.vercel.app",
  "salsys-os-git-main-salsysos.vercel.app",
]);

function origin(input, label, problems) {
  let url;
  try { url = new URL(String(input || "")); }
  catch { problems.push(label + ": a full HTTPS origin is required"); return null; }
  if (url.protocol !== "https:" || url.username || url.password ||
      url.search || url.hash || url.pathname !== "/") {
    problems.push(label + ": use only a bare HTTPS origin, without credentials, path or query");
    return null;
  }
  const host = url.hostname.toLowerCase();
  if (prohibitedHosts.has(host) || host === "localhost" ||
      host.endsWith(".localhost") || host.endsWith(".test") ||
      host.endsWith(".invalid") || host.endsWith(".example")) {
    problems.push(label + ": production or non-routable origin is not accepted");
  }
  return url.origin;
}

export function verifyR2StagingConfig(values = {}) {
  const errors = [];
  const site = origin(values.SALSYS_STAGING_SITE_ORIGIN, "Staging website", errors);
  const crm = origin(values.SALSYS_STAGING_CRM_ORIGIN, "Staging CRM API", errors);
  const db = origin(values.SALSYS_STAGING_SUPABASE_URL, "Staging Supabase", errors);
  const prodDb = origin(values.SALSYS_PRODUCTION_SUPABASE_URL, "Production Supabase comparison", errors);

  if (site && crm && site === crm) {
    errors.push("Website and CRM API must be separately identified staging origins");
  }
  if (db && prodDb && db === prodDb) {
    errors.push("Staging and production Supabase URLs are identical");
  }
  if (String(values.SALSYS_STAGING_SOURCE_HOSTNAME || "").toLowerCase() !==
      (site ? new URL(site).hostname : "<missing>")) {
    errors.push("Staging source hostname must exactly match the approved staging website hostname");
  }
  if (values.SALSYS_STAGING_SOURCE_STATUS !== "active") {
    errors.push("Staging source must be verified active by an authorized operator");
  }
  if (values.SALSYS_STAGING_SOURCE_ENVIRONMENT !== "staging") {
    errors.push("Staging source must be registered with environment=staging");
  }
  if (values.SALSYS_STAGING_CONSENT_MODE !== "required") {
    errors.push("Consent mode must be required, never implied-granted");
  }
  if (values.SALSYS_STAGING_FORM_CAPTURE_ISOLATED !== "yes") {
    errors.push("Staging form capture must be verified isolated from live leads/payments/messaging");
  }
  if (values.SALSYS_STAGING_OWNER_APPROVED !== "yes") {
    errors.push("Explicit staging owner authorization must be recorded");
  }
  const branchSha = String(values.SALSYS_STAGING_EXPECTED_COMMIT || "").toLowerCase();
  const deployedSha = String(values.SALSYS_STAGING_DEPLOYED_COMMIT || "").toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(branchSha) || branchSha !== deployedSha) {
    errors.push("The protected staging deployment must match the reviewed 40-character PR commit");
  }
  return {
    readyForManualTesting: errors.length === 0,
    errors,
    note: "Configuration preflight only; separate real-browser consent/CMP and exact-session lead-handoff acceptance are still required.",
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = verifyR2StagingConfig(process.env);
  // Deliberately omit any passed URLs, project identifiers, credentials or cookies.
  if (result.readyForManualTesting) {
    console.log("R2-P3 staging config preflight: PASS (not real-browser acceptance).");
    console.log(result.note);
  } else {
    console.error("R2-P3 staging config preflight: BLOCKED.");
    for (const reason of result.errors) console.error(" - " + reason);
  }
  process.exitCode = result.readyForManualTesting ? 0 : 1;
}
