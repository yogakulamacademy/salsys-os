import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import pg from 'pg';

const {Client}=pg;
const file=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const ORG_A='10000000-0000-4000-8000-000000000001';
const ORG_B='10000000-0000-4000-8000-000000000002';
const USER_A='20000000-0000-4000-8000-000000000001';
const USER_B='20000000-0000-4000-8000-000000000002';
const EMPLOYEE='20000000-0000-4000-8000-000000000003';
const SID_A='30000000-0000-4000-8000-000000000001';
const SID_B='30000000-0000-4000-8000-000000000002';
const SID_E='30000000-0000-4000-8000-000000000003';
const HOST='fixture.example.com';
const SITE='https://'+HOST+'/';
const POLICY='synthetic-kb11a-nonlegal';
const SHA='a'.repeat(64);
const DRAFT='select public.create_discovery_review_draft_with_current_consent_v1($1,$2,$3,$4,$5) as result';
const WITHDRAW='select public.withdraw_knowledge_discovery_consent_v1($1,$2,$3) as result';
const APPROVE='select public.approve_knowledge_document_v1($1,$2) as result';
const SEARCH='select document_id,title,content from public.search_organization_knowledge_v1($1,$2,$3)';
const TITLE='Verified manually entered course facts';
const CONTENT='These are synthetic handwritten review notes, not captured website evidence.';
const SIGNATURE='public.create_discovery_review_draft_with_current_consent_v1(uuid,uuid,text,text,text)';

function requireLocal(){
  assert.equal(process.env.SALSYS_ALLOW_LOCAL_DB_TESTS,'1');
  const url=new URL(process.env.SALSYS_TEST_DATABASE_URL||'');
  assert.equal(url.protocol,'postgres:');
  assert.ok(['127.0.0.1','localhost'].includes(url.hostname),'Hosted PostgreSQL forbidden');
  assert.equal(url.username,'postgres');
  assert.equal(url.pathname,'/postgres','Must create independent throwaway database');
  assert.equal(url.search,'');
  return url;
}

async function beginAs(db,role,actor=USER_A,sid=SID_A){
  await db.query('begin');
  await db.query("set local statement_timeout = '9s'");
  await db.query("set local lock_timeout = '7s'");
  await db.query('set local role '+role);
  await db.query("select set_config('request.jwt.claims',$1,true)",[
    JSON.stringify({role,sub:actor,session_id:sid}),
  ]);
}
async function callAs(db,role,query,args=[],actor=USER_A,sid=SID_A){
  await beginAs(db,role,actor,sid);
  try {
    const result=await db.query(query,args);
    await db.query('commit');
    return result;
  } catch(err){
    await db.query('rollback');
    throw err;
  }
}

