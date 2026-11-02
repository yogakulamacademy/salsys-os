import crypto from 'node:crypto';
import fs from 'node:fs';

const historicalMigrationPath =
  'supabase/migrations/20261101153414_r10_command_center_recommendation_episodes_v1.sql';
const historicalMigration = fs.readFileSync(historicalMigrationPath, 'utf8');
const hardeningMigrationPath =
  'supabase/migrations/20261101155326_r10_command_center_recommendation_acceptance_hardening_v1.sql';
const hardeningMigration = fs.readFileSync(hardeningMigrationPath, 'utf8');
const feedbackMigration = fs.readFileSync(
  'supabase/migrations/20261101151403_r10_recommendation_security_hardening_v1.sql',
  'utf8',
);
const route = fs.readFileSync(
  'app/api/intelligence/recommendations/present/route.ts',
  'utf8',
);
const feedbackRoute = fs.readFileSync(
  'app/api/intelligence/recommendations/feedback/route.ts',
  'utf8',
);
const lifecycle = fs.readFileSync(
  'lib/intelligence/recommendation-lifecycle.ts',
  'utf8',
);
const component = fs.readFileSync(
  'components/home/recommended-actions.tsx',
  'utf8',
);
const layout = fs.readFileSync('app/home/layout.tsx', 'utf8');
const home = fs.readFileSync('app/home/page.tsx', 'utf8');

function normalizedSql(source) {
  return source.replace(/\r\n/g, '\n').trimEnd();
}

function requireText(source, needle, label) {
  if (!source.includes(needle)) {
    throw new Error(`R10 recommendation verification failed: missing ${label} (${needle})`);
  }
}

const historicalMd5 = crypto
  .createHash('md5')
  .update(normalizedSql(historicalMigration))
  .digest('hex');

if (historicalMd5 !== '7df18580cdc6da5c21d90dabcd2ee19c') {
  throw new Error(
    `R10-P1 historical migration drift for ${historicalMigrationPath}: expected 7df18580cdc6da5c21d90dabcd2ee19c, got ${historicalMd5}`,
  );
}

const hardeningMd5 = crypto
  .createHash('md5')
  .update(normalizedSql(hardeningMigration))
  .digest('hex');

if (hardeningMd5 !== 'bba754a1abb504a34694d3f8420952da') {
  throw new Error(
    `R10-P1 hardening migration drift for ${hardeningMigrationPath}: expected bba754a1abb504a34694d3f8420952da, got ${hardeningMd5}`,
  );
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
  requireText(historicalMigration, needle, label);
}

for (const [needle, label] of [
  ['v_r10_command_center_recommendation_candidates_v2', 'priority-enriched candidate view'],
  ['v_admissions_priority_queue', 'canonical operational priority source'],
  ['priority_score', 'canonical per-Lead priority evidence'],
  ['max_priority_score', 'aggregate signal priority evidence'],
  ["public.system_intelligence_recommendations.state = 'active'", 'atomic active-state touch guard'],
  ['accepted_at is null', 'accepted terminal touch guard'],
  ['dismissed_at is null', 'dismissed terminal touch guard'],
  ['acted_at is null', 'acted terminal touch guard'],
  ['completed_at is null', 'completed terminal touch guard'],
  ['INTELLIGENCE_EPISODE_TERMINAL', 'terminal episode failure'],
  ['creates no recommendation, recommendation-event, or signal-state rows', 'no-seeding contract'],
]) {
  requireText(hardeningMigration, needle, label);
}

for (const [needle, label] of [
  ['record_system_intelligence_recommendation_feedback_v1', 'hardened human feedback RPC'],
  ["p_event_type not in ('accepted','dismissed','action_started','action_completed')", 'feedback event allowlist'],
  ['for update;', 'feedback row lock'],
  ["state='accepted', accepted_at=now()", 'accepted lifecycle update'],
  ["state='dismissed', dismissed_at=now()", 'dismissed lifecycle update'],
  ["state='acted', acted_at=now()", 'action-start lifecycle update'],
  ["state='acted', completed_at=now()", 'completion timestamp without invented state'],
  ['INTELLIGENCE_TRANSITION_INVALID', 'fail-closed transition guard'],
  ['INTELLIGENCE_ACTION_ALREADY_COMPLETED', 'completed-action guard'],
  ['it executes no external customer/provider action', 'no external action contract'],
]) {
  requireText(feedbackMigration, needle, label);
}

