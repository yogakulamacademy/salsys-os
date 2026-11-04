const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { load } = require('./helpers.cjs');

const { evaluatePilotApproval } = load('lib/ai/pilot-approval-status.ts');
const now = new Date('2026-11-04T20:00:00Z');
const signed = {
  policy_version: 'lead_insight_pilot_v1',
  privacy_approved_at: '2026-11-01T00:00:00Z',
  retention_approved_at: '2026-11-02T00:00:00Z',
  provider_budget_verified_at: '2026-11-02T00:00:00Z',
  quality_review_approved_at: '2026-11-03T00:00:00Z',
  approved_by: '11111111-1111-4111-8111-111111111111',
  approval_reference: 'approval-document-reference-2026',
  expires_at: '2026-12-04T00:00:00Z',
  revoked_at: null,
};

test('no approval record is a blocking default, never an inferred approval', () => {
  assert.deepEqual(evaluatePilotApproval(null, now), { status: 'missing', approved: false });
});

test('complete valid approval evaluates approved as a read-only indicator', () => {
  assert.deepEqual(evaluatePilotApproval(signed, now), { status: 'approved', approved: true });
  assert.equal(evaluatePilotApproval({ ...signed, approved_by: null }, now).approved, false);
  assert.equal(evaluatePilotApproval({ ...signed, approval_reference: null }, now).approved, false);
  assert.equal(evaluatePilotApproval({ ...signed, approval_reference: 'short' }, now).approved, false);
});

test('partial, future-dated, wrong-version, revoked and expired records deny', () => {
  const cases = [
    [{ ...signed, privacy_approved_at: null }, 'partial'],
    [{ ...signed, quality_review_approved_at: null }, 'partial'],
    [{ ...signed, retention_approved_at: '2027-01-01T00:00:00Z' }, 'partial'],
    [{ ...signed, provider_budget_verified_at: null }, 'partial'],
    [{ ...signed, policy_version: 'obsolete_v0' }, 'partial'],
    [{ ...signed, revoked_at: '2026-11-04T12:00:00Z' }, 'revoked'],
    [{ ...signed, expires_at: '2026-11-04T19:59:59Z' }, 'expired'],
    [{ ...signed, expires_at: null }, 'expired'],
  ];
  for (const [row, status] of cases) {
    assert.deepEqual(evaluatePilotApproval(row, now), { status, approved: false });
  }
});

test('database quota reservation requires approvals in the same atomic transaction', () => {
  const sql = readFileSync('supabase/migrations/20261104235900_ai_lead_insight_pilot_approval_gate_v1.sql', 'utf8');
  for (const fragment of [
    'create table if not exists public.ai_lead_insight_pilot_approvals',
    'force row level security',
    'from public, anon, authenticated',
    'grant select, insert, update on public.ai_lead_insight_pilot_approvals to service_role',
    'security definer',
    "a.policy_version = 'lead_insight_pilot_v1'",
    'a.privacy_approved_at <= now()',
    'a.retention_approved_at <= now()',
    'a.provider_budget_verified_at <= now()',
    'a.quality_review_approved_at <= now()',
    'a.approved_by is not null',
    'a.expires_at > now()',
    'a.revoked_at is null',
    'if not exists (',
    "period_kind, period_start, attempt_count",
    'attempt_count < v_daily_limit',
    'attempt_count < v_hourly_limit',
    'to service_role',
  ]) assert.ok(sql.includes(fragment), fragment);
  assert.doesNotMatch(sql, /\bcreate\s+policy\b/i);
  assert.doesNotMatch(sql, /\binsert\s+into\s+public\.ai_lead_insight_pilot_approvals\b/i);
  const guard = sql.indexOf('from public.ai_lead_insight_pilot_approvals a');
  const reservation = sql.indexOf('insert into public.ai_lead_insight_quota_counters');
  assert.ok(guard > 0 && reservation > guard);
});

test('application monitoring reads approvals without offering a self-activation surface', () => {
  const server = readFileSync('lib/ai/pilot-status.ts', 'utf8');
  const ui = readFileSync('app/settings/ai-insights/page.tsx', 'utf8');
  assert.match(server, /evaluatePilotApproval\(approval\.data, now\)/);
  assert.match(server, /\.eq\('organization_id', organizationId\)\.maybeSingle\(\)/);
  assert.match(ui, /status\.governance\.status/);
  assert.match(ui, /cannot create, extend, or revoke/);
  assert.doesNotMatch(ui, /'use client'|submitApproval|grantConsent|setApproval|enableAi/);
  assert.doesNotMatch(server, /ai_lead_insight_pilot_approvals'\)\s*\.insert\(/);
});
