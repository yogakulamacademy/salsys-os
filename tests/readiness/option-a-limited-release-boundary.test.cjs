'use strict';

/**
 * Option A is a deliberately narrow, source-only release boundary.
 *
 * This test is included in npm run test:readiness (run by the existing
 * CI validate job). It asserts the absence of known deferred feature
 * paths on this specific release track. It cannot prove external
 * production configuration, full absence of all network side effects,
 * legal compliance or release approval; those need separate checks.
 *
 * Removing/relaxing this gate belongs in a separately reviewed Option B PR.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const exists = relative => fs.existsSync(path.join(root, relative));
const source = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('Option A has no new Knowledge discovery API, worker or UI paths', () => {
  const deferred = [
    'app/api/knowledge/discovery',
    'app/settings/knowledge/discovery',
    'app/settings/knowledge/discovery/draft-action.ts',
    'app/settings/knowledge/discovery/preview-action.ts',
    'app/settings/knowledge/evidence-preview',
    'lib/knowledge-discovery',
  ];
  for (const relative of deferred) {
    assert.equal(exists(relative), false, `Deferred discovery must not ship in Option A: ${relative}`);
  }
});

test('Option A has no draft governed AI execution or read-only tool modules', () => {
  const deferred = [
    'lib/ai/agent-governance-v1.ts',
    'lib/ai/copilot-safety-guard-candidate-v1.ts',
    'lib/ai/read-only-tool-gate-v1.ts',
    'lib/ai/read-only-auth-boundary-v1.ts',
    'lib/ai/read-only-tool-result-projection-v1.ts',
    'lib/ai/real-schema-read-projection-draft-v1.ts',
    'lib/ai/audit-commit-read-preview-v1.ts',
  ];
  for (const relative of deferred) {
    assert.equal(exists(relative), false, `Unreviewed AI candidate must not ship in Option A: ${relative}`);
  }
});

test('existing Co-Pilot is unchanged in scope: human-requested draft action only', () => {
  const copilot = source('app/conversations/copilot-actions.ts');
  assert.match(copilot, /export async function generateCopilotReplyAction\s*\(/);
  assert.match(copilot, /You never send messages yourself\./);
  assert.doesNotMatch(copilot, /from\s*['"]@\/lib\/ai\//);
  assert.deepEqual(
    [...copilot.matchAll(/\bexport\s+async\s+function\s+(\w+)/g)].map(match => match[1]),
    ['generateCopilotReplyAction'],
  );
});

test('existing manual Knowledge actions do not activate new discovery processing', () => {
  const knowledge = source('app/settings/knowledge/actions.ts');
  assert.match(knowledge, /export async function createKnowledgeDocumentAction\s*\(/);
  assert.match(knowledge, /export async function approveKnowledgeDocumentAction\s*\(/);
  assert.doesNotMatch(knowledge, /knowledge-discovery|website_discovery_review_only/);
});

test('Option A does not register unapproved isolated Knowledge staging workflows', () => {
  const deferred = [
    '.github/workflows/kb-isolated-staging-readonly.yml',
    '.github/workflows/kb-isolated-staging-session-binding.yml',
  ];
  for (const relative of deferred) {
    assert.equal(exists(relative), false, `Protected staging remains separately authorized: ${relative}`);
  }
});
