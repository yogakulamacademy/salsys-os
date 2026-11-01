import fs from 'node:fs';

const migration = fs.readFileSync(
  'supabase/migrations/20261101162000_r10_command_center_recommendation_episodes_v1.sql',
  'utf8',
);
const route = fs.readFileSync(
  'app/api/intelligence/recommendations/present/route.ts',
  'utf8',
);
const component = fs.readFileSync(
  'components/home/recommended-actions.tsx',
  'utf8',
);
const layout = fs.readFileSync('app/home/layout.tsx', 'utf8');
const home = fs.readFileSync('app/home/page.tsx', 'utf8');

function requireText(source, needle, label) {
  if (!source.includes(needle)) {
    throw new Error(`R10-P1 verification failed: missing ${label} (${needle})`);
  }
}

for (const [needle, label] of [
  ['system_intelligence_recommendation_signal_state', 'persistent signal episode state'],
  ["signal_id in ('reply_backlog','overdue_followups','first_touch_needed','payment_pending')", 'four-signal allowlist'],
  ['v_r10_command_center_recommendation_candidates_v1', 'canonical candidate view'],
  ['from public.v_leads_overview v', 'Home lead scope'],
  ['public.v_lead_inbox_attention', 'reply/first-touch evidence'],
  ['from public.v_followups_due f', 'canonical overdue follow-up source'],
  ["h.to_stage = 'payment_pending'", 'payment-stage entry evidence'],
  ["current_stage = 'new'", 'first-touch stage condition'],
  ['latest_message_at is null', 'first-touch no-message condition'],
  ['last_contacted_at is null', 'first-touch no-contact condition'],
  ['row_number() over', 'deterministic oldest-target ranking'],
  ['resolve_system_intelligence_signal_episode_v1', 'episode resolver'],
  ["array['owner','admin','manager']::text[]", 'privileged episode role boundary'],
  ['for update;', 'concurrency-safe episode row lock'],
  ['episode_sequence = s.episode_sequence + 1', 'clear-to-active episode increment'],
  ["state = 'expired'", 'untouched recommendation expiry on clear'],
  ["r.state = 'active'", 'expiry limited to active recommendations'],
  ["'home:%s:episode:%s'", 'stable episode recommendation key'],
  ['missing clear observations never fabricate a recurrence', 'conservative recurrence contract'],
]) {
  requireText(migration, needle, label);
}

for (const [needle, label] of [
  ['export async function POST(request: NextRequest)', 'POST-only presentation boundary'],
  ['request.headers.get("origin") !== request.nextUrl.origin', 'same-origin request guard'],
  ['getCurrentWorkspaceContext(supabase)', 'server-derived workspace context'],
  ['new Set(["owner", "admin", "manager"])', 'privileged route role boundary'],
  ['const TARGET_LIMIT = 50', 'bounded working target set'],
  ['v_r10_command_center_recommendation_candidates_v1', 'candidate read'],
  ['resolve_system_intelligence_signal_episode_v1', 'episode resolution'],
  ['touch_system_intelligence_recommendation_v2', 'hardened P0 presentation RPC'],
  ['String(existing.state ?? "") !== "active"', 'terminal/non-active suppression'],
  ['p_source_version: "r10-p1"', 'P1 recommendation provenance'],
  ['p_category: "crm_operations"', 'deterministic CRM category'],
  ['evidenceClass: "deterministic_crm"', 'explicit evidence class'],
  ['"Cache-Control": "private, no-store"', 'private/no-store response'],
]) {
  requireText(route, needle, label);
}

for (const signal of [
  'reply_backlog',
  'overdue_followups',
  'first_touch_needed',
  'payment_pending',
]) {
  requireText(route, `signalId: "${signal}"`, `${signal} route configuration`);
}

for (const forbidden of [
  'event_intelligence_predictions',
  'lead_scoring_predictions',
  'conversion_probability',
  'prediction_generation_allowed',
]) {
  if (route.includes(forbidden)) {
    throw new Error(`R10-P1 presentation must not consume predictive/stale sources: ${forbidden}`);
  }
}

if (/export\s+async\s+function\s+GET\s*\(/.test(route)) {
  throw new Error('R10-P1 recommendation presentation must not mutate from a GET handler.');
}

for (const [needle, label] of [
  ['fetch("/api/intelligence/recommendations/present"', 'client presentation request'],
  ['method: "POST"', 'client POST method'],
  ['Deterministic CRM guidance', 'deterministic guidance label'],
  ['they are not conversion probabilities', 'non-probability disclosure'],
  ['Observed evidence', 'observed evidence badge'],
  ['Recommended actions unavailable', 'fail-closed unavailable state'],
  ['No new deterministic recommendations right now', 'zero-recommendation state'],
]) {
  requireText(component, needle, label);
}

for (const forbidden of ['>Accept<', '>Dismiss<', 'Mark complete', 'Start action']) {
  if (component.includes(forbidden)) {
    throw new Error(`R10-P1 must not activate P2 feedback controls yet: ${forbidden}`);
  }
}

requireText(layout, '<RecommendedActions />', 'Home recommendation surface');
requireText(home, 'title="Action queue"', 'existing factual Action Queue');
requireText(home, 'AttentionRow', 'existing factual Attention cards');

const directMutationGrant = /grant\s+(?:insert|update|delete|truncate|all)[^;]*system_intelligence_recommendation_signal_state[^;]*authenticated/i;
if (directMutationGrant.test(migration)) {
  throw new Error('R10-P1 signal episode state must not be directly mutable by authenticated clients.');
}

console.log('R10 Command Center Recommendations V1 contracts verified.');