test('KB-11A: local-only consent-atomic discovered-page draft SQL and negative isolation',async()=>{
  const base=requireLocal();
  const dbName='salsys_kb11a_'+randomUUID().replaceAll('-','').slice(0,18);
  const target=new URL(base);target.pathname='/'+dbName;
  const admin=new Client({connectionString:base.toString()});
  const clients=[];
  let made=false;
  await admin.connect();
  const open=async()=>{const c=new Client({connectionString:target.toString()});await c.connect();clients.push(c);return c;};
  try {
    await admin.query('create database "'+dbName+'"');made=true;
    const root=await open();
    assert.equal((await root.query("select to_regclass('public.knowledge_documents') as value")).rows[0].value,null);

    await root.query(file('./knowledge-discovery.foundation.sql'));
    await root.query(file('../../docs/sql/KB-01B-discovery-schema-DRAFT.sql'));
    await root.query(file('../../docs/sql/KB-06A-discovery-consent-execution-DRAFT.sql'));
    // ONLY synthetic stand-ins for Auth session and tenant-binding tables.
    await root.query([
      "alter table public.organizations add column status text not null default 'active'",
      "create table public.organization_members (organization_id uuid not null,user_id uuid not null,role text not null,active boolean not null)",
      "create table public.tenant_session_bindings(session_id uuid primary key,user_id uuid not null,organization_id uuid not null)",
      "create table auth.sessions(id uuid primary key,user_id uuid not null)",
      "create function auth.uid() returns uuid language sql stable as $fn$ select nullif(auth.jwt()->>'sub','')::uuid $fn$",
      "grant usage on schema auth to authenticated",
      "grant execute on function auth.uid() to authenticated",
      "create table public.organization_onboarding(organization_id uuid primary key,website_url text)",
      "create table public.knowledge_sources(id uuid primary key default gen_random_uuid(),organization_id uuid not null,source_type text not null,name text not null,source_uri text,status text not null,metadata jsonb not null default '{}'::jsonb,created_by uuid)",
      "create table public.knowledge_documents(id uuid primary key default gen_random_uuid(),organization_id uuid not null,source_id uuid references public.knowledge_sources(id) on delete restrict,title text not null,category text not null,content text not null,status text not null check(status in ('draft','review','approved','archived')),created_by uuid,approved_by uuid,approved_at timestamptz,version integer not null default 1,valid_from timestamptz,valid_until timestamptz,updated_at timestamptz not null default now(),metadata jsonb not null default '{}'::jsonb)",
      "create table public.knowledge_chunks(id uuid primary key default gen_random_uuid(),organization_id uuid not null,document_id uuid not null references public.knowledge_documents(id) on delete restrict,chunk_index integer not null,content text not null,metadata jsonb not null default '{}'::jsonb,search_vector tsvector generated always as (to_tsvector('simple',coalesce(content,''))) stored)",
      "create table public.knowledge_approvals(id uuid primary key default gen_random_uuid(),organization_id uuid not null,document_id uuid not null,action text not null,reviewer_id uuid,note text)",
      "create function public.is_organization_member(p_organization_id uuid) returns boolean language sql stable security definer set search_path=public,auth,pg_temp as $member$ select exists (select 1 from public.organization_members m where m.organization_id=p_organization_id and m.user_id=auth.uid() and m.active=true and auth.jwt()->>'role'='authenticated') $member$",
      "grant execute on function public.is_organization_member(uuid) to authenticated,service_role",
      "revoke all on public.knowledge_sources,public.knowledge_documents,public.knowledge_chunks,public.knowledge_approvals from public,anon,authenticated,service_role",
    ].join(';\n')+';');
    await root.query(file('../../docs/sql/KB-06B-audited-discovery-consent-lifecycle-DRAFT.sql'));
    const sql=file('../../docs/sql/KB-11A-consent-atomic-discovered-draft-REHEARSAL-DRAFT.sql');
    assert.match(sql,/KB11A_LOCAL_DISPOSABLE_FIXTURE_REQUIRED/);
    assert.doesNotMatch(sql,/drop\s+table|drop\s+schema|grant\s+all\s+on\s+public/ig);
    await root.query(sql);

    // KB-14A loads the EXACT generic approval function from the existing
    // production migration, but only in this throwaway synthetic database.
    // The consent-atomic draft must never become AI retrieval eligible via
    // that older admin RPC or via direct privileged UPDATE.
    await root.query("create function auth.role() returns text language sql stable as $fn$ select auth.jwt()->>'role' $fn$");
    const legacy=file('../../supabase/migrations/20261101063000_ai_knowledge_final_closeout_v1.sql');
    const approvalStart=legacy.indexOf('create or replace function public.approve_knowledge_document_v1(');
    const approvalEnd=legacy.indexOf('\n$function$;',approvalStart);
    assert.ok(approvalStart>=0 && approvalEnd>approvalStart,'Exact shipped approval function found');
    await root.query(legacy.slice(approvalStart,approvalEnd+'\n$function$;'.length));
    await root.query('revoke all on function public.approve_knowledge_document_v1(uuid,uuid) from public,anon');
    await root.query('grant execute on function public.approve_knowledge_document_v1(uuid,uuid) to authenticated');
    const approvalGuard=file('../../docs/sql/KB-14A-unverified-discovery-approval-guard-REHEARSAL-DRAFT.sql');
    assert.match(approvalGuard,/KB14A_LOCAL_DISPOSABLE_FIXTURE_REQUIRED/);
    assert.doesNotMatch(approvalGuard,/drop\s+table|drop\s+schema|grant\s+all\s+on\s+public/ig);
    await root.query(approvalGuard);

    const grants=(await root.query(
      "select has_function_privilege('authenticated',$1,'execute') as authenticated,"+
      "has_function_privilege('anon',$1,'execute') as anon,"+
      "has_function_privilege('service_role',$1,'execute') as service",
      [SIGNATURE])).rows[0];
    assert.deepEqual(grants,{authenticated:true,anon:false,service:false});
    await root.query('insert into public.organizations(id) values($1),($2)',[ORG_A,ORG_B]);
    await root.query('insert into public.test_knowledge_admins(organization_id,user_id) values($1,$2)',[ORG_A,USER_A]);
    await root.query(
      'insert into public.organization_members(organization_id,user_id,role,active) values($1,$2,$3,true),($4,$5,$6,true),($7,$8,$9,true)',
      [ORG_A,USER_A,'owner',ORG_B,USER_B,'admin',ORG_A,EMPLOYEE,'employee']);
    await root.query('insert into auth.sessions(id,user_id) values($1,$2),($3,$4),($5,$6)',
      [SID_A,USER_A,SID_B,USER_B,SID_E,EMPLOYEE]);
    await root.query('insert into public.tenant_session_bindings(session_id,user_id,organization_id) values($1,$2,$3),($4,$5,$6),($7,$8,$9)',
      [SID_A,USER_A,ORG_A,SID_B,USER_B,ORG_B,SID_E,EMPLOYEE,ORG_A]);
    await root.query('insert into public.organization_onboarding(organization_id,website_url) values($1,$2),($3,$4)',
      [ORG_A,SITE,ORG_B,'https://second.example.com/']);
    await root.query(
      "insert into public.knowledge_discovery_domain_verifications(organization_id,hostname,challenge_hash,created_by,challenge_expires_at,verified_at,verified_until) "+
      "values($1,$2,$3,$4,now()+interval '1 day',now()-interval '1 hour',now()+interval '1 hour')",
      [ORG_A,HOST,SHA,USER_A]);
    await root.query(
      "update public.knowledge_discovery_consent_control set grants_enabled=true,approved_policy_version=$1,approved_policy_sha256=$2,approved_at=now() where singleton=true",
      [POLICY,SHA]);
    const consentId=(await root.query(
      "insert into public.knowledge_discovery_site_consents(organization_id,hostname,purpose,status,policy_version,granted_by,granted_at,valid_until,revision) "+
      "values($1,$2,'website_discovery_review_only','granted',$3,$4,now()-interval '48 hours',now()+interval '1 hour',1) returning id",
      [ORG_A,HOST,POLICY,USER_A])).rows[0].id;
    await root.query(
      "insert into public.knowledge_discovery_consent_audit(consent_id,organization_id,hostname,action,actor_id,session_id,policy_version,policy_sha256,revision,valid_until) "+
      "values($1,$2,$3,'granted',$4,$5,$6,$7,1,now()+interval '1 hour')",
      [consentId,ORG_A,HOST,USER_A,SID_A,POLICY,SHA]);
    async function page(url=SITE,status='fetched',http=200,ctype='text/html'){
      // terminal jobs are separate, synthetic and immutable for these tests
      await root.query("update public.knowledge_discovery_jobs set created_at=now()-interval '26 hours' where status not in ('queued','running')");
      const job=(await root.query(
        "insert into public.knowledge_discovery_jobs(organization_id,created_by,seed_url,max_pages,status) values($1,$2,$3,3,'completed') returning id",
        [ORG_A,USER_A,SITE])).rows[0].id;
      const id=(await root.query(
        "insert into public.knowledge_discovery_pages(organization_id,job_id,url,status,http_status,content_type,page_title) values($1,$2,$3,$4,$5,$6,'Synthetic page title') returning id",
        [ORG_A,job,url,status,http,ctype])).rows[0].id;
      return {job,id};
    }
    const first=await page();
    const a=await open(),b=await open(),service=await open();
    const args=id=>[ORG_A,id,TITLE,'courses',CONTENT];
    const success=(await callAs(a,'authenticated',DRAFT,args(first.id))).rows[0].result;
    assert.equal(success.ok,true);
    assert.equal(success.status,'draft');
    assert.equal(success.organization_id,ORG_A);
    assert.equal(success.page_id,first.id);
    const source=(await root.query('select * from public.knowledge_sources where id=$1',[success.source_id])).rows[0];
    const document=(await root.query('select * from public.knowledge_documents where id=$1',[success.document_id])).rows[0];
    assert.equal(source.source_uri,SITE,'Source URL comes from stored page');
    assert.equal(source.metadata.source_text_verified,false);
    assert.equal(document.status,'draft');
    assert.equal(document.metadata.manual_review_required,true);
    assert.equal(document.content,CONTENT);
    assert.equal((await root.query('select count(*)::int as n from public.knowledge_chunks')).rows[0].n,1);
    assert.equal((await root.query('select count(*)::int as n from public.knowledge_approvals')).rows[0].n,0);

    // KB-14A: the EXACT shipped generic approve_knowledge_document_v1 RPC
    // must be stopped at database trigger level. Rejecting only the UI is
    // insufficient: an admin can call the existing public RPC directly.
    await assert.rejects(callAs(a,'authenticated',APPROVE,[ORG_A,success.document_id]),
      e=>e.code==='42501','Generic approval RPC cannot publish an unverified discovery draft');
    for(const attempted of [
      ['update public.knowledge_documents set status=\'approved\' where id=$1',[success.document_id]],
      ['update public.knowledge_documents set status=\'review\' where id=$1',[success.document_id]],
      ['update public.knowledge_documents set metadata=$2 where id=$1',[success.document_id,JSON.stringify({})]],
      ['update public.knowledge_sources set metadata=$2 where id=$1',[success.source_id,JSON.stringify({})]],
      ['update public.knowledge_sources set source_uri=$2 where id=$1',[success.source_id,'https://changed.example.com/']],
    ]) {
      await assert.rejects(root.query(...attempted),e=>e.code==='42501');
    }
    await assert.rejects(root.query(
      "insert into public.knowledge_documents(organization_id,source_id,title,category,content,status,metadata) values($1,$2,'Forged manual approval','faq',$3,'approved','{}'::jsonb)",
      [ORG_A,success.source_id,CONTENT]),
      e=>e.code==='42501','Even empty document metadata cannot hide a marked source');
    assert.equal((await root.query(
      'select status from public.knowledge_documents where id=$1',
      [success.document_id])).rows[0].status,'draft');
    assert.equal((await root.query('select count(*)::int as n from public.knowledge_approvals')).rows[0].n,0,
      'Denied approval creates no audit or eligible document');

    // KB-15A: A source may exist for the FK but be invisible to the
    // authenticated caller under RLS. An invoker trigger must deny, not
    // interpret an empty source lookup as a verified/manual source.
    // This grants a disposable-fixture-only direct INSERT solely to
    // simulate the existing platform's authenticated table permissions.
    await root.query('grant insert on public.knowledge_documents to authenticated');
    await root.query('grant select on public.knowledge_sources to authenticated');
    await root.query('alter table public.knowledge_sources enable row level security');
    await root.query(
      "create policy kb15a_hide_all_sources on public.knowledge_sources for select to authenticated using (false)");
    await assert.rejects(callAs(a,'authenticated',
      "insert into public.knowledge_documents(organization_id,source_id,title,category,content,status,metadata) values($1,$2,$3,'faq',$4,'approved','{}'::jsonb)",
      [ORG_A,success.source_id,'Forged invisible provenance',CONTENT]),
      e=>e.code==='42501',
      'RLS-invisible linked source cannot be laundered into approved knowledge');
    await root.query('drop policy kb15a_hide_all_sources on public.knowledge_sources');
    await root.query('alter table public.knowledge_sources disable row level security');
    await root.query('revoke insert on public.knowledge_documents from authenticated');
    await root.query('revoke select on public.knowledge_sources from authenticated');
    assert.deepEqual((await root.query(
      "select (select count(*)::int from public.knowledge_documents) as documents,"+
      "(select count(*)::int from public.knowledge_approvals) as approvals")).rows[0],
      {documents:1,approvals:0},
      'RLS-hidden source insert must leave no new document or approval');

    // No role can skip the exact live tenant-session proof.
    for(const [role,actor,sid] of [
      ['authenticated',USER_B,SID_B],
      ['authenticated',EMPLOYEE,SID_E],
      ['authenticated',USER_A,SID_B],
      ['authenticated',USER_A,null],
      ['anon',USER_A,SID_A],
      ['service_role',USER_A,SID_A],
    ]){
      await assert.rejects(callAs(b,role,DRAFT,args(first.id),actor,sid),
        e=>e.code==='42501',role+' / '+actor+' must not create a draft');
    }
    await assert.rejects(callAs(b,'authenticated',
      'insert into public.knowledge_documents(organization_id,source_id,title,category,content,status) values($1,$2,$3,$4,$5,$6)',
      [ORG_A,success.source_id,'Forged','general','Unverified','draft']),
      e=>e.code==='42501','Direct tenant writes remain denied');

    // KB-11B: another transaction REVOKES the Auth session before draft
    // creation reaches the locked session read. The helper alone could
    // observe the still-uncommitted old row; the locked recheck must wait,
    // then fail after the DELETE commits. No draft may be created.
    await b.query('begin');
    await b.query('delete from auth.sessions where id=$1',[SID_A]);
    let sessionRaceSettled=false;
    const sessionRace=callAs(a,'authenticated',DRAFT,args(first.id))
      .then(result=>({ok:true,result}),error=>({ok:false,error}))
      .finally(()=>{sessionRaceSettled=true;});
    await new Promise(resolve=>setTimeout(resolve,125));
    assert.equal(sessionRaceSettled,false,'Draft waits for Auth session revoke');
    await b.query('commit');
    const sessionOutcome=await sessionRace;
    assert.equal(sessionOutcome.ok,false,'Revoked session cannot save draft');
    assert.equal(sessionOutcome.error.code,'42501');
    await root.query('insert into auth.sessions(id,user_id) values($1,$2)',[SID_A,USER_A]);

    // KB-11B: independent membership removal must similarly block a
    // competing draft, even if the initial non-locking helper saw admin.
    await b.query('begin');
    await b.query(
      "update public.organization_members set active=false where organization_id=$1 and user_id=$2",
      [ORG_A,USER_A]);
    let membershipRaceSettled=false;
    const membershipRace=callAs(a,'authenticated',DRAFT,args(first.id))
      .then(result=>({ok:true,result}),error=>({ok:false,error}))
      .finally(()=>{membershipRaceSettled=true;});
    await new Promise(resolve=>setTimeout(resolve,125));
    assert.equal(membershipRaceSettled,false,'Draft waits for membership revoke');
    await b.query('commit');
    const membershipOutcome=await membershipRace;
    assert.equal(membershipOutcome.ok,false,'Revoked membership cannot save draft');
    assert.equal(membershipOutcome.error.code,'42501');
    await root.query(
      'update public.organization_members set active=true where organization_id=$1 and user_id=$2',
      [ORG_A,USER_A]);

    assert.deepEqual((await root.query(
      "select (select count(*)::int from public.knowledge_sources) as sources,"+
      "(select count(*)::int from public.knowledge_documents) as documents,"+
      "(select count(*)::int from public.knowledge_chunks) as chunks")).rows[0],
      {sources:1,documents:1,chunks:1},
      'Concurrent session/member revocation leaves no extra source or draft');

    // Wrong domain, wrong status and HTTP failure are rejected at write-time.
    for(const invalid of [
      await page('https://evil.example.com/'),
      await page(SITE,'blocked',200),
      await page(SITE,'fetched',404),
      await page(SITE,'fetched',200,'application/pdf'),
    ]){
      await assert.rejects(callAs(a,'authenticated',DRAFT,args(invalid.id)),e=>e.code==='42501');
    }
    for(const payload of [
      [ORG_A,first.id,'x','courses',CONTENT],
      [ORG_A,first.id,TITLE,'untrusted',CONTENT],
      [ORG_A,first.id,TITLE,'courses','short'],
      [ORG_B,first.id,TITLE,'courses',CONTENT],
    ]){
      await assert.rejects(callAs(a,'authenticated',DRAFT,payload),
        e=>['42501','22023'].includes(e.code));
    }

    // KB-12A: enforce the same public-host label restrictions at write-time,
    // not only in the optional app preview. An untrusted configured website
    // must fail without creating a row even if its page ID was valid earlier.
    for(const invalidWebsite of [
      'https://fixture..example.com/',
      'https://-fixture.example.com/',
      'https://fixture-.example.com/',
      'https://'+('x'.repeat(64))+'.example.com/',
      'https://fixture.invalid/',
      'https://fixture.local/',
      'https://fixture.home.arpa/',
      'https://fixture.example.com:443/',
      'https://operator@fixture.example.com/',
      'http://fixture.example.com/',
      'https://fixture.example.com?token=test',
      'https://replaced.example.net/',
    ]){
      await root.query(
        'update public.organization_onboarding set website_url=$1 where organization_id=$2',
        [invalidWebsite,ORG_A]);
      await assert.rejects(callAs(a,'authenticated',DRAFT,args(first.id)),
        e=>e.code==='42501',
        'Invalid/changed configured website must deny '+invalidWebsite.slice(0,80));
    }
    await root.query(
      'update public.organization_onboarding set website_url=$1 where organization_id=$2',
      [SITE,ORG_A]);

    // Save must wait if the configured website is changing, then deny
    // against the COMMITTED new configuration (no stale read/write gap).
    await b.query('begin');
    await b.query(
      'update public.organization_onboarding set website_url=$1 where organization_id=$2',
      ['https://replaced.example.net/',ORG_A]);
    let websiteRaceSettled=false;
    const websiteRace=callAs(a,'authenticated',DRAFT,args(first.id))
      .then(result=>({ok:true,result}),error=>({ok:false,error}))
      .finally(()=>{websiteRaceSettled=true;});
    await new Promise(resolve=>setTimeout(resolve,120));
    assert.equal(websiteRaceSettled,false,'Draft waits for website change lock');
    await b.query('commit');
    const websiteOutcome=await websiteRace;
    assert.equal(websiteOutcome.ok,false,'Configured website change wins');
    assert.equal(websiteOutcome.error.code,'42501');
    await root.query(
      'update public.organization_onboarding set website_url=$1 where organization_id=$2',
      [SITE,ORG_A]);

    // Policy switch is an independent emergency brake on new drafts.
    // The policy row is locked by the atomic draft, not trusted from UI.
    await b.query('begin');
    await b.query(
      'update public.knowledge_discovery_consent_control set grants_enabled=false where singleton=true');
    let policyRaceSettled=false;
    const policyRace=callAs(a,'authenticated',DRAFT,args(first.id))
      .then(result=>({ok:true,result}),error=>({ok:false,error}))
      .finally(()=>{policyRaceSettled=true;});
    await new Promise(resolve=>setTimeout(resolve,120));
    assert.equal(policyRaceSettled,false,'Draft waits for policy shutdown');
    await b.query('commit');
    const policyOutcome=await policyRace;
    assert.equal(policyOutcome.ok,false,'Policy shutdown wins');
    assert.equal(policyOutcome.error.code,'42501');
    await root.query(
      'update public.knowledge_discovery_consent_control set grants_enabled=true where singleton=true');
    assert.deepEqual((await root.query(
      "select (select count(*)::int from public.knowledge_sources) as sources,"+
      "(select count(*)::int from public.knowledge_documents) as documents,"+
      "(select count(*)::int from public.knowledge_chunks) as chunks")).rows[0],
      {sources:1,documents:1,chunks:1},
      'Rejected website and policy race attempts leave no unreviewed rows');

    // Constraint/trigger failure MUST roll back source, document and chunk.
    await root.query("create function public.kb11a_reject_chunk() returns trigger language plpgsql as $t$ begin raise exception 'synthetic_chunk_insert_failure'; end $t$");
    await root.query('create trigger kb11a_chunk_failure before insert on public.knowledge_chunks for each row execute function public.kb11a_reject_chunk()');
    await assert.rejects(callAs(a,'authenticated',DRAFT,args(first.id)),
      e=>/synthetic_chunk_insert_failure/.test(e.message));
    await root.query('drop trigger kb11a_chunk_failure on public.knowledge_chunks');
    const counts=(await root.query(
      "select (select count(*)::int from public.knowledge_sources) as sources,"+
      "(select count(*)::int from public.knowledge_documents) as documents,"+
      "(select count(*)::int from public.knowledge_chunks) as chunks")).rows[0];
    assert.deepEqual(counts,{sources:1,documents:1,chunks:1});

    // Policy digest mismatch / ownership expiry must deny even a valid page.
    await root.query("update public.knowledge_discovery_consent_control set approved_policy_sha256=$1 where singleton=true",['b'.repeat(64)]);
    await assert.rejects(callAs(a,'authenticated',DRAFT,args(first.id)),e=>e.code==='42501');
    await root.query('update public.knowledge_discovery_consent_control set approved_policy_sha256=$1 where singleton=true',[SHA]);
    await root.query("update public.knowledge_discovery_domain_verifications set verified_until=now()-interval '1 second'");
    await assert.rejects(callAs(a,'authenticated',DRAFT,args(first.id)),e=>e.code==='42501');
    await root.query("update public.knowledge_discovery_domain_verifications set verified_until=now()+interval '1 hour'");

    // KB-13B: page/job metadata older than the original grant cannot
    // become a new saved draft, even if consent is currently granted.
    await root.query(
      "update public.knowledge_discovery_jobs set created_at=now()-interval '72 hours' where id=$1",
      [first.job]);
    await assert.rejects(callAs(a,'authenticated',DRAFT,args(first.id)),
      e=>e.code==='42501','A pre-consent scan cannot be used as source metadata');
    await root.query(
      "update public.knowledge_discovery_jobs set created_at=now()-interval '26 hours' where id=$1",
      [first.job]);

    // Future consent regrant needs an independently reviewed revision-aware
    // proof contract; revision 2 or 3 must not reuse revision-1 scan evidence.
    await root.query(
      'update public.knowledge_discovery_site_consents set revision=3 where id=$1',
      [consentId]);
    await assert.rejects(callAs(a,'authenticated',DRAFT,args(first.id)),
      e=>e.code==='42501','Unapproved regrant revision cannot reuse stale pages');
    await root.query(
      'update public.knowledge_discovery_site_consents set revision=1 where id=$1',
      [consentId]);

    // Race control: withdrawal acquires the consent-row UPDATE lock first,
    // but has not yet committed. A new draft must wait and then DENY, not
    // create a source/document/chunk from a stale preflight.
    await beginAs(b,'authenticated',USER_A,SID_A);
    const withdrawn=(await b.query(WITHDRAW,[ORG_A,HOST,1])).rows[0].result;
    assert.equal(withdrawn.status,'withdrawn');
    assert.equal((await root.query(
      'select status from public.knowledge_discovery_site_consents where id=$1',
      [consentId])).rows[0].status,'granted',
      'Concurrent withdrawal is not committed yet');
    let draftFinished=false;
    const racingDraft=callAs(a,'authenticated',DRAFT,args(first.id))
      .then(result=>({ok:true,result}),error=>({ok:false,error}))
      .finally(()=>{draftFinished=true;});
    await new Promise(resolve=>setTimeout(resolve,120));
    assert.equal(draftFinished,false,
      'Competing draft cannot pass the locked consent row');
    await b.query('commit');
    const raceResult=await racingDraft;
    assert.equal(raceResult.ok,false,'Withdrawal wins, so draft must fail');
    assert.equal(raceResult.error.code,'42501');
    await assert.rejects(callAs(a,'authenticated',DRAFT,args(first.id)),e=>e.code==='42501');
    assert.deepEqual((await root.query(
      "select (select count(*)::int from public.knowledge_sources) as sources,"+
      "(select count(*)::int from public.knowledge_documents) as documents,"+
      "(select count(*)::int from public.knowledge_chunks) as chunks")).rows[0],counts,
      'Denied writes leave no partial new records');

    // These drafts may exist from BEFORE withdrawal: deletion is a distinct
    // unapproved legal/DBA flow, not implicitly claimed by this SQL.
    assert.equal((await root.query('select count(*)::int as n from public.knowledge_approvals')).rows[0].n,0);
    assert.equal((await root.query('select count(*)::int as n from public.knowledge_discovery_consent_audit')).rows[0].n,2);

    // Ordinary manually entered knowledge retains the ORIGINAL approval path,
    // so this scoped safety guard does not disrupt unrelated CRM/Knowledge.
    const manualSource=(await root.query(
      "insert into public.knowledge_sources(organization_id,source_type,name,status,metadata) values($1,'manual','Synthetic ordinary manual source','active','{\"entry_mode\":\"knowledge_workspace_v2\"}'::jsonb) returning id",
      [ORG_A])).rows[0].id;
    const manualDocument=(await root.query(
      "insert into public.knowledge_documents(organization_id,source_id,title,category,content,status,metadata) values($1,$2,'Manual knowledge','faq',$3,'draft','{\"entry_mode\":\"knowledge_workspace_v2\"}'::jsonb) returning id",
      [ORG_A,manualSource,CONTENT])).rows[0].id;
    const normal=(await callAs(a,'authenticated',APPROVE,[ORG_A,manualDocument])).rows[0].result;
    assert.equal(normal?.ok,true,'Ordinary Knowledge approval still functions');
    assert.equal(normal.status,'approved');
    assert.equal((await root.query('select status from public.knowledge_documents where id=$1',
      [manualDocument])).rows[0].status,'approved');
    assert.equal((await root.query('select count(*)::int as n from public.knowledge_approvals where document_id=$1',
      [manualDocument])).rows[0].n,1);

    // Unverified discovered material may be archived for containment, but
    // can never be re-approved through the generic function.
    await root.query("update public.knowledge_documents set status='archived' where id=$1",
      [success.document_id]);
    await assert.rejects(callAs(a,'authenticated',APPROVE,[ORG_A,success.document_id]));
    await root.query("update public.knowledge_sources set status='disabled' where id=$1",
      [success.source_id]);
    void service;
  } finally {
    for(const c of clients.reverse())await c.end().catch(()=>{});
    if(made){
      await admin.query('drop database "'+dbName+'" with (force)').catch(()=>{});
    }
    await admin.end().catch(()=>{});
  }
});
