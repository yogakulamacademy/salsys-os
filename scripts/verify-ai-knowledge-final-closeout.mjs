import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function expectIncludes(source, needle, label) {
  if (!source.includes(needle)) {
    throw new Error(`AI Knowledge final closeout verification failed: ${label}`);
  }
}

function expectNotIncludes(source, needle, label) {
  if (source.includes(needle)) {
    throw new Error(`AI Knowledge final closeout verification failed: ${label}`);
  }
}

const actions = read('app/settings/knowledge/actions.ts');
const knowledgePage = read('app/settings/knowledge/page.tsx');
const settingsLayout = read('app/settings/layout.tsx');
const copilot = read('app/conversations/copilot-actions.ts');
const lifecycleMigration = read('supabase/migrations/20261101063000_ai_knowledge_final_closeout_v1.sql');
const retrievalMigration = read('supabase/migrations/20261016182500_fix_organization_knowledge_search_v1.sql');
const provenanceMigration = read('supabase/migrations/20261103190000_ai_knowledge_provenance_readiness_v2.sql');

for (const [needle, label] of [
  ['create or replace function public.create_knowledge_document_v1(', 'legacy atomic create RPC must remain available'],
  ['create or replace function public.approve_knowledge_document_v1(', 'atomic approve RPC must exist'],
  ['create or replace function public.archive_knowledge_document_v1(', 'atomic archive RPC must exist'],
  ['security definer', 'knowledge lifecycle RPCs must execute behind a controlled security boundary'],
  ['public.can_manage_organization(p_organization_id)', 'knowledge lifecycle RPCs must enforce owner/admin tenant management'],
  ['insert into public.knowledge_chunks', 'create/approve transactions must own retrieval indexing'],
  ['insert into public.knowledge_approvals', 'approval/archive transactions must own append-only governance history'],
  ["if v_status in ('archived', 'superseded') then", 'retired knowledge must not be reactivated by approval'],
  ['for update;', 'lifecycle transitions must lock the tenant document before mutation'],
  ['revoke all on function public.create_knowledge_document_v1(uuid, text, text, text, boolean) from public, anon;', 'legacy atomic create RPC must deny anonymous execution'],
  ['revoke all on function public.approve_knowledge_document_v1(uuid, uuid) from public, anon;', 'atomic approve RPC must deny anonymous execution'],
  ['revoke all on function public.archive_knowledge_document_v1(uuid, uuid) from public, anon;', 'atomic archive RPC must deny anonymous execution'],
  ['grant execute on function public.create_knowledge_document_v1(uuid, text, text, text, boolean) to authenticated, service_role;', 'legacy atomic create RPC must be authenticated/service-role only'],
  ['grant execute on function public.approve_knowledge_document_v1(uuid, uuid) to authenticated, service_role;', 'atomic approve RPC must be authenticated/service-role only'],
  ['grant execute on function public.archive_knowledge_document_v1(uuid, uuid) to authenticated, service_role;', 'atomic archive RPC must be authenticated/service-role only'],
]) {
  expectIncludes(lifecycleMigration.toLowerCase(), needle.toLowerCase(), label);
}

for (const [needle, label] of [
  ['create or replace function public.create_source_backed_knowledge_document_v2(', 'source-backed create RPC must exist'],
  ['security definer', 'source-backed create must use a controlled security boundary'],
  ['public.can_manage_organization(p_organization_id)', 'source-backed create must enforce tenant admin management'],
  ['insert into public.knowledge_sources', 'source-backed create must atomically create provenance'],
  ['insert into public.knowledge_documents', 'source-backed create must create the linked document'],
  ['v_source_id', 'source-backed create must bind the source to the document'],
  ['p_valid_from timestamptz', 'source-backed create must accept a validity start'],
  ['p_valid_until timestamptz', 'source-backed create must accept a validity end'],
  ["'source_name', v_source_name", 'document metadata must retain a minimized source citation'],
  ["'source_type', v_source_type", 'document metadata must retain source type'],
  ["'source_uri', v_source_uri", 'document metadata must retain the safe source reference'],
  ["v_source_uri !~* '^https?://", 'source references must be constrained to http/https without fetching them'],
  ['revoke all on function public.create_source_backed_knowledge_document_v2(', 'source-backed create must revoke public/anonymous execution'],
  [') from public, anon;', 'source-backed create must explicitly deny public and anonymous execution'],
  ['grant execute on function public.create_source_backed_knowledge_document_v2(', 'source-backed create must grant only controlled execution'],
  [') to authenticated, service_role;', 'source-backed create must be authenticated/service-role only'],
  ['Source URLs are recorded as provenance only and are never fetched by this function.', 'source URL must remain passive provenance'],
]) {
  expectIncludes(provenanceMigration, needle, label);
}

