import fs from 'node:fs';

const engine = fs.readFileSync('lib/ad-activation/custom-audience-rule-builder.ts', 'utf8');
const route = fs.readFileSync('app/api/marketing/audiences/preview/route.ts', 'utf8');
const drawer = fs.readFileSync('components/marketing/audience-rule-builder-drawer.tsx', 'utf8');
const layout = fs.readFileSync('app/marketing/audiences/layout.tsx', 'utf8');

for (const token of ['writesPerformed: 0','exportableIdentifiersReturned: false','CUSTOM_AUDIENCE_SENSITIVE_PATTERN','person_leads','lead_attribution','organization_id','HARD_ROW_LIMIT = 20000']) {
  if (!engine.includes(token)) throw new Error(`Custom audience builder missing safety contract: ${token}`);
}
for (const token of ['.insert(','.update(','.upsert(','.delete(','lead_contacts','person_identifiers','email_address','phone_number','notes,','summary,','body,']) {
  if (engine.includes(token)) throw new Error(`Custom audience builder contains forbidden data/write token: ${token}`);
}
if (!route.includes('export async function GET') || route.includes('export async function POST') || !route.includes("new Set(['owner', 'admin', 'manager'])")) {
  throw new Error('Custom audience preview API must remain GET-only and privileged.');
}
for (const token of ['Build audience','Acquisition source','Lead channel','Preview audience','method: \'GET\'','No identifiers returned']) {
  if (!drawer.includes(token)) throw new Error(`Audience builder drawer missing UI contract: ${token}`);
}
if (!layout.includes('AudienceRuleBuilderDrawer')) throw new Error('Audience builder drawer is not mounted on Audience Intelligence.');
console.log('Ad activation custom audience rule builder contracts: PASS');
