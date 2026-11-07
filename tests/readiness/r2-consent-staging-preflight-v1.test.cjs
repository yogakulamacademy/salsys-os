const { test } = require("node:test");
const assert = require("node:assert/strict");
const { pathToFileURL } = require("node:url");
const path = require("node:path");
const fs = require("node:fs");

const file = path.join(__dirname, "../../scripts/r2-consent-staging-preflight.mjs");
const reviewedSha = "c".repeat(40);
const good = {
  SALSYS_STAGING_SITE_ORIGIN: "https://stage.academy-sandbox.net",
  SALSYS_STAGING_CRM_ORIGIN: "https://stage-crm.salsys-sandbox.net",
  SALSYS_STAGING_CRM_PROJECT_ID: "prj_AAAAAAAAAAAAAAAAAAAAAAAA",
  SALSYS_PRODUCTION_CRM_PROJECT_ID: "prj_BBBBBBBBBBBBBBBBBBBBBBBB",
  SALSYS_STAGING_SUPABASE_URL: "https://stageproject.supabase.co",
  SALSYS_PRODUCTION_SUPABASE_URL: "https://productionproject.supabase.co",
  SALSYS_RECOVERY_SUPABASE_URL: "https://recoveryproject.supabase.co",
  SALSYS_STAGING_SOURCE_HOSTNAME: "stage.academy-sandbox.net",
  SALSYS_STAGING_SOURCE_STATUS: "active",
  SALSYS_STAGING_SOURCE_ENVIRONMENT: "staging",
  SALSYS_STAGING_CONSENT_MODE: "required",
  SALSYS_STAGING_FORM_CAPTURE_ISOLATED: "yes",
  SALSYS_STAGING_EXTERNAL_EFFECTS_DISABLED: "yes",
  SALSYS_STAGING_SCHEDULED_JOBS_DISABLED: "yes",
  SALSYS_STAGING_OWNER_APPROVED: "yes",
  SALSYS_STAGING_EXPECTED_COMMIT: reviewedSha,
  SALSYS_STAGING_DEPLOYED_COMMIT: reviewedSha,
};

let verify;
test.before(async () => {
  ({ verifyR2StagingConfig: verify } = await import(pathToFileURL(file).href));
});

test("R2-P3 staging preflight permits only fully specified isolated test environments", () => {
  const result = verify(good);
  assert.equal(result.readyForManualTesting, true, result.errors.join("; "));
  assert.match(result.note, /not real-browser acceptance|real-browser consent/i);
});

test("R2-P3 rejects live academy and CRM origins", () => {
  for (const website of [
    "https://yogakulam.com",
    "https://www.yogakulamacademy.com",
    "https://stage.yogakulam.com",
    "https://test.yogakulamacademy.com",
  ]) {
    const result = verify({ ...good, SALSYS_STAGING_SITE_ORIGIN: website });
    assert.equal(result.readyForManualTesting, false);
    assert.ok(result.errors.some((error) => error.includes("production")));
  }
  for (const crmOrigin of ["https://crm.salsysos.com", "https://stage.salsysos.com"]) {
    const crm = verify({ ...good, SALSYS_STAGING_CRM_ORIGIN: crmOrigin });
    assert.equal(crm.readyForManualTesting, false);
    assert.ok(crm.errors.some((error) => error.includes("production")));
  }
});

test("R2-P3 blocks preview deployments wired to the production Supabase project", () => {
  const result = verify({ ...good,
    SALSYS_STAGING_SUPABASE_URL: good.SALSYS_PRODUCTION_SUPABASE_URL,
  });
  assert.equal(result.readyForManualTesting, false);
  assert.ok(result.errors.some((error) => error.includes("identical")));
});

