const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const migration = fs.readFileSync(path.resolve(
  __dirname, '../../supabase/migrations/20261108120000_r13_commercial_state_foundation_v1.sql'
), 'utf8');
const fixture = fs.readFileSync(path.resolve(
  __dirname, '../database/r13-commercial-state-full-local.sql'
), 'utf8');
const replay = fs.readFileSync(path.resolve(
  __dirname, '../../.github/workflows/migration-replay.yml'
), 'utf8');

test('R13 commercial schema is separate from CRM customer payments and real tenant lifecycle', () => {
  for (const name of [
    'saas_plans', 'saas_plan_entitlements',
    'saas_organization_subscriptions', 'saas_subscription_events',
  ]) {
    assert.match(migration,new RegExp('create table public\\.' + name + '\\s*\\('));
    assert.match(migration,new RegExp('alter table public\\.' + name + ' enable row level security;'));
  }
  assert.match(migration,/create view public\.saas_commercial_readiness_v1\s+with \(security_invoker = true\)/);
  assert.match(migration,/unmanaged_legacy/);
  assert.match(migration,/managed_healthy/);
  assert.match(migration,/managed_attention/);
  assert.match(migration,/foreign key \(subscription_id,organization_id\)/);
  assert.match(migration,/unique index saas_subscription_events_external_once_v1/);
  assert.match(migration,/unique\s*\(id, organization_id\)/);
  assert.doesNotMatch(migration,/\bpublic\.(?:payments|invoices)\b/i);
  assert.doesNotMatch(migration,/\bupdate public\.organizations\b/i);
  assert.doesNotMatch(migration,/\binsert into public\.saas_(?:plans|plan_entitlements|organization_subscriptions)\b/i);
  assert.doesNotMatch(migration,/\b(update|delete|insert into) public\.organization_capabilities\b/i);
});

test('R13 security and append-only audit contract stays explicit', () => {
  assert.match(migration,/revoke all on table[\s\S]+?from public, anon, authenticated;/);
  assert.match(migration,/grant select,insert on table public\.saas_subscription_events to service_role;/);
  assert.match(migration,/revoke all on public\.saas_commercial_readiness_v1 from public, anon, authenticated;/);
  assert.match(migration,/saas_subscription_event_immutable_v1/);
  assert.match(migration,/before update or delete on public\.saas_subscription_events/);
  assert.match(migration,/before truncate on public\.saas_subscription_events/);
  assert.match(migration,/saas_subscription_audit_insert_v1/);
  assert.match(migration,/saas_subscription_audit_update_v1/);
});

test('R13 disposable real Postgres replay is wired and always rolled back', () => {
  assert.match(replay,/Verify R13-P0 commercial state, permissions and audit in disposable Postgres/);
  assert.match(replay,/tests\/database\/r13-commercial-state-full-local\.sql/);
  assert.match(fixture,/\\set ON_ERROR_STOP on/);
  assert.match(fixture,/BEGIN;/);
  assert.match(fixture,/ROLLBACK;/);
  assert.match(fixture,/actual local foundation, authorization, drift, and immutable-audit checks PASSED; ROLLBACK complete/);
  assert.match(fixture,/past_due is COMMERCIAL attention/);
});
