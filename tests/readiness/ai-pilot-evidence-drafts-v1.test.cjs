const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { load } = require('./helpers.cjs');

const validator = load('lib/ai/pilot-evidence-validation.ts');

test('evidence IDs accept only constrained, non-content references', () => {
  assert.equal(validator.parseEvidenceReference('  privacy-review-v1  '), 'PRIVACY-REVIEW-V1');
  assert.equal(validator.parseEvidenceReference(''), null);
  assert.equal(validator.parseEvidenceReference(null), null);
  for (const bad of [
    'short', 'has spaces here', 'test@example.com', 'https://example.org/document',
    'AKIA1234567890123456!', 'x'.repeat(101), 'line\nbreak',
    '<script>alert(1)</script>', 'secret=abcdefg',
  ]) assert.throws(() => validator.parseEvidenceReference(bad));
  assert.deepEqual(validator.parsePilotEvidenceDraft({
    privacy_ref: 'PRIVACY-REVIEW-V1',
    retention_ref: '',
    provider_budget_ref: 'BUDGET-CHECK-2026',
    quality_review_ref: null,
  }), {
    privacy_ref: 'PRIVACY-REVIEW-V1',
    retention_ref: null,
    provider_budget_ref: 'BUDGET-CHECK-2026',
    quality_review_ref: null,
  });
});

function setup(options = {}) {
  const calls = { admin: 0, selects: [], inserts: [], reads: [] };
  const session = {
    auth: { getUser: async () => ({
      data: { user: options.anonymous ? null : { id: 'owner-synthetic' } },
      error: null,
    }) },
    from(table) {
      assert.equal(table, 'organization_members');
      const filters = [];
      return {
        select() { return this; },
        eq(key, value) { filters.push([key, value]); return this; },
        maybeSingle: async () => {
          calls.reads.push(filters);
          return { data: {
            role: options.memberRole ?? 'owner',
            active: options.inactive !== true,
          }, error: options.memberError ? { message: 'membership unavailable' } : null };
        },
      };
    },
  };

  const admin = {
    from(table) {
      assert.equal(table, 'ai_lead_insight_review_packet_drafts');
      const filters = [];
      return {
        select(columns) {
          calls.selects.push(columns);
          return this;
        },
        eq(field, value) { filters.push([field, value]); return this; },
        order() { return this; },
        limit() { return this; },
        maybeSingle: async () => {
          assert.ok(filters.some(([key, value]) => key === 'organization_id' && value === 'org-owner'));
          return { data: options.latest ?? null, error: null };
        },
        insert(data) {
          calls.inserts.push({ table, data });
          return { select() {
            return { single: async () => options.insertError
              ? { data: null, error: { message: 'Private database details' } }
              : { data: { id: 'draft-id' }, error: null } };
          } };
        },
      };
    },
  };

  const mod = load('lib/ai/pilot-evidence-drafts.ts', {
    'server-only': {},
    '@/lib/supabase/server': { createClient: async () => session },
    '@/lib/supabase/admin': { createAdminClient: () => {
      calls.admin += 1;
      return admin;
    } },
    '@/lib/workspace': { getCurrentWorkspaceContext: async () => ({
      activeOrganizationId: options.wrongOrg ? 'another-org' : 'org-owner',
      activeWorkspace: {
        organizationId: 'org-owner',
        organizationName: 'Synthetic Organization',
        role: options.workspaceRole ?? 'owner',
      },
    }) },
    '@/lib/config': { useMockData: options.mock === true },
    '@/lib/ai/pilot-evidence-validation': validator,
  });
  return { mod, calls };
}

test('nonowners, inactive members and unauthenticated users cannot read or write drafts', async () => {
  for (const scenario of [
    { anonymous: true }, { mock: true }, { workspaceRole: 'admin' },
    { workspaceRole: 'viewer' }, { memberRole: 'admin' },
    { memberError: true }, { inactive: true }, { wrongOrg: true },
  ]) {
    const f = setup(scenario);
    assert.equal(await f.mod.getPilotEvidenceDraft(), null);
    await assert.rejects(
      f.mod.savePilotEvidenceDraft({ privacy_ref: 'PRIVACY-REVIEW-2026' }),
      /requires the current organization owner/,
    );
    assert.equal(f.calls.admin, 0);
    assert.equal(f.calls.inserts.length, 0);
  }
});

