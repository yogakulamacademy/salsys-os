const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (p) => fs.readFileSync(path.join(__dirname, '../..', p), 'utf8');

const migration = read('supabase/migrations/20261117090000_ai_followup_detection_v1.sql');
const runner = read('lib/ai-followup-runner.ts');
const route = read('app/api/ai/followup-detection/route.ts');

test('follow-up detection is off unless enabled, and cron-secret protected', () => {
  assert.match(route, /AI_FOLLOWUP_DETECTION_ENABLED !== "true"/);
  assert.match(route, /bearerMatchesAnySecret\(request\.headers\.get\("authorization"\), \[cronSecret\]\)/);
  assert.match(runner, /process\.env\.AI_FOLLOWUP_DETECTION_ENABLED !== "true"/);
  assert.match(runner, /AI_FOLLOWUP_DETECTION_ORG_IDS/);
  const vercel = JSON.parse(read('vercel.json'));
  assert.ok(vercel.crons.some((c) => c.path === '/api/ai/followup-detection'));
});

test('runner only reads and creates tasks; it never sends a message', () => {
  assert.doesNotMatch(runner, /graph\.facebook\.com|sendWhatsApp|sendInstagram|messages"\)\.insert/);
  assert.match(runner, /\.eq\("direction", "inbound"\)/);
  assert.match(runner, /m\.sender_type === "lead"/);
  assert.match(runner, /latestByLead\.get\(m\.lead_id\) === m\.id/);
  assert.match(runner, /MAX_CLAUDE_CALLS/);
  assert.match(runner, /output_config: \{ format: \{ type: "json_schema"/);
});

test('migration: one row per message, tenant guard, RLS, service-role-only function', () => {
  assert.match(migration, /unique \(message_id\)/);
  assert.match(migration, /m\.organization_id = new\.organization_id/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /public\.is_organization_member\(organization_id\) and public\.can_access_lead\(lead_id\)/);
  assert.match(migration, /revoke insert, update, delete on public\.ai_followup_detections from authenticated/);
  assert.match(migration, /revoke all on function public\.create_ai_followup_task_v1\([^)]*\) from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.create_ai_followup_task_v1\([^)]*\) to service_role/);
  assert.match(migration, /'enrolled', 'lost', 'unqualified', 'duplicate'/);
  assert.match(migration, /An open follow-up already exists/);
  assert.match(migration, /created_by_type, created_by_id, metadata\)[\s\S]*'ai', 'ai_followup_detection_v1'/);
});
