import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  auditWhatsAppTemplateVariables,
  validateWhatsAppTemplateSendParameters,
} from '../lib/integrations/whatsapp-template-parameter-audit.ts';

const body = text => [{ type: 'BODY', text }];
const params = (a, b) => [{ type: 'body', parameters: [
  { type: 'text', text: a }, { type: 'text', text: b },
]}];

const valid = auditWhatsAppTemplateVariables(body('Namaste {{1}}, about {{2}}.'));
assert.equal(valid.supported, true);
assert.equal(valid.bodyVariableCount, 2);
assert.equal(valid.headerVariableCount, 0);
assert.equal(valid.syntax, 'positional');
assert.equal(validateWhatsAppTemplateSendParameters(valid, params('Priya', '200-Hour YTT')), true);
assert.equal(validateWhatsAppTemplateSendParameters(valid, undefined), false);
assert.equal(validateWhatsAppTemplateSendParameters(valid, [{ type: 'body', parameters: [{type:'text',text:'Priya'}] }]), false);
assert.equal(validateWhatsAppTemplateSendParameters(valid, params('Priya', '{{course.name}}')), false);
assert.equal(validateWhatsAppTemplateSendParameters(valid, params('Priya\nSTOP', 'YTT')), false);

for (const broken of [
  'Namaste {{lead.first_name}}, about {{course.name}}.',
  'Namaste {{first_name}}, about {{course_name}}.',
  'Namaste {{1}}, about {{3}}.',
  'Namaste {{0}}, about {{1}}.',
  'Namaste {{1}}, about {{2.',
  'Namaste {{1}}, about {{2}} and }}.',
]) {
  const audit = auditWhatsAppTemplateVariables(body(broken));
  assert.equal(audit.supported, false, broken);
  assert.equal(validateWhatsAppTemplateSendParameters(audit, []), false);
}

const staticTemplate = auditWhatsAppTemplateVariables(body('Hello, welcome to our academy.'));
assert.equal(staticTemplate.supported, true);
assert.equal(staticTemplate.bodyVariableCount, 0);
assert.equal(validateWhatsAppTemplateSendParameters(staticTemplate, undefined), true);
assert.equal(validateWhatsAppTemplateSendParameters(staticTemplate, params('Priya', 'YTT')), false);

const headerBody = auditWhatsAppTemplateVariables([
  { type: 'HEADER', format: 'TEXT', text: 'Hello {{1}}' },
  { type: 'BODY', text: 'About {{1}}' },
]);
assert.equal(headerBody.supported, true);
assert.equal(headerBody.headerVariableCount, 1);
assert.equal(headerBody.bodyVariableCount, 1);
assert.equal(validateWhatsAppTemplateSendParameters(headerBody, [
  { type: 'header', parameters: [{type:'text',text:'Priya'}] },
  { type: 'body', parameters: [{type:'text',text:'YTT'}] },
]), true);

const sync = readFileSync('lib/integrations/whatsapp-template-sync.ts', 'utf8');
const provider = readFileSync('lib/integrations/whatsapp-provider-send.ts', 'utf8');
const growthAction = readFileSync('app/automation/whatsapp/growth/actions.ts', 'utf8');
const growthPage = readFileSync('app/automation/whatsapp/growth/page.tsx', 'utf8');

assert.ok(sync.includes('parameter_binding_supported: result.supported'));
assert.ok(provider.includes('auditWhatsAppTemplateVariables(template.components)'));
assert.ok(provider.includes('validateWhatsAppTemplateSendParameters(audit, components)'));
assert.ok(provider.indexOf('validateWhatsAppTemplateSendParameters(audit, components)')
  < provider.indexOf("type: 'template',", provider.indexOf('async function buildProviderPayload')));
assert.ok(growthAction.includes('auditWhatsAppTemplateVariables(template.components).supported'));
assert.ok(growthPage.includes('approved template(s) hidden from campaign selection.'));
console.log('WhatsApp parameter integrity regression tests passed; invalid or missing values fail closed.');