test("R2-P3 refuses the recovery rehearsal database and missing recovery comparison", () => {
  const reusedRecovery = verify({ ...good,
    SALSYS_STAGING_SUPABASE_URL: good.SALSYS_RECOVERY_SUPABASE_URL,
  });
  assert.equal(reusedRecovery.readyForManualTesting, false);
  assert.ok(reusedRecovery.errors.some((error) => error.includes("recovery rehearsal")));

  const missingComparison = { ...good };
  delete missingComparison.SALSYS_RECOVERY_SUPABASE_URL;
  assert.equal(verify(missingComparison).readyForManualTesting, false);
});

test("R2-P3 requires authorized staging source, required-consent mode and isolated form capture", () => {
  for (const [key, value] of [
    ["SALSYS_STAGING_SOURCE_STATUS","revoked"],
    ["SALSYS_STAGING_SOURCE_ENVIRONMENT","production"],
    ["SALSYS_STAGING_CONSENT_MODE","granted"],
    ["SALSYS_STAGING_FORM_CAPTURE_ISOLATED","no"],
    ["SALSYS_STAGING_OWNER_APPROVED","no"],
    ["SALSYS_STAGING_SOURCE_HOSTNAME","yogakulam.com"],
  ]) {
    assert.equal(verify({ ...good, [key]:value }).readyForManualTesting,false,key);
  }
});

test("R2-P3 refuses production CRM preview reuse and missing project identity", () => {
  const reused = verify({ ...good,
    SALSYS_STAGING_CRM_PROJECT_ID: good.SALSYS_PRODUCTION_CRM_PROJECT_ID,
  });
  assert.equal(reused.readyForManualTesting, false);
  assert.ok(reused.errors.some((error) => error.includes("different")));

  for (const field of ["SALSYS_STAGING_CRM_PROJECT_ID", "SALSYS_PRODUCTION_CRM_PROJECT_ID"]) {
    const missing = { ...good };
    delete missing[field];
    assert.equal(verify(missing).readyForManualTesting, false, field);
  }
});

test("R2-P3 requires affirmative no-send and no-scheduler attestations", () => {
  for (const field of ["SALSYS_STAGING_EXTERNAL_EFFECTS_DISABLED",
                       "SALSYS_STAGING_SCHEDULED_JOBS_DISABLED"]) {
    for (const value of ["no", "", undefined]) {
      const result = verify({ ...good, [field]: value });
      assert.equal(result.readyForManualTesting, false, field + ":" + value);
    }
  }
});

test("R2-P3 demands exact reviewed deployment SHA", () => {
  assert.equal(verify({ ...good,SALSYS_STAGING_DEPLOYED_COMMIT:"f".repeat(40) }).readyForManualTesting,false);
  assert.equal(verify({ ...good,SALSYS_STAGING_EXPECTED_COMMIT:"main" }).readyForManualTesting,false);
});

test("R2-P3 treats localhost, non-HTTPS, embedded credentials and missing values as blocked", () => {
  for (const site of [
    "http://stage.academy-sandbox.net",
    "http://localhost:3000",
    "https://staging.example.test",
    "https://person:pass@stage.academy-sandbox.net",
    "https://stage.academy-sandbox.net/courses",
  ]) {
    assert.equal(verify({ ...good,SALSYS_STAGING_SITE_ORIGIN:site }).readyForManualTesting,false,site);
  }
  assert.equal(verify({}).readyForManualTesting,false);
});

test("R2-P3 rejects IP literals, private-network and loopback HTTPS staging endpoints", () => {
  for (const address of [
    "https://127.0.0.1", "https://0.0.0.0", "https://10.12.0.2",
    "https://192.168.1.12", "https://172.16.0.3", "https://169.254.169.254",
    "https://[::1]", "https://[::ffff:127.0.0.1]",
    "https://localhost.", "https://test.internal", "https://dev.local",
    "https://stage.home.arpa", "https://stage.lan", "https://stage.onion",
  ]) {
    const site = verify({ ...good, SALSYS_STAGING_SITE_ORIGIN: address });
    assert.equal(site.readyForManualTesting, false, "unsafe website origin: " + address);
    assert.ok(site.errors.some((e) => e.includes("non-routable") || e.includes("HTTPS")));
    const db = verify({ ...good, SALSYS_STAGING_SUPABASE_URL: address });
    assert.equal(db.readyForManualTesting, false, "unsafe DB origin: " + address);
  }
});

