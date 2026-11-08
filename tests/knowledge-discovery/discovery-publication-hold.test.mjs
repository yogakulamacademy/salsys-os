import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {readFileSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';

const require=createRequire(import.meta.url);
const ts=require('typescript');
const path='lib/knowledge-discovery/discovery-publication-hold.ts';
const compiled=ts.transpileModule(readFileSync(resolve(path),'utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
}).outputText;
const hold={};
new Function('exports',compiled)(hold);
const read=p=>readFileSync(resolve(p),'utf8');

test('KB-14A unverified discovery marker blocks publication presentation only',()=>{
  for(const value of [
    {entry_mode:'discovery_manual_review'},
    {manual_review_required:true},
    {source_text_verified:false},
    {entry_mode:'discovery_manual_review',source_text_verified:true},
  ])assert.equal(hold.discoveryPublicationHeld(value),true);
  for(const value of [
    null,undefined,42,'not-an-object',[],{}, {entry_mode:'knowledge_workspace_v2'},
    {source_text_verified:true},{manual_review_required:false},
  ])assert.equal(hold.discoveryPublicationHeld(value),false);
});

test('KB-14A UI lists held drafts but offers Archive rather than generic Approve',()=>{
  const ui=read('app/settings/knowledge/page.tsx');
  assert.match(ui,/discoveryPublicationHeld\(document\.metadata\)/);
  assert.match(ui,/document\.status !== 'approved' && !publicationHeld/);
  assert.match(ui,/Discovery draft held: independent evidence review required/);
  assert.match(ui,/archiveKnowledgeDocumentAction/);
  assert.match(ui,/updated_at, metadata/);
});

test('KB-14A never rewrites the pinned manual Knowledge approval action',()=>{
  const contents=read('app/settings/knowledge/actions.ts');
  const bytes=Buffer.from(contents);
  const sha=createHash('sha1').update('blob '+bytes.byteLength+'\0').update(bytes).digest('hex');
  assert.equal(sha,'30a6ac02c91baefaf440fb979bf6cae94dbd031b',
    'Existing independently pinned manual approval contract must remain unchanged');
  assert.match(contents,/supabase\.rpc\('approve_knowledge_document_v1'/);
  assert.doesNotMatch(contents,/discoveryApprovalPreflight|discoveryPublicationHeld/);
  assert.doesNotMatch(contents,/\.from\('knowledge_documents'\)/);
});

test('KB-14A only disposable SQL protects the direct legacy approval RPC path',()=>{
  const sql=read('docs/sql/KB-14A-unverified-discovery-approval-guard-REHEARSAL-DRAFT.sql');
  assert.match(sql,/KB14A_LOCAL_DISPOSABLE_FIXTURE_REQUIRED/);
  assert.match(sql,/kb14a_hold_unverified_discovery_document/);
  assert.match(sql,/kb14a_hold_unverified_discovery_source/);
  assert.match(sql,/source_text_verified/);
  assert.match(sql,/new\.status not in \('draft','archived'\)/);
  for(const migration of readdirSync(resolve('supabase/migrations')).filter(f=>f.endsWith('.sql'))){
    assert.doesNotMatch(read('supabase/migrations/'+migration),
      /kb14a_hold_discovery_document_publish_v1/i,migration);
  }
});
