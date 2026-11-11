// Local-only behavior tests: no Supabase, no auth, no Meta HTTP calls.
// Transpile TypeScript in memory so only pure authoring functions are executed.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const source = fs.readFileSync(path.join(process.cwd(),
  'lib/integrations/whatsapp-template-authoring.ts'), 'utf8');
const output = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;

const module = { exports: {} };
const calls = [];
let responseMode = 'ok';
const safeFetch = async (url, options) => {
  calls.push({ url: String(url), method: options.method,
    authorization: options.headers.Authorization, body: JSON.parse(options.body) });
  return responseMode === 'ok'
    ? { ok: true, status: 200, json: async () => ({ id: 'synthetic-template-1', status: 'PENDING' }) }
    : { ok: false, status: 429, json: async () => ({ error: { code: 130429 } }) };
};

vm.runInNewContext(output, {
  module,
  exports: module.exports,
  require: () => ({}),
  URL,
  process: { env: { WA_API_VERSION: 'v26.0' } },
  AbortSignal,
  fetch: safeFetch,
}, { filename: 'whatsapp-template-authoring.transpiled.js', timeout: 1000 });

const { validateTemplateAuthoringInput: validate, buildMetaTemplateComponents: components, postMetaTemplate } = module.exports;
assert.equal(typeof validate, 'function');
assert.equal(typeof components, 'function');
assert.equal(typeof postMetaTemplate, 'function');

const valid = {
  name: 'sample_followup_v1',
  language: 'en_US',
  category: 'MARKETING',
  header: 'Course information',
  body: 'Hi {{1}}, here are details for {{2}}.',
  footer: 'Example Business',
  buttonType: 'quick_reply',
  buttonText: 'Interested',
  buttonUrl: '',
  examples: { 1: 'Alex', 2: 'the evening batch' },
};
const parsed = validate(valid, true);
assert.equal(parsed.name, valid.name);
assert.equal(parsed.examples['2'], 'the evening batch');
const built = JSON.parse(JSON.stringify(components(parsed)));
assert.equal(built.length, 4);
assert.equal(built[1].type, 'BODY');
assert.deepEqual(built[1].example.body_text, [['Alex', 'the evening batch']]);
assert.deepEqual(built[3].buttons, [{ type: 'QUICK_REPLY', text: 'Interested' }]);

function reject(changes, reason) {
  assert.throws(() => validate({ ...valid, ...changes }, true), reason);
}
reject({ name: 'BAD NAME' }, /name/);
reject({ category: 'AUTHENTICATION' }, /Marketing and Utility/);
reject({ body: 'Hello {{1}} and {{3}}' }, /consecutive/);
reject({ body: 'Hello {{1}} and {{oops}}' }, /consecutive/);
reject({ header: 'Hello {{1}}' }, /Header and footer/);
reject({ body: '' }, /required/);
reject({ buttonType: 'url', buttonUrl: 'http://example.org', buttonText: 'Visit' }, /HTTPS/);
reject({ examples: { 1: 'Alex' } }, /example/);
assert.equal(validate({ ...valid, examples: {} }, false).examples['1'], '',
  'Local drafts may be saved before sample values are complete');

const website = validate({ ...valid, buttonType: 'url', buttonText: 'View course',
  buttonUrl: 'https://example.org/course' }, true);
const websiteParts = JSON.parse(JSON.stringify(components(website)));
assert.deepEqual(websiteParts[3].buttons, [{
  type: 'URL', text: 'View course', url: 'https://example.org/course',
}]);

const result = await postMetaTemplate('synthetic-waba', 'mock-bearer', parsed);
assert.deepEqual(JSON.parse(JSON.stringify(result)),
  { id: 'synthetic-template-1', status: 'PENDING' });
assert.equal(calls.length, 1);
assert.equal(calls[0].method, 'POST');
assert.equal(calls[0].authorization, 'Bearer mock-bearer');
assert.equal(calls[0].url, 'https://graph.facebook.com/v26.0/synthetic-waba/message_templates');
assert.equal(calls[0].body.category, 'MARKETING');
assert.equal(calls[0].body.name, 'sample_followup_v1');
assert.ok(!calls[0].url.endsWith('/messages'), 'Approval request cannot send a customer message');

responseMode = 'rate-limit';
await assert.rejects(
  () => postMetaTemplate('synthetic-waba', 'mock-bearer', parsed),
  err => err?.status === 502,
  'Ambiguous provider response should remain non-definitive',
);
console.log('WhatsApp template authoring behavioral tests passed (mock provider only).');
