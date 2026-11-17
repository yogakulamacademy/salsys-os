const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (p) => fs.readFileSync(path.join(__dirname, '../..', p), 'utf8');

const migration = read('supabase/migrations/20261117120000_ai_knowledge_proposals_v1.sql');
const runner = read('lib/ai-knowledge-proposals-runner.ts');
const route = read('app/api/ai/knowledge-proposals/route.ts');
const actions = read('app/settings/knowledge/proposal-actions.ts');
const ui = read('components/knowledge-suggestions.tsx');
const page = read('app/settings/knowledge/page.tsx');

test('weekly cron is off unless enabled and cron-secret protected', () => {
  assert.match(route, /AI_KNOWLEDGE_PROPOSALS_ENABLED !== "true"/);
  assert.match(route, /bearerMatchesAnySecret\(request\.headers\.get\("authorization"\), \[cronSecret\]\)/);
  const vercel = JSON.parse(read('vercel.json'));
  assert.ok(vercel.crons.some((c) => c.path === '/api/ai/knowledge-proposals'));
});

test('the AI only records proposals; it never edits knowledge or messages', () => {
  assert.match(runner, /record_ai_knowledge_proposal_v1/);
  assert.doesNotMatch(runner, /knowledge_documents"\)\.(insert|update|delete)|knowledge_chunks|decide_ai_knowledge_proposal_v1/);
  assert.doesNotMatch(runner, /messages"\)\.insert|sendInstagram|sendWhatsApp/);
  assert.match(runner, /MAX_TOPICS_PER_RUN/);
  assert.match(runner, /output_config: \{ format: \{ type: "json_schema"/);
});

test('admins decide; gaps block approval; manual runs are throttled', () => {
  assert.match(actions, /can_manage_organization/);
  assert.match(actions, /hasPlaceholders\(content\)/);
  assert.match(actions, /decide_ai_knowledge_proposal_v1/);
  assert.match(actions, /30 \* 60_000/);
  assert.match(ui, /Nothing changes until you approve it/);
  assert.match(page, /canManage && !loadError \? <KnowledgeSuggestions/);
});

test('migration: RLS for managers, system-only recording, versioned approval with audit', () => {
  assert.match(migration, /enable row level security/);
  assert.match(migration, /using \(public\.can_manage_organization\(organization_id\)\)/);
  assert.match(migration, /revoke all on public\.ai_knowledge_proposals from anon, authenticated/);
  assert.match(migration, /revoke all on function public\.record_ai_knowledge_proposal_v1\([^)]*\) from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.record_ai_knowledge_proposal_v1\([^)]*\) to service_role/);
  assert.match(migration, /auth\.role\(\) is distinct from 'service_role' and not public\.can_manage_organization/);
  assert.match(migration, /unique \(organization_id, dedupe_key\)/);
  assert.match(migration, /v_pending >= 25/);
  assert.match(migration, /target_has_pending/);
  assert.match(migration, /set status = 'superseded'/);
  assert.match(migration, /insert into public\.knowledge_approvals/);
  assert.match(migration, /'entry_mode', 'ai_proposal'/);
});
