import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const migrationDir = path.join(root, "supabase/migrations");
const migration = fs.readdirSync(migrationDir)
  .filter((name) => /_ad_activation_.*\.sql$/.test(name))
  .sort()
  .map((name) => fs.readFileSync(path.join(migrationDir, name), "utf8"))
  .join("\n");
const privacy = fs.readFileSync(path.join(root, "lib/ad-activation/privacy.ts"), "utf8");
const types = fs.readFileSync(path.join(root, "lib/ad-activation/types.ts"), "utf8");

const mustContain = [
  "create table public.ad_audience_definitions",
  "create table public.ad_audience_destinations",
  "create table public.ad_audience_memberships",
  "create table public.ad_activation_outbox",
  "create table public.ad_activation_attempts",
  "enable row level security",
  "security_invoker = true",
  "block_ad_exports",
  "raw contact identifiers are resolved at send time",
];

for (const token of mustContain) {
  if (!migration.includes(token)) {
    throw new Error(`ad activation migration contract missing: ${token}`);
  }
}

if (migration.includes("email text") || migration.includes("phone text")) {
  throw new Error("ad activation outbox must not persist raw email/phone fields");
}

for (const sensitive of ["medical", "pregnan", "message", "payment", "attachment", "disease", "therapy"]) {
  if (!privacy.includes(sensitive)) {
    throw new Error(`privacy deny pattern missing sensitive category: ${sensitive}`);
  }
}

for (const platform of ["meta", "google_ads"]) {
  if (!types.includes(`\"${platform}\"`)) {
    throw new Error(`provider-neutral activation contract missing ${platform}`);
  }
}

console.log("Ad activation foundation contracts: PASS");

if (!privacy.includes("SENSITIVE_PATTERN.test(clean)")) {
  throw new Error("safe metadata must reject sensitive values, not only sensitive keys");
}
