import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const migrationDir = path.join(root, "supabase/migrations");
const migration = fs.readdirSync(migrationDir)
  .filter((name) => name.endsWith("_ad_activation_delivery_claim_validation.sql"))
  .sort()
  .map((name) => fs.readFileSync(path.join(migrationDir, name), "utf8"))
  .join("\n");
const queue = fs.readFileSync(
  path.join(root, "lib/ad-activation/delivery-queue.ts"),
  "utf8",
);

for (const token of [
  "claim_ad_activation_deliveries_v1",
  "validate_ad_activation_delivery_v1",
  "for update of q skip locked",
  "lease_expired_before_send",
  "destination_inactive",
  "membership_no_longer_active",
  "membership_no_longer_removed",
  "privacy_no_longer_eligible",
  "remove_current",
  "resolve_ad_activation_privacy_v1",
  "to service_role",
]) {
  if (!migration.toLowerCase().includes(token.toLowerCase())) {
    throw new Error(`activation delivery guard missing: ${token}`);
  }
}

if (!migration.includes("v_row.action = 'add' and not v_privacy_eligible")) {
  throw new Error("add deliveries must fail closed when privacy is no longer eligible");
}
if (!migration.includes("v_row.action = 'remove'")) {
  throw new Error("remove deliveries must remain explicitly supported");
}

for (const token of [
  "claimAdActivationDeliveries",
  "validateAdActivationDeliveryBeforeSend",
  "createAdminClient",
  "claim_ad_activation_deliveries_v1",
  "validate_ad_activation_delivery_v1",
]) {
  if (!queue.includes(token)) {
    throw new Error(`activation delivery queue wrapper missing: ${token}`);
  }
}

for (const forbidden of ["fetch(", "axios", "graph.facebook.com", "googleapis.com"]) {
  if (queue.includes(forbidden)) {
    throw new Error(`delivery guard must not call a provider: ${forbidden}`);
  }
}

console.log("Ad activation claim/pre-send validation contracts: PASS");
