#!/usr/bin/env node
// R2-P3 safe staging preflight: configuration assertions only, no network,
// database writes, live tracking calls, secrets, or customer data.
import { pathToFileURL } from "node:url";

const prohibitedRoots = [
  // Also reject descendants: subdomains of live websites or CRM can share cookies
  // or be accidentally wired to the same customer-facing integrations.
  "yogakulam.com", "yogakulamacademy.com", "salsysos.com",
];
const prohibitedHosts = new Set([
  "salsys-os.vercel.app", "salsys-os-salsysos.vercel.app",
  "salsys-os-git-main-salsysos.vercel.app",
]);

function publiclyNamedHost(host) {
  // Configuration-only check: reject local, intranet and IP literals before
  // allowing a staging origin. A real owner must separately verify DNS/TLS,
  // domain control and that the deployment cannot reach production services.
  if (!host || host.endsWith(".") || host.startsWith("[") ||
      host.includes(":") || /^\\d+(?:\\.\\d+){3}$/.test(host)) return false;
  if (host.length > 253 || host.split(".").length < 2 ||
      host.split(".").some((part) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(part))) return false;
  var blockedSuffixes = [
    "localhost", "local", "internal", "lan", "home", "home.arpa",
    "test", "invalid", "example", "onion"
  ];
  if (blockedSuffixes.some((suffix) => host === suffix || host.endsWith("." + suffix))) return false;
  return true;
}

function origin(input, label, problems) {
  let url;
  try { url = new URL(String(input || "")); }
  catch { problems.push(label + ": a full HTTPS origin is required"); return null; }
  if (url.protocol !== "https:" || url.username || url.password ||
      url.search || url.hash || url.pathname !== "/" || url.port) {
    problems.push(label + ": use only a bare HTTPS origin, without credentials, nonstandard port, path or query");
    return null;
  }
  const host = url.hostname.toLowerCase();
  if (!publiclyNamedHost(host) || prohibitedHosts.has(host) ||
      prohibitedRoots.some((root) => host === root || host.endsWith("." + root))) {
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
  const recoveryDb = origin(values.SALSYS_RECOVERY_SUPABASE_URL, "Recovery rehearsal Supabase comparison", errors);

  if (site && crm && new URL(site).hostname === new URL(crm).hostname) {
    errors.push("Website and CRM API must use different staging hostnames");
  }
  if (db && ((site && new URL(db).hostname === new URL(site).hostname) ||
             (crm && new URL(db).hostname === new URL(crm).hostname))) {
    errors.push("Staging Supabase must use a hostname distinct from staging website and CRM");
  }
  const stagingProject = String(values.SALSYS_STAGING_CRM_PROJECT_ID || "").trim();
  const productionProject = String(values.SALSYS_PRODUCTION_CRM_PROJECT_ID || "").trim();
  // A default Preview in the production project inherits unverified credentials.
  // Requiring a distinct Vercel project blocks accepting that preview as staging.
  if (!/^prj_[A-Za-z0-9]{16,}$/.test(stagingProject) ||
      !/^prj_[A-Za-z0-9]{16,}$/.test(productionProject) ||
      stagingProject === productionProject) {
    errors.push("Staging CRM must use a different, explicitly identified Vercel project than production");
  }
  if (db && prodDb && db === prodDb) {
    errors.push("Staging and production Supabase URLs are identical");
  }
  if (db && recoveryDb && db === recoveryDb) {
    errors.push("Staging and recovery rehearsal Supabase URLs are identical");
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
  if (values.SALSYS_STAGING_EXTERNAL_EFFECTS_DISABLED !== "yes") {
    errors.push("Staging must block customer email, messaging, ads and payment side effects");
  }
  if (values.SALSYS_STAGING_SCHEDULED_JOBS_DISABLED !== "yes") {
    errors.push("Staging scheduler, cron and queue consumers must be disabled");
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
