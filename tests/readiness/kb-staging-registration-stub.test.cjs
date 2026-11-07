'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {resolve} = require('node:path');

const workflow = readFileSync(
  resolve(__dirname, '../../.github/workflows/kb-isolated-staging-session-binding.yml'),
  'utf8',
);

test('KB-07A registration stub is workflow_dispatch only, with matching manual input names', () => {
  assert.match(workflow,/^on:\n  workflow_dispatch:\n    inputs:\n/m);
  assert.match(workflow,/^      staging_project_ref:\n/m);
  assert.match(workflow,/^      approval_phrase:\n/m);
  assert.equal((workflow.match(/^  workflow_dispatch:/gm)||[]).length,1);
  assert.doesNotMatch(workflow,/^\s*(?:push|pull_request|schedule|repository_dispatch|workflow_run|workflow_call):/m);
  assert.match(workflow,/^permissions:\n  contents: read\n/m);
  assert.doesNotMatch(workflow,/^\s*(?:id-token|actions|deployments): write\s*$/m);
});

test('KB-07A cannot access environments, credentials, external code or staging data', () => {
  assert.doesNotMatch(workflow,/^\s*(?:environment|env|uses|container|services|if|needs):/m);
  assert.doesNotMatch(workflow,/\$\{\{|secrets\.|vars\.|GITHUB_TOKEN|checkout@|supabase\.co|curl|wget|node\s+scripts|gh\s+/i);
  assert.match(workflow,/^    timeout-minutes: 1\n/m);
  assert.match(workflow,/^    runs-on: ubuntu-24\.04\n/m);
  assert.equal((workflow.match(/^\s+- name: /gm)||[]).length,1);
});

test('KB-07A exact command body always fails closed; any runtime change needs explicit test review', () => {
  const prefix='        run: |\n';
  const position=workflow.indexOf(prefix);
  assert.ok(position>=0,'missing shell runtime');
  assert.equal(workflow.slice(position+prefix.length),
    '          echo "::error::KB staging dispatch is BLOCKED from this placeholder. No staging action was performed."\n'+
    '          exit 1\n');
  assert.match(workflow,/^\s+exit 1\s*$/m);
  assert.doesNotMatch(workflow,/\bexit 0\b/);
});
