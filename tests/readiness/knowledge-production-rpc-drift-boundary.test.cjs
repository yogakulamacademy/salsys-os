'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const actions = read('app/settings/knowledge/actions.ts');
const migration = read('supabase/migrations/20261103190000_ai_knowledge_provenance_readiness_v2.sql');
const release = read('docs/releases/knowledge-provenance-v2-production-repair-2026-11-11.md');

test('Knowledge form and canonical V2 RPC migration use the same exactly named 10-argument contract', () => {
  assert.match(actions, /supabase\.rpc\('create_source_backed_knowledge_document_v2'/);
  assert.match(migration, /create or replace function public\.create_source_backed_knowledge_document_v2\(/i);
  for (const prop of [
    'p_organization_id', 'p_title', 'p_category', 'p_content',
    'p_source_name', 'p_source_type', 'p_source_uri',
    'p_valid_from', 'p_valid_until', 'p_approve',
  ]) {
    assert.match(actions, new RegExp('\\b' + prop + '\\s*:'));
    assert.match(migration, new RegExp('\\b' + prop + '\\s+(?:uuid|text|timestamptz|boolean)\\b', 'i'));
  }
});

test('Repair contract remains a single privileged tenant-scoped creation function', () => {
  const createCount = (migration.match(/^create or replace function/igm) || []).length;
  assert.equal(createCount, 1);
  assert.match(migration, /security definer/i);
  assert.match(migration, /set search_path = public, auth, pg_temp/i);
  assert.match(migration, /public\.can_manage_organization\(p_organization_id\)/);
  assert.match(migration, /raise exception 'Only organization admins can manage AI knowledge'/);
  assert.match(migration, /revoke all on function public\.create_source_backed_knowledge_document_v2\([\s\S]*?\) from public, anon;/i);
  assert.match(migration, /grant execute on function public\.create_source_backed_knowledge_document_v2\([\s\S]*?\) to authenticated, service_role;/i);
  assert.match(migration, /insert into public\.knowledge_sources/i);
  assert.match(migration, /insert into public\.knowledge_documents/i);
  assert.match(migration, /insert into public\.knowledge_chunks/i);
  assert.match(migration, /insert into public\.knowledge_approvals/i);
  assert.doesNotMatch(migration, /\b(?:drop|truncate|alter)\s+(?:table|policy)\b/i);
  assert.doesNotMatch(migration, /\b(?:http_get|http_post|net\.http|invoke_model|fetch\()\b/i);
});

test('Production repair runbook preserves explicit release and staging gates', () => {
  assert.match(release, /#694/);
  assert.match(release, /20261103190000_ai_knowledge_provenance_readiness_v2\.sql/);
  assert.match(release, /Owner:.*Authorize this.*specific production DDL/i);
  assert.match(release, /Independent security\/DBA reviewer/i);
  assert.match(release, /do not invoke `db push` if it would apply/i);
  assert.match(release, /ON HOLD/);
  assert.match(release, /0\/16/);
  assert.match(release, /no automatic replies/i);
});
