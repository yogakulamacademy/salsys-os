const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./helpers.cjs');

const core = load('lib/ai/organic-growth-skills-core.ts');
let calls = [];
const bridge = load('lib/ai/organic-growth-claude-tool-bridge.ts', {
  'server-only': {},
  './organic-growth-skills-core': core,
  './organic-growth-skills-gateway': {
    runOrganicGrowthReadOnlyTool: async (name, input) => {
      calls.push({ name, input });
      return { tool: name, status: 'insufficient_paid_evidence', sourceReadiness: {
        blockerCode: 'google_cloud_project_test_access',
      }, estimatedSavings: null };
    },
  },
});

const validToolUse = (overrides = {}) => ({
  stop_reason: 'tool_use',
  content: [{
    type: 'tool_use',
    id: 'toolu_synthetic_1',
    name: 'salsys_seo_vs_ads_evidence_v1',
    input: {},
    ...overrides,
  }],
});

test('Claude request exposes only approved read-only tools and one tool per turn', () => {
  const request = bridge.createOrganicGrowthClaudeToolRequest('Review our organic and paid search queries');
  assert.equal(request.tools.length, 2);
  assert.deepEqual(request.tools.map(t => t.name), [
    'salsys_content_brief_evidence_v1',
    'salsys_seo_vs_ads_evidence_v1',
  ]);
  assert.equal(request.tool_choice.disable_parallel_tool_use, true);
  assert.match(request.system, /UNTRUSTED DATA/);
  assert.match(request.system, /not proof of wasted/);
  assert.equal(request.messages[0].role, 'user');
  assert.equal(Object.hasOwn(request, 'model'), false);
  assert.throws(() => bridge.createOrganicGrowthClaudeToolRequest(' '), /between 3 and 600/);
});

test('Claude parser rejects extra tools and unknown names', () => {
  const extra = validToolUse();
  extra.content.push({ type: 'tool_use', id: 'toolu_synthetic_2', name: 'salsys_content_brief_evidence_v1', input: { topic: 'yoga' } });
  assert.throws(() => bridge.parseOneOrganicGrowthClaudeToolUse(extra), /Only one/);
  assert.throws(() => bridge.parseOneOrganicGrowthClaudeToolUse(validToolUse({ name: 'delete_all_leads' })), /unapproved tool/);
  assert.throws(() => bridge.parseOneOrganicGrowthClaudeToolUse(validToolUse({ id: '../etc/passwd' })), /identifier is invalid/);
  assert.throws(() => bridge.parseOneOrganicGrowthClaudeToolUse(validToolUse({ input: ['bad'] })), /malformed tool arguments/);
  assert.throws(() => bridge.parseOneOrganicGrowthClaudeToolUse({ stop_reason: 'end_turn', content: [] }), /did not request/);
});

test('Claude mediator fails before tool reads when separate bridge kill switch is disabled', async () => {
  const original = process.env.SALSYS_ORGANIC_GROWTH_CLAUDE_TOOL_BRIDGE_ENABLED;
  delete process.env.SALSYS_ORGANIC_GROWTH_CLAUDE_TOOL_BRIDGE_ENABLED;
  calls = [];
  try {
    await assert.rejects(bridge.executeOneOrganicGrowthClaudeTool(validToolUse()), /bridge is disabled/);
    assert.equal(calls.length, 0);
  } finally {
    if (original === undefined) delete process.env.SALSYS_ORGANIC_GROWTH_CLAUDE_TOOL_BRIDGE_ENABLED;
    else process.env.SALSYS_ORGANIC_GROWTH_CLAUDE_TOOL_BRIDGE_ENABLED = original;
  }
});

test('Claude mediator returns proper client tool_result with only allowed sanitized evidence', async () => {
  const original = process.env.SALSYS_ORGANIC_GROWTH_CLAUDE_TOOL_BRIDGE_ENABLED;
  process.env.SALSYS_ORGANIC_GROWTH_CLAUDE_TOOL_BRIDGE_ENABLED = 'true';
  calls = [];
  try {
    const result = await bridge.executeOneOrganicGrowthClaudeTool(validToolUse());
    assert.equal(calls.length, 1);
    assert.equal(calls[0].name, 'salsys_seo_vs_ads_evidence_v1');
    assert.deepEqual(calls[0].input, {});
    assert.equal(result.role, 'user');
    assert.equal(result.content[0].type, 'tool_result');
    assert.equal(result.content[0].tool_use_id, 'toolu_synthetic_1');
    assert.equal(JSON.parse(result.content[0].content).sourceReadiness.blockerCode, 'google_cloud_project_test_access');
  } finally {
    if (original === undefined) delete process.env.SALSYS_ORGANIC_GROWTH_CLAUDE_TOOL_BRIDGE_ENABLED;
    else process.env.SALSYS_ORGANIC_GROWTH_CLAUDE_TOOL_BRIDGE_ENABLED = original;
  }
});
