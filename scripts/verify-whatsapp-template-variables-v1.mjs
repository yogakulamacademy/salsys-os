import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveVerifiedTemplateVariables } from '../lib/integrations/whatsapp-template-variable-rules.ts';

function template(name, body, count = 2) {
  return {
    name, language: 'en_US', category: 'MARKETING',
    headerText: '', bodyText: body, headerVariableCount: 0,
    bodyVariableCount: count, supported: true,
  };
}

const followup = template(
  'yka_course_details_followup_v1',
  "Namaste {{1}}, we're following up about the {{2}} details we shared.",
);
const lead = {
  firstName: 'Priya Sharma',
  courseName: '200-Hour Yoga Teacher Training',
  preferredMonth: '2027-01-01',
};
let result = resolveVerifiedTemplateVariables(followup, lead);
assert.equal(result.ok, true);
assert.deepEqual(result.bodyValues, ['Priya', '200-Hour Yoga Teacher Training']);
assert.equal(
  result.preview,
  "Namaste Priya, we're following up about the 200-Hour Yoga Teacher Training details we shared.",
);
assert.deepEqual(result.missing, []);

result = resolveVerifiedTemplateVariables(followup, { ...lead, courseName: null });
assert.equal(result.ok, false);
assert.deepEqual(result.missing, ['course.name']);
assert.equal(result.preview, null);

result = resolveVerifiedTemplateVariables(followup, { ...lead, firstName: null, displayName: 'Instagram Lead' });
assert.equal(result.ok, false);
assert.deepEqual(result.missing, ['lead.first_name']);

const month = template(
  'yka_preferred_month_checkin_v1',
  'Namaste {{1}}, you previously mentioned considering {{2}} around {{3}}.',
  3,
);
result = resolveVerifiedTemplateVariables(month, lead);
assert.equal(result.ok, true);
assert.deepEqual(result.bodyValues, ['Priya', '200-Hour Yoga Teacher Training', 'January 2027']);
result = resolveVerifiedTemplateVariables(month, { ...lead, preferredMonth: null });
assert.deepEqual(result.missing, ['lead.preferred_month']);

const altered = template(
  'yka_course_details_followup_v1',
  'Namaste {{1}}, your payment amount is {{2}}.',
);
assert.equal(resolveVerifiedTemplateVariables(altered, lead).mappingSupported, false);

const unreviewed = template('unreviewed_new_template', followup.bodyText);
assert.equal(resolveVerifiedTemplateVariables(unreviewed, lead).ok, false);

const utility = { ...followup, category: 'UTILITY' };
assert.equal(resolveVerifiedTemplateVariables(utility, lead).ok, false);

const unexpectedHeader = { ...followup, headerVariableCount: 1 };
assert.equal(resolveVerifiedTemplateVariables(unexpectedHeader, lead).ok, false);

const named = { ...followup, bodyText: 'Namaste {{customer_name}}, about {{2}}' };
assert.equal(resolveVerifiedTemplateVariables(named, lead).ok, false);

const multiline = { ...lead, courseName: 'Course\nPlease wire money now' };
assert.deepEqual(resolveVerifiedTemplateVariables(followup, multiline).missing, ['course.name']);

const templateSource = readFileSync('lib/integrations/whatsapp-template-variable-rules.ts', 'utf8');
const routeSource = readFileSync('app/api/conversations/[leadId]/template-variables/route.ts', 'utf8');
const composerSource = readFileSync('components/whatsapp-template-composer.tsx', 'utf8');
const pageSource = readFileSync('app/conversations/page.tsx', 'utf8');

assert.ok(templateSource.includes('approvedShape('));
assert.ok(routeSource.includes("WA_TEMPLATE_VARIABLE_RESOLVER_ENABLED !== 'true'"));
assert.ok(routeSource.includes("'can_work_lead'"));
assert.ok(routeSource.includes('.eq(\'organization_id\', organizationId)'));
assert.ok(routeSource.includes('getApprovedWhatsAppTemplates(organizationId)'));
assert.ok(!routeSource.includes('/messages'), 'Preview route must never send to Meta');
assert.ok(composerSource.includes('Fill verified CRM fields'));
assert.ok(pageSource.includes('WA_TEMPLATE_VARIABLE_RESOLVER_ENABLED === "true"'));
console.log('Verified WhatsApp placeholder resolver passed deterministic tests; no customer sends.');