for (const [needle, label] of [
  ["supabase.rpc('create_source_backed_knowledge_document_v2'", 'create action must use the source-backed atomic RPC'],
  ["supabase.rpc('approve_knowledge_document_v1'", 'approve action must keep the atomic approve RPC'],
  ["supabase.rpc('archive_knowledge_document_v1'", 'archive action must keep the atomic archive RPC'],
  ["supabase.rpc(\n    'can_manage_organization'", 'web actions must retain defense-in-depth owner/admin authorization'],
  ['requireCurrentOrganizationId', 'web actions must stay bound to the active tenant'],
  ["textValue(formData, 'source_name')", 'create action must require provenance name'],
  ["textValue(formData, 'source_type')", 'create action must capture provenance type'],
  ["textValue(formData, 'source_uri')", 'create action must validate the optional source reference'],
  ["textValue(formData, 'valid_from')", 'create action must capture validity start'],
  ["textValue(formData, 'valid_until')", 'create action must capture validity end'],
]) {
  expectIncludes(actions, needle, label);
}

for (const forbidden of [
  ".from('knowledge_documents')",
  ".from('knowledge_chunks')",
  ".from('knowledge_approvals')",
  ".from('knowledge_sources')",
]) {
  expectNotIncludes(actions, forbidden, `knowledge server actions must not perform multi-step direct writes via ${forbidden}`);
}

for (const [needle, label] of [
  ["kd.status = 'approved'", 'retrieval must remain approved-only'],
  ['kd.valid_from is null or kd.valid_from <= now()', 'retrieval must preserve valid-from gating'],
  ['kd.valid_until is null or kd.valid_until > now()', 'retrieval must preserve expiry gating'],
  ["ks.id is null or ks.status = 'active'", 'retrieval must preserve active-source gating'],
  ['public.is_organization_member(p_organization_id)', 'retrieval must remain tenant-member scoped'],
  ['revoke all on function public.search_organization_knowledge_v1(uuid, text, integer) from public;', 'retrieval must deny public/anonymous execution'],
]) {
  expectIncludes(retrievalMigration, needle, label);
}

expectIncludes(copilot, "supabase.rpc(\n      'search_organization_knowledge_v1'", 'Co-Pilot must use the canonical approved-knowledge retrieval RPC');
expectNotIncludes(copilot, ".from('knowledge_documents')", 'Co-Pilot must not bypass retrieval rules through direct knowledge-document reads');
expectNotIncludes(copilot, ".from('knowledge_chunks')", 'Co-Pilot must not bypass retrieval rules through direct knowledge-chunk reads');
expectIncludes(copilot, 'You draft a message for a human admissions team member to review and send. You never send messages yourself.', 'AI Knowledge closeout must preserve human-reviewed Co-Pilot behavior');

expectIncludes(settingsLayout, 'requirePrivilegedWorkspaceAccess', 'AI Knowledge must remain under the privileged Settings route boundary');
expectIncludes(knowledgePage, "supabase.rpc('can_manage_organization'", 'Knowledge page must keep owner/admin manage detection');
expectIncludes(knowledgePage, 'The Co-Pilot can use only approved, currently valid knowledge', 'Knowledge UI must describe the actual retrieval authority rule');
expectIncludes(knowledgePage, 'source_name', 'Knowledge UI must capture a source name');
expectIncludes(knowledgePage, 'source_type', 'Knowledge UI must capture a source type');
expectIncludes(knowledgePage, 'source_uri', 'Knowledge UI must support an optional source reference');
expectIncludes(knowledgePage, 'valid_from', 'Knowledge UI must expose validity start');
expectIncludes(knowledgePage, 'valid_until', 'Knowledge UI must expose validity end');
expectIncludes(knowledgePage, 'source review needed', 'Knowledge UI must identify legacy approved items without provenance instead of inventing a backfill');
expectIncludes(knowledgePage, 'SalsysOS does not fetch this URL', 'Knowledge UI must state that source references are passive provenance');

console.log('AI Knowledge final closeout and provenance readiness contracts verified.');
