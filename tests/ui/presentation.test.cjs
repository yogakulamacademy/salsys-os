const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

// Execute the production helpers, stubbing only the server-only module marker.
function load(relativePath) {
  const filename = path.resolve(__dirname, '../../', relativePath);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function('require', 'exports', code)(name => {
    if (name === 'server-only') return {};
    throw new Error(`Unexpected runtime dependency: ${name}`);
  }, exports);
  return exports;
}
const { percentageWidth, personInitials, sourceLabel } = load('lib/ui-format.ts');
const { withAuthorizedLeadContacts } = load('lib/lead-list-contacts.ts');
const lead = { id: 'visible-lead', name: 'Example', email: 'raw@example.test', phone: '+10000000000' };

test('zero, unknown and invalid quantities never create a false positive bar', () => {
  for (const value of [0, null, undefined, NaN, Infinity, -5]) assert.equal(percentageWidth(value), 0);
  assert.equal(percentageWidth(20, 80), 25);
  assert.equal(percentageWidth(110), 100);
  assert.equal(percentageWidth(1, 0), 0);
});

test('initials preserve complete emoji and combining-character graphemes', () => {
  assert.equal(personInitials('👩🏽‍💻 Developer'), '👩🏽‍💻D');
  assert.equal(personInitials('A\u0301sha Singh'), 'A\u0301S');
  assert.equal(personInitials('  '), '?');
  assert.equal(sourceLabel('l.instagram.com'), 'Instagram');
  assert.equal(sourceLabel('www.google.com'), 'Google');
});

test('contact hydration requests only visible IDs and preserves secure masking', async () => {
  const client = { rpc: async (name, args) => {
    assert.equal(name, 'get_admissions_lead_contacts_secure');
    assert.deepEqual(args, { p_lead_ids: ['visible-lead'] });
    return { data: [{ lead_id: lead.id, email: 'r***@example.test', phone: '***0000', pii_masked: true }], error: null };
  } };
  const [result] = await withAuthorizedLeadContacts(client, [lead]);
  assert.equal(result.email, 'r***@example.test');
  assert.equal(result.phone, '***0000');
  assert.equal(lead.email, 'raw@example.test');
});

test('denied and failed contact reads never fall back to overview PII', async () => {
  for (const reply of [{ data: [], error: null }, { data: null, error: { message: 'denied' } }]) {
    const [result] = await withAuthorizedLeadContacts({ rpc: async () => reply }, [lead]);
    assert.equal(result.email, undefined);
    assert.equal(result.phone, undefined);
    assert.equal(result.contactAvailability, reply.error ? 'unavailable' : 'restricted');
  }
  const [result] = await withAuthorizedLeadContacts({ rpc: async () => { throw Error('network'); } }, [lead]);
  assert.equal(result.contactAvailability, 'unavailable');
  assert.equal(result.email, undefined);
});

test('an authorized empty contact differs from a denied read; empty lists do not call RPC', async () => {
  const [result] = await withAuthorizedLeadContacts({ rpc: async () => ({ data: [{ lead_id: lead.id, email: null, phone: null, whatsapp: null }], error: null }) }, [lead]);
  assert.equal(result.contactAvailability, 'missing');
  assert.deepEqual(await withAuthorizedLeadContacts({ rpc: () => { throw Error('must not call'); } }, []), []);
});
