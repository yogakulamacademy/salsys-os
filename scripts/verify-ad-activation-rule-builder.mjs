import fs from 'node:fs';

const engine = fs.readFileSync('lib/ad-activation/custom-audience-rule-builder.ts', 'utf8');
const route = fs.readFileSync('app/api/marketing/audiences/preview/route.ts', 'utf8');
const builder = fs.readFileSync('components/marketing/audience-rule-builder-drawer.tsx', 'utf8');
const builderStyles = fs.readFileSync('components/marketing/audience-rule-builder-drawer.module.css', 'utf8');
const layout = fs.readFileSync('app/marketing/audiences/layout.tsx', 'utf8');
const page = fs.readFileSync('app/marketing/audiences/page.tsx', 'utf8');

for (const token of ['writesPerformed: 0','exportableIdentifiersReturned: false','CUSTOM_AUDIENCE_SENSITIVE_PATTERN','person_leads','lead_attribution','organization_id','HARD_ROW_LIMIT = 20000']) {
  if (!engine.includes(token)) throw new Error(`Custom audience builder missing safety contract: ${token}`);
}
for (const token of ['.insert(','.update(','.upsert(','.delete(','lead_contacts','person_identifiers','email_address','phone_number','notes,','summary,','body,']) {
  if (engine.includes(token)) throw new Error(`Custom audience builder contains forbidden data/write token: ${token}`);
}
if (!route.includes('export async function GET') || route.includes('export async function POST') || !route.includes("new Set(['owner', 'admin', 'manager'])")) {
  throw new Error('Custom audience preview API must remain GET-only and privileged.');
}
for (const token of ['Custom audience','Acquisition source','Lead channel','Preview audience','method: \'GET\'','No identifiers returned']) {
  if (!builder.includes(token)) throw new Error(`Audience builder missing UI contract: ${token}`);
}
if (!page.includes("import { AudienceRuleBuilderDrawer } from '@/components/marketing/audience-rule-builder-drawer';") || !page.includes('<AudienceRuleBuilderDrawer />')) {
  throw new Error('Custom audience builder must be mounted inside the Audience Intelligence page.');
}
if (layout.includes('AudienceRuleBuilderDrawer')) {
  throw new Error('Custom audience builder must not be globally mounted by the route layout.');
}
for (const forbidden of ['.backdrop', 'position: fixed', '100dvh', 'translateX(']) {
  if (builderStyles.includes(forbidden)) throw new Error(`Inline audience builder contains forbidden overlay style: ${forbidden}`);
}
console.log('Ad activation custom audience inline builder contracts: PASS');
