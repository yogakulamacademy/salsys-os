import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const mapping = fs.readFileSync(
  path.join(root, "lib/ad-activation/crm-signal-mapping.ts"),
  "utf8",
);

for (const key of [
  "active_prospects",
  "qualified_prospects",
  "high_intent_prospects",
  "enrolled_students",
]) {
  if (!mapping.includes(`\"${key}\"`)) {
    throw new Error(`CRM audience mapping missing built-in audience: ${key}`);
  }
}

for (const terminal of ["enrolled", "lost", "unqualified", "duplicate"]) {
  if (!mapping.includes(`\"${terminal}\"`)) {
    throw new Error(`CRM mapping missing terminal prospect stage: ${terminal}`);
  }
}

if (!mapping.includes("deriveBuiltinAudienceMemberships")) {
  throw new Error("CRM audience membership derivation is missing");
}
if (!mapping.includes("deriveCrmAudienceTransitions")) {
  throw new Error("CRM audience transition derivation is missing");
}

console.log("Ad activation CRM mapping contracts: PASS");