test("R2-P3 rejects trailing-dot production aliases and nonstandard HTTPS ports", () => {
  for (const address of [
    "https://yogakulam.com.", "https://stage.yogakulam.com.",
    "https://crm.salsysos.com.", "https://salsys-os.vercel.app.",
    "https://stage.academy-sandbox.net.:8443",
    "https://stage.academy-sandbox.net:8443",
  ]) {
    const result = verify({ ...good, SALSYS_STAGING_SITE_ORIGIN: address });
    assert.equal(result.readyForManualTesting, false, address);
  }
});

test("R2-P3 rejects dynamic production CRM Vercel deployment and preview aliases", () => {
  // A production Vercel project has many generated URLs, not just its stable
  // crm.salsysos.com domain. Distinct *declared* project IDs alone do not
  // establish that the supplied hostname belongs to the staging project.
  for (const alias of [
    "https://salsys-bwrit5cap-salsysos.vercel.app",
    "https://salsys-e6z2z0hba-salsysos.vercel.app",
    "https://salsys-os-git-feature-x-salsysos.vercel.app",
    "https://salsys-os-git-main-salsysos.vercel.app",
  ]) {
    for (const field of ["SALSYS_STAGING_SITE_ORIGIN", "SALSYS_STAGING_CRM_ORIGIN",
      "SALSYS_STAGING_SUPABASE_URL"]) {
      const result = verify({ ...good, [field]: alias });
      assert.equal(result.readyForManualTesting, false, field + ": " + alias);
      assert.ok(result.errors.some((error) =>
        error.includes("production or non-routable")), field);
    }
  }
});

test("R2-P3 rejects reserved example domains, including their subdomains", () => {
  for (const reserved of [
    "https://example.com", "https://demo.example.com",
    "https://example.net", "https://preview.example.net",
    "https://example.org", "https://a.example.org",
  ]) {
    for (const field of ["SALSYS_STAGING_SITE_ORIGIN", "SALSYS_STAGING_CRM_ORIGIN",
      "SALSYS_STAGING_SUPABASE_URL"]) {
      const result = verify({ ...good, [field]: reserved });
      assert.equal(result.readyForManualTesting, false, field + ": " + reserved);
    }
  }
  // The fully fake fixture proves only that declaration-format checks work.
  // It is not evidence that a real staging domain is owned or isolated.
  assert.equal(verify(good).readyForManualTesting, true);
});

test("R2-P3 keeps staging website, CRM and Supabase on distinct named origins", () => {
  const sharedWebsite = verify({
    ...good, SALSYS_STAGING_CRM_ORIGIN: good.SALSYS_STAGING_SITE_ORIGIN,
  });
  assert.equal(sharedWebsite.readyForManualTesting, false);
  assert.ok(sharedWebsite.errors.some((e) => e.includes("different staging hostnames")));
  const sharedDb = verify({
    ...good, SALSYS_STAGING_SUPABASE_URL: good.SALSYS_STAGING_CRM_ORIGIN,
  });
  assert.equal(sharedDb.readyForManualTesting, false);
  assert.ok(sharedDb.errors.some((e) => e.includes("distinct")));
  const healthy = verify(good);
  assert.equal(healthy.readyForManualTesting, true);
});

test("R2-P3 preflight does not embed credentials or perform network/database actions", () => {
  const source = fs.readFileSync(file,"utf8");
  assert.doesNotMatch(source, /\b(fetch|exec|spawn|writeFile|process\.env\.(?:PASSWORD|TOKEN|KEY))\s*\(/);
  const result = verify({ ...good,SALSYS_STAGING_SITE_ORIGIN:"https://secretuser:secretpass@stage.academy-sandbox.net" });
  assert.equal(result.readyForManualTesting,false);
  assert.doesNotMatch(JSON.stringify(result), /secretuser|secretpass/);
});
