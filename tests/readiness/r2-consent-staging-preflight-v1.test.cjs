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
  SALSYS_STAGING_SUPABASE_URL: "https://stageproject.supabase.co",
  SALSYS_PRODUCTION_SUPABASE_URL: "https://productionproject.supabase.co",
  SALSYS_RECOVERY_SUPABASE_URL: "https://recoveryproject.supabase.co",
  SALSYS_STAGING_SOURCE_HOSTNAME: "stage.academy-sandbox.net",
  SALSYS_STAGING_SOURCE_STATUS: "active",
  SALSYS_STAGING_SOURCE_ENVIRONMENT: "staging",
  SALSYS_STAGING_CONSENT_MODE: "required",
  SALSYS_STAGING_FORM_CAPTURE_ISOLATED: "yes",
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
  for (const website of ["https://yogakulam.com","https://www.yogakulamacademy.com"]) {
    const result = verify({ ...good, SALSYS_STAGING_SITE_ORIGIN: website });
    assert.equal(result.readyForManualTesting, false);
    assert.ok(result.errors.some((error) => error.includes("production")));
  }
  const crm = verify({ ...good, SALSYS_STAGING_CRM_ORIGIN: "https://crm.salsysos.com" });
  assert.equal(crm.readyForManualTesting, false);
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

test("R2-P3 preflight does not embed credentials or perform network/database actions", () => {
  const source = fs.readFileSync(file,"utf8");
  assert.doesNotMatch(source, /\b(fetch|exec|spawn|writeFile|process\.env\.(?:PASSWORD|TOKEN|KEY))\s*\(/);
  const result = verify({ ...good,SALSYS_STAGING_SITE_ORIGIN:"https://secretuser:secretpass@stage.academy-sandbox.net" });
  assert.equal(result.readyForManualTesting,false);
  assert.doesNotMatch(JSON.stringify(result), /secretuser|secretpass/);
});