for (const [needle, label] of [
  ['export async function POST(request: NextRequest)', 'POST-only presentation boundary'],
  ['request.headers.get("origin") !== request.nextUrl.origin', 'same-origin request guard'],
  ['getCurrentWorkspaceContext(supabase)', 'server-derived workspace context'],
  ['new Set(["owner", "admin", "manager"])', 'privileged route role boundary'],
  ['const TARGET_LIMIT = 50', 'bounded working target set'],
  ['v_r10_command_center_recommendation_candidates_v2', 'acceptance-hardened candidate read'],
  ['max_priority_score', 'canonical operational priority consumption'],
  ['clampPriority', 'bounded operational priority'],
  ['resolve_system_intelligence_signal_episode_v1', 'episode resolution'],
  ['touch_system_intelligence_recommendation_v2', 'hardened presentation RPC'],
  ['String(existing.state ?? "") !== "active"', 'terminal/non-active pre-suppression'],
  ['INTELLIGENCE_EPISODE_TERMINAL', 'terminal-touch race detection'],
  ['const { data: committedData', 'committed-work read'],
  ['.in("state", ["accepted", "acted"])', 'accepted/in-progress persisted work'],
  ['.is("dismissed_at", null)', 'dismissed committed-work exclusion'],
  ['.is("completed_at", null)', 'completed committed-work exclusion'],
  ['normalizeRecommendationLifecycle(row)', 'authoritative committed lifecycle normalization'],
  ['lifecycleState: "active"', 'fresh active lifecycle response'],
  ['committedUnavailable', 'committed-read availability boundary'],
  ['const partial = unavailableSignals.length > 0 || committedUnavailable', 'combined partial-success boundary'],
  ['p_source_version: "r10-p1"', 'P1 recommendation provenance'],
  ['p_category: "crm_operations"', 'deterministic CRM category'],
  ['evidenceClass: "deterministic_crm"', 'explicit evidence class'],
  ['"Cache-Control": "private, no-store"', 'private/no-store response'],
]) {
  requireText(route, needle, label);
}

const committedReadIndex = route.indexOf('const { data: committedData');
if (committedReadIndex < 0) {
  throw new Error('R10-P2 committed recommendation read is missing.');
}
if (route.slice(committedReadIndex).includes('touch_system_intelligence_recommendation_v2')) {
  throw new Error('R10-P2 committed recommendations must not create another shown/touch event.');
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
  'score: 95',
  'score: 90',
  'score: 85',
  'score: 80',
]) {
  if (route.includes(forbidden)) {
    throw new Error(`R10 presentation must not consume or invent unsupported intelligence: ${forbidden}`);
  }
}

