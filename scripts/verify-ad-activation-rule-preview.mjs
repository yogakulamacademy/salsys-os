import fs from 'node:fs';

const engine = fs.readFileSync('lib/ad-activation/audience-rule-preview.ts', 'utf8');
const page = fs.readFileSync('app/marketing/audiences/page.tsx', 'utf8');

const required = [
  "writesPerformed: 0",
  "exportableIdentifiersReturned: false",
  "sensitiveRuleRejected",
  "SENSITIVE_RULE_PATTERN",
  "person_leads",
  "lead_attribution",
  "organization_id",
  "matchedPeople",
  "identityUnlinkedLeads",
];
for (const token of required) {
  if (!engine.includes(token)) throw new Error(`Audience rule preview missing contract: ${token}`);
}

const forbidden = [
  '.insert(', '.update(', '.upsert(', '.delete(',
  'claimAdActivationDeliveries', 'finalizeAdActivationDelivery',
  'decryptIntegrationSecret', 'graph.facebook.com', 'googleapis.com',
  'email,', 'phone,', 'notes,', 'summary,', 'body,',
];
for (const token of forbidden) {
  if (engine.includes(token)) throw new Error(`Audience rule preview contains forbidden token: ${token}`);
}

if (page.includes('Prenatal nurture audience')) {
  throw new Error('Sensitive pregnancy-related audience blueprint must not be present.');
}
if (!page.includes('Rule Preview Engine') || !page.includes('Matched people') || !page.includes('previewAudienceRule')) {
  throw new Error('Audience Intelligence page must surface rule-preview output.');
}

console.log('Ad activation audience rule preview contracts: PASS');
