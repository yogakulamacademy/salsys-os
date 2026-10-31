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

const hasPreviewSurface =
  (page.includes('Custom audience explorer') || page.includes('Rule Preview Engine')) &&
  page.includes('Matched people') &&
  page.includes('previewAudienceRule') &&
  page.includes('AudienceRuleBuilderDrawer');

if (!hasPreviewSurface) {
  throw new Error('Audience Intelligence page must preserve the safe aggregate rule-preview surface.');
}

if (!page.includes('Live CRM intelligence') || !page.includes('External sync off')) {
  throw new Error('Audience Intelligence page must distinguish live CRM intelligence from disabled external activation.');
}

console.log('Ad activation audience rule preview contracts: PASS');
