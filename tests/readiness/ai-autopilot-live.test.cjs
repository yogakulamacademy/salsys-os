const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (p) => fs.readFileSync(path.join(__dirname, '../..', p), 'utf8');

const runner = read('lib/ai-autopilot-runner.ts');
const route = read('app/api/ai/autopilot/route.ts');
const migration = read('supabase/migrations/20261118120000_ai_autopilot_live_v1.sql');
const action = read('app/conversations/copilot-actions.ts');

test('Autopilot sends nothing unless switched on; cron is secret-protected', () => {
  assert.match(runner, /AI_AUTOPILOT_LIVE_ENABLED === "true"/);
  assert.match(runner, /AI_FOLLOWUP_DRAFTS_ENABLED === "true"/);
  assert.match(route, /bearerMatchesAnySecret\(request\.headers\.get\("authorization"\), \[cronSecret\]\)/);
  assert.ok(JSON.parse(read('vercel.json')).crons.some((c) => c.path === '/api/ai/autopilot'));
});

test('every send is claimed once, policy-checked, gated and logged as AI', () => {
  assert.match(runner, /mode: "autopilot", status: "draft_ready"/);
  assert.match(runner, /evaluate_instagram_dm_send_policy_v1/);
  assert.match(runner, /liveHardStop\(msg\.body/);
  assert.match(runner, /sendDecision\(\{ assessment, draft: draft\.draft, routerRisk: draft\.risk \}\)/);
  assert.match(runner, /sender_type: "ai"/);
  assert.match(runner, /ai_generated: true/);
  assert.match(runner, /batchStartsSoon\(draft.facts\?.nextBatchStart/);
  assert.match(runner, /pauseIfTeamReplied/);
  assert.match(runner, /dailyCap\(\)/);
  assert.match(runner, /enrolled_reason: "pilot_new_lead"/);
  assert.doesNotMatch(runner, /payment_link|razorpay|paypal\.com/i);
});

test('follow-ups outside the 24h window are drafted, never auto-sent', () => {
  assert.match(runner, /if \(!lastInbound \|\| !windowOpen\(/);
  assert.match(runner, /state\?\.status !== "active"/);
});

test('Co-Pilot action still checks access before the shared drafter runs', () => {
  assert.match(action, /'can_work_lead'/);
  assert.ok(action.indexOf("'can_work_lead'") < action.indexOf('draftCopilotReply({'));
  assert.match(read('lib/copilot-core.ts'), /^import 'server-only';/);
});

test('migration: RLS, system-only handover, person-only state changes', () => {
  assert.match(migration, /alter table public\.ai_autopilot_leads enable row level security/);
  assert.match(migration, /revoke all on public\.ai_autopilot_leads from anon, authenticated/);
  assert.match(migration, /grant execute on function public\.ai_autopilot_handover_v1\(uuid, text, text\) to service_role/);
  assert.match(migration, /auth\.uid\(\) is null or not public\.can_work_lead\(p_lead_id\)/);
  assert.match(migration, /'human_review'/);
});
