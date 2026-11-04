const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { load } = require('./helpers.cjs');

function setup(options = {}) {
  const previousFlag = process.env.AI_LEAD_INSIGHTS_QUOTAS_ENABLED;
  process.env.AI_LEAD_INSIGHTS_QUOTAS_ENABLED = options.disabled ? 'false' : 'true';

  const calls = { admin: 0, access: 0, reservation: 0 };
  const session = {
    auth: {
      getUser: async () => ({ data: { user: options.unauthenticated ? null : { id: 'staff-user' } }, error: null }),
    },
    rpc: async (name, args) => {
      assert.equal(name, 'can_work_lead');
      assert.equal(args.p_lead_id, 'lead-1');
      calls.access += 1;
      return { data: !options.denyLead, error: null };
    },
  };
  const reserve = load('lib/ai/lead-insight-quota.ts', {
    'server-only': {},
    '@/lib/supabase/server': { createClient: async () => session },
    '@/lib/workspace': {
      requireCurrentOrganizationId: async () => options.wrongOrg ? 'org-2' : 'org-1',
    },
    '@/lib/supabase/admin': {
      createAdminClient: () => {
        calls.admin += 1;
        return {
          rpc: async (name, args) => {
            assert.equal(name, 'reserve_ai_lead_insight_generation_v1');
            assert.deepEqual(args, {
              p_organization_id: 'org-1',
              p_user_id: 'staff-user',
              p_lead_id: 'lead-1',
            });
            calls.reservation += 1;
            if (options.dbError) return { data: null, error: { message: 'Synthetic internal database message' } };
            return { data: !options.tenantDisabled, error: null };
          },
        };
      },
    },
  }).reserveLeadInsightGeneration;

  return {
    reserve, calls,
    restore() {
      if (previousFlag === undefined) delete process.env.AI_LEAD_INSIGHTS_QUOTAS_ENABLED;
      else process.env.AI_LEAD_INSIGHTS_QUOTAS_ENABLED = previousFlag;
    },
  };
}

test('quota feature flag prevents any user and admin queries when disabled', async () => {
  const f = setup({ disabled: true });
  try {
    const result = await f.reserve('org-1', 'lead-1');
    assert.equal(result.ok, false);
    assert.equal(f.calls.admin, 0);
    assert.equal(f.calls.access, 0);
  } finally { f.restore(); }
});

test('unauthenticated, wrong-org and denied lead cannot reserve model budget', async () => {
  for (const options of [{ unauthenticated: true }, { wrongOrg: true }, { denyLead: true }]) {
    const f = setup(options);
    try {
      const result = await f.reserve('org-1', 'lead-1');
      assert.equal(result.ok, false);
      assert.equal(f.calls.admin, 0);
    } finally { f.restore(); }
  }
});

test('valid staff member can reserve only with explicit tenant opt-in', async () => {
  const f = setup();
  try {
    const result = await f.reserve('org-1', 'lead-1');
    assert.deepEqual(result, { ok: true });
    assert.equal(f.calls.access, 1);
    assert.equal(f.calls.reservation, 1);
  } finally { f.restore(); }

  const disabled = setup({ tenantDisabled: true });
  try {
    const result = await disabled.reserve('org-1', 'lead-1');
    assert.equal(result.ok, false);
  } finally { disabled.restore(); }
});

test('database failure does not disclose operational details', async () => {
  const f = setup({ dbError: true });
  try {
    const result = await f.reserve('org-1', 'lead-1');
    assert.equal(result.ok, false);
    assert.doesNotMatch(result.error, /Synthetic internal database message/);
  } finally { f.restore(); }
});

test('SQL quota gate enforces atomic dual counters and denies browser permissions', () => {
  const source = readFileSync('supabase/migrations/20261104214500_ai_lead_insight_usage_gate_v1.sql', 'utf8');
  for (const token of [
    'enabled boolean not null default false',
    "period_kind in ('org_day', 'user_hour')",
    'security definer',
    'where om.organization_id = p_organization_id',
    'om.user_id = p_user_id and om.active = true',
    'on conflict (organization_id, actor_key, period_kind, period_start)',
    'attempt_count < v_daily_limit',
    'attempt_count < v_hourly_limit',
    'from public, anon, authenticated',
    'to service_role',
  ]) assert.ok(source.includes(token), token);
  assert.doesNotMatch(source, /create\s+policy\b/i);
});

test('C4 is opt-in on Inbox and has no automatic send path', () => {
  const inbox = readFileSync('app/conversations/page.tsx', 'utf8');
  const component = readFileSync('components/ai-lead-insight-panel.tsx', 'utf8');
  const action = readFileSync('app/leads/insights-actions.ts', 'utf8');
  assert.match(inbox, /AI_LEAD_INSIGHTS_UI_ENABLED/);
  assert.match(inbox, /AILeadInsightPanel/);
  assert.match(component, /Generate/);
  assert.match(component, /Manual review required/);
  assert.match(component, /submitLeadInsightFeedbackAction/);
  assert.match(component, /evidence\.map/);
  assert.match(action, /await reserveLeadInsightGeneration/);
  assert.doesNotMatch(component, /sendWhatsApp|sendInstagram|markPaid|automaticReply/);
});