if (/export\s+async\s+function\s+GET\s*\(/.test(route)) {
  throw new Error('R10 recommendation presentation must not mutate from a GET handler.');
}

for (const [needle, label] of [
  ['RECOMMENDATION_FEEDBACK_EVENTS', 'shared four-event feedback allowlist'],
  ['"active"', 'active normalized lifecycle'],
  ['"accepted"', 'accepted normalized lifecycle'],
  ['"in_progress"', 'in-progress normalized lifecycle'],
  ['"completed"', 'completed normalized lifecycle'],
  ['"dismissed"', 'dismissed normalized lifecycle'],
  ['"expired"', 'expired normalized lifecycle'],
  ['if (lifecycle === "active") return ["accepted", "dismissed"]', 'active legal actions'],
  ['if (lifecycle === "accepted") return ["action_started", "dismissed"]', 'accepted legal actions'],
  ['if (lifecycle === "in_progress") return ["action_completed"]', 'in-progress legal action'],
  ['parseRecommendationEpisodeSequence', 'historical episode parsing'],
]) {
  requireText(lifecycle, needle, label);
}

for (const [needle, label] of [
  ['export async function POST(request: NextRequest)', 'feedback POST boundary'],
  ['request.headers.get("origin") !== request.nextUrl.origin', 'feedback same-origin guard'],
  ['getCurrentWorkspaceContext(supabase)', 'feedback server-derived workspace'],
  ['new Set(["owner", "admin", "manager"])', 'feedback privileged role boundary'],
  ['const MAX_NOTE_LENGTH = 500', 'feedback note bound'],
  ['isRecommendationFeedbackEvent(eventType)', 'feedback event validation'],
  ['record_system_intelligence_recommendation_feedback_v1', 'feedback RPC invocation'],
  ['readHomeRecommendation', 'authoritative recommendation read-back'],
  ['normalizeRecommendationLifecycle(row)', 'feedback lifecycle normalization'],
  ['getAvailableRecommendationFeedbackEvents(lifecycleState)', 'authoritative next actions'],
  ['INTELLIGENCE_TRANSITION_INVALID', 'transition-conflict mapping'],
  ['INTELLIGENCE_ACTION_ALREADY_COMPLETED', 'completed-conflict mapping'],
  ['return 409', 'HTTP conflict status'],
  ['"Cache-Control": "private, no-store"', 'feedback private/no-store response'],
  ['.eq("surface", "home")', 'feedback Home family scope'],
  ['.eq("source_version", "r10-p1")', 'feedback P1 source scope'],
]) {
  requireText(feedbackRoute, needle, label);
}

if (/\.from\(["']system_intelligence_recommendations["']\)[\s\S]{0,260}\.(?:insert|update|delete)\(/.test(feedbackRoute)) {
  throw new Error('R10-P2 feedback route must not directly mutate recommendation tables.');
}
if (/\.from\(["']system_intelligence_recommendation_events["']\)[\s\S]{0,260}\.(?:insert|update|delete)\(/.test(feedbackRoute)) {
  throw new Error('R10-P2 feedback route must not directly mutate recommendation event tables.');
}

for (const [needle, label] of [
  ['fetch("/api/intelligence/recommendations/present"', 'client presentation request'],
  ['fetch("/api/intelligence/recommendations/feedback"', 'client feedback request'],
  ['method: "POST"', 'client POST method'],
  ['Deterministic CRM guidance', 'deterministic guidance label'],
  ['they are not conversion probabilities', 'non-probability disclosure'],
  ['Observed evidence', 'observed evidence badge'],
  ['Some recommendation data is temporarily unavailable', 'partial-success disclosure'],
  ['No current deterministic recommendation work', 'zero-work state'],
  ['label="Accept"', 'Accept control'],
  ['label="Start action"', 'Start action control'],
  ['label="Mark complete"', 'Mark complete control'],
  ['Dismiss recommendation?', 'Dismiss confirmation'],
  ['Optional workflow note', 'optional workflow note'],
  ['maxLength={500}', 'client note bound'],
  ['does not claim that the customer or business outcome was successful', 'completion non-outcome disclosure'],
  ['Open work queue', 'separate work-queue navigation'],
  ['getAvailableRecommendationFeedbackEvents(current.lifecycleState)', 'state-derived controls'],
  ['payload?.recommendation', 'authoritative feedback state reconciliation'],
]) {
  requireText(component, needle, label);
}

for (const forbidden of [
  'observe_system_intelligence_recommendation_outcomes_v1',
  'recompute_system_intelligence_learning_profile_v1',
  'conversion_probability',
]) {
  for (const [source, label] of [
    [route, 'presentation route'],
    [feedbackRoute, 'feedback route'],
    [component, 'recommendation UI'],
    [lifecycle, 'lifecycle helper'],
  ]) {
    if (source.includes(forbidden)) {
      throw new Error(`R10-P2 ${label} must not activate P3/predictive behavior: ${forbidden}`);
    }
  }
}

requireText(layout, '<RecommendedActions />', 'Home recommendation surface');
requireText(home, 'title="Action queue"', 'existing factual Action Queue');
requireText(home, 'AttentionRow', 'existing factual Attention cards');

const directMutationGrant = /grant\s+(?:insert|update|delete|truncate|all)[^;]*system_intelligence_recommendation_signal_state[^;]*authenticated/i;
if (directMutationGrant.test(historicalMigration) || directMutationGrant.test(hardeningMigration)) {
  throw new Error('R10 signal episode state must not be directly mutable by authenticated clients.');
}

for (const source of [historicalMigration, hardeningMigration]) {
  for (const forbidden of [
    'insert into public.system_intelligence_recommendations values',
    'insert into public.system_intelligence_recommendation_events values',
    'truncate table public.system_intelligence_recommendations',
    'truncate table public.system_intelligence_recommendation_events',
  ]) {
    if (source.toLowerCase().includes(forbidden)) {
      throw new Error(`R10 migrations must not seed or truncate recommendation evidence: ${forbidden}`);
    }
  }
}

console.log('R10 Command Center Recommendations + P2 Human Feedback contracts verified.');
