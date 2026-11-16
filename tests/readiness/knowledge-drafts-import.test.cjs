const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');

const actions = readFileSync(path.join(__dirname, '../../app/settings/knowledge/actions.ts'), 'utf8');
const body = actions.slice(actions.indexOf('export async function importKnowledgeDraftsAction'));

test('knowledge draft import never approves', () => {
  assert.match(body, /p_approve: false/);
  assert.doesNotMatch(body, /p_approve: true/);
  assert.doesNotMatch(body, /approve_knowledge_document/);
});

test('knowledge draft import is bounded and uses the tenant-checked RPC with the user session', () => {
  assert.match(body, /MAX_DRAFT_FILE_BYTES|MAX_DRAFTS/);
  assert.match(body, /currentContext\(\)/);
  assert.match(body, /create_source_backed_knowledge_document_v2/);
  assert.doesNotMatch(body, /createAdminClient/);
});

test('flagged drafts are visibly marked for review', () => {
  assert.match(body, /'⚠ '/);
  assert.match(body, /Review: \$\{flag\}/);
});
