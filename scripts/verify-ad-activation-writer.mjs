import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const migrationDir = path.join(root, "supabase/migrations");
const migration = fs.readdirSync(migrationDir)
  .filter((name) => name.endsWith("_ad_activation_membership_outbox_writer.sql"))
  .sort()
  .map((name) => fs.readFileSync(path.join(migrationDir, name), "utf8"))
  .join("\n");
const writer = fs.readFileSync(
  path.join(root, "lib/ad-activation/reconcile-crm-memberships.ts"),
  "utf8",
);

for (const token of [
  "reconcile_ad_activation_memberships_v1",
  "for update",
  "public.person_leads",
  "resolve_ad_activation_privacy_v1",
  "privacy_ineligible",
  "ad_audience_memberships",
  "ad_activation_outbox",
  "d.status = 'active'",
  "on conflict (organization_id, dedupe_key) do nothing",
  "superseded_membership_state",
  "grant execute on function public.reconcile_ad_activation_memberships_v1",
  "to service_role",
]) {
  if (!migration.toLowerCase().includes(token.toLowerCase())) {
    throw new Error(`activation writer migration contract missing: ${token}`);
  }
}

for (const sensitiveField of ["email", "phone", "message", "medical", "payment"]) {
  if (migration.includes(`${sensitiveField} text`)) {
    throw new Error(`activation writer must not persist raw ${sensitiveField} fields`);
  }
}

for (const token of [
  "deriveBuiltinAudienceMemberships",
  "sanitizeAdActivationMetadata",
  "createAdminClient",
  ".rpc(",
  "reconcile_ad_activation_memberships_v1",
]) {
  if (!writer.includes(token)) {
    throw new Error(`activation writer server contract missing: ${token}`);
  }
}

for (const forbidden of ["fetch(", "axios", "graph.facebook.com", "googleapis.com"]) {
  if (writer.includes(forbidden)) {
    throw new Error(`activation writer must not call an external provider: ${forbidden}`);
  }
}

console.log("Ad activation membership/outbox writer contracts: PASS");