test('owner reads only the active tenant and stores an append-only draft', async () => {
  const f = setup({ latest: {
    created_at: '2026-11-05T00:00:00Z',
    privacy_ref: 'PRIVACY-REVIEW-2026',
    retention_ref: null,
    provider_budget_ref: null,
    quality_review_ref: null,
  } });
  const response = await f.mod.getPilotEvidenceDraft();
  assert.equal(response.organizationName, 'Synthetic Organization');
  assert.equal(response.latest.privacy_ref, 'PRIVACY-REVIEW-2026');
  await f.mod.savePilotEvidenceDraft({
    privacy_ref: 'PRIVACY-REVIEW-2026',
    retention_ref: 'RETENTION-PLAN-2026',
    provider_budget_ref: null,
    quality_review_ref: null,
  });
  assert.equal(f.calls.inserts.length, 1);
  assert.deepEqual(f.calls.inserts[0].data, {
    organization_id: 'org-owner',
    authored_by: 'owner-synthetic',
    policy_version: 'lead_insight_pilot_v1',
    privacy_ref: 'PRIVACY-REVIEW-2026',
    retention_ref: 'RETENTION-PLAN-2026',
    provider_budget_ref: null,
    quality_review_ref: null,
  });
  assert.equal(f.calls.inserts[0].table, 'ai_lead_insight_review_packet_drafts');
  assert.doesNotMatch(JSON.stringify(f.calls.inserts), /ai_lead_insight_pilot_approvals|api_key|message_body/);
});

test('invalid references and write failures do not report success', async () => {
  const invalid = setup();
  await assert.rejects(
    invalid.mod.savePilotEvidenceDraft({ privacy_ref: 'my real text with names' }),
    /evidence reference/,
  );
  assert.equal(invalid.calls.inserts.length, 0);
  const failed = setup({ insertError: true });
  await assert.rejects(
    failed.mod.savePilotEvidenceDraft({ quality_review_ref: 'QUALITY-REVIEW-2026' }),
    /draft could not be saved/,
  );
});

test('database is append-only, tenant-keyed and inaccessible to client roles', () => {
  const sql = readFileSync('supabase/migrations/20261105001000_ai_lead_insight_review_packet_drafts_v1.sql', 'utf8');
  for (const fragment of [
    'create table if not exists public.ai_lead_insight_review_packet_drafts',
    'organization_id uuid not null references public.organizations',
    'authored_by uuid references auth.users',
    'force row level security',
    'from public, anon, authenticated',
    'grant select, insert on public.ai_lead_insight_review_packet_drafts to service_role',
  ]) assert.ok(sql.includes(fragment), fragment);
  assert.doesNotMatch(sql, /grant (?:update|delete) on public\.ai_lead_insight_review_packet_drafts/i);
  assert.doesNotMatch(sql, /create\s+policy\b/i);
  assert.doesNotMatch(sql, /ai_lead_insight_pilot_approvals\s+set|insert into\s+public\.ai_lead_insight_pilot_approvals/i);
});

test('owner-only form is nonactivating and has mandatory server permission enforcement', () => {
  const page = readFileSync('app/settings/ai-insights/evidence/page.tsx', 'utf8');
  const action = readFileSync('app/settings/ai-insights/evidence/actions.ts', 'utf8');
  const monitoring = readFileSync('app/settings/ai-insights/page.tsx', 'utf8');
  assert.match(page, /if \(!data\) notFound\(\)/);
  assert.match(page, /form action=\{savePilotEvidenceDraftAction\}/);
  assert.match(action, /await savePilotEvidenceDraft/);
  assert.match(monitoring, /status\.canPrepareEvidence/);
  assert.match(monitoring, /Prepare evidence references \(draft only\)/);
  assert.doesNotMatch(action, /ai_lead_insight_pilot_approvals|tenant_policies|ANTHROPIC|enableAi/);
  assert.doesNotMatch(page, /grant approval|approve pilot|Enable Claude/);
});

test('the second migration removes inherited service-role write privileges', () => {
  const sql = readFileSync('supabase/migrations/20261105002000_ai_lead_insight_review_packet_append_only_grants_v1.sql', 'utf8');
  assert.ok(sql.includes('revoke all on table public.ai_lead_insight_review_packet_drafts from service_role'));
  assert.ok(sql.includes('grant select, insert on table public.ai_lead_insight_review_packet_drafts to service_role'));
  assert.doesNotMatch(sql, /grant\s+(?:update|delete|all)\b/i);
});
