import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const migrationDir = path.join(root, "supabase/migrations");
const migration = fs.readdirSync(migrationDir)
  .filter((name) => name.endsWith("_ad_activation_delivery_finalize.sql"))
  .sort()
  .map((name) => fs.readFileSync(path.join(migrationDir, name), "utf8"))
  .join("\n");
const queue = fs.readFileSync(
  path.join(root, "lib/ad-activation/delivery-queue.ts"),
  "utf8",
);

for (const token of [
  "finalize_ad_activation_delivery_v1",
  "ad_activation_attempts",
  "on conflict (outbox_id, attempt_number) do nothing",
  "max_attempts_exhausted",
  "[redacted-email]",
  "[redacted-phone]",
  "request_metadata",
  "response_metadata",
  "'{}'::jsonb",
  "to service_role",
]) {
  if (!migration.toLowerCase().includes(token.toLowerCase())) {
    throw new Error(`activation finalizer missing: ${token}`);
  }
}

if (migration.includes("p_response_metadata") || migration.includes("p_request_metadata")) {
  throw new Error("finalizer must not accept arbitrary provider request/response metadata");
}

for (const token of [
  "finalizeAdActivationDelivery",
  "AdActivationProviderResult",
  "finalize_ad_activation_delivery_v1",
  "provider_skipped",
]) {
  if (!queue.includes(token)) {
    throw new Error(`activation finalizer wrapper missing: ${token}`);
  }
}

console.log("Ad activation delivery finalization contracts: PASS");
