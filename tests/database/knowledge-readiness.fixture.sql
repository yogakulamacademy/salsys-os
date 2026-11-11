-- Execute ONLY on the approved empty Recovery Rehearsal project.
-- All application objects and test rows are inside this transaction and rolled back.
-- Foundation tables model only fields consumed by exact canonical authorization helpers.
-- This does not replay the whole application schema, Auth login or financial workflow.
begin;
set local statement_timeout = '30s';
set local lock_timeout = '3s';
do $guard$
begin
  if to_regclass('public.organizations') is not null or to_regclass('public.knowledge_documents') is not null or to_regclass('public.profiles') is not null or to_regclass('public.payments') is not null then
    raise exception 'Refusing a populated application project: this test requires an approved empty sandbox';
  end if;
end;
$guard$;
create table public.organizations (id uuid primary key, status text not null default 'active');
create table public.profiles (id uuid primary key, active boolean not null default true);
create table public.organization_members (organization_id uuid references public.organizations(id), user_id uuid references public.profiles(id), role text not null, active boolean not null default true, primary key (organization_id,user_id));
create table public.tenant_session_bindings (session_id uuid primary key, user_id uuid not null, organization_id uuid not null);
create table public.tenant_security_config (singleton boolean primary key, enforce_session_tenant boolean not null);
insert into public.tenant_security_config values (true,true);
revoke all on public.organizations, public.profiles, public.organization_members, public.tenant_session_bindings, public.tenant_security_config from public,anon,authenticated;
-- __AUTHORIZATION__
-- __KNOWLEDGE__
create function pg_temp.assert_true(value boolean, label text) returns void language plpgsql as $assert$
begin if value is distinct from true then raise exception 'Readiness assertion failed: %', label; end if; end;
$assert$;
insert into public.organizations(id) values ('10000000-0000-4000-8000-000000000001'),('10000000-0000-4000-8000-000000000002');
insert into public.profiles(id) values ('20000000-0000-4000-8000-000000000001'),('20000000-0000-4000-8000-000000000002'),('20000000-0000-4000-8000-000000000003');
insert into public.organization_members(organization_id,user_id,role) values
('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','owner'),
('10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','owner'),
('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000003','employee');
insert into public.tenant_session_bindings values
('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001'),
('30000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002'),
('30000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001');

set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"20000000-0000-4000-8000-000000000001","session_id":"30000000-0000-4000-8000-000000000001"}',true);
do $cases$
declare
  doc uuid;
  source uuid;
  provenance_doc uuid;
  provenance_source uuid;
  provenance_result jsonb;
  rejected boolean;
begin
  doc := (public.create_knowledge_document_v1('10000000-0000-4000-8000-000000000001','Cobalt testing policy','faq','Cobalt policy is synthetic test content, never a business fact.',false)->>'document_id')::uuid;
  perform pg_temp.assert_true((select count(*)=0 from public.search_organization_knowledge_v1('10000000-0000-4000-8000-000000000001','Cobalt',6)), 'draft excluded');
  perform public.approve_knowledge_document_v1('10000000-0000-4000-8000-000000000001',doc);
  perform pg_temp.assert_true((select count(*)=1 from public.search_organization_knowledge_v1('10000000-0000-4000-8000-000000000001','What is the Cobalt policy?',6)), 'approved valid knowledge retrieved despite filler words');
  perform pg_temp.assert_true((select (metadata->>'document_version')::int=1 from public.search_organization_knowledge_v1('10000000-0000-4000-8000-000000000001','Cobalt',6)), 'version lineage returned');
  perform pg_temp.assert_true((select count(*)=1 from public.knowledge_approvals where document_id=doc), 'approval ledger recorded');
  perform public.approve_knowledge_document_v1('10000000-0000-4000-8000-000000000001',doc);
  perform pg_temp.assert_true((select count(*)=1 from public.knowledge_approvals where document_id=doc), 'approval retry does not duplicate ledger');
  update public.knowledge_documents set valid_until=now()-interval '1 second' where id=doc;
  perform pg_temp.assert_true((select count(*)=0 from public.search_organization_knowledge_v1('10000000-0000-4000-8000-000000000001','Cobalt',6)), 'expired excluded');
  update public.knowledge_documents set valid_until=null,valid_from=now()+interval '1 day' where id=doc;
  perform pg_temp.assert_true((select count(*)=0 from public.search_organization_knowledge_v1('10000000-0000-4000-8000-000000000001','Cobalt',6)), 'future-valid excluded');
  update public.knowledge_documents set valid_from=null where id=doc;
  insert into public.knowledge_sources(organization_id,name,status) values ('10000000-0000-4000-8000-000000000001','Synthetic source','disabled') returning id into source;
  update public.knowledge_documents set source_id=source where id=doc;
  perform pg_temp.assert_true((select count(*)=0 from public.search_organization_knowledge_v1('10000000-0000-4000-8000-000000000001','Cobalt',6)), 'disabled source excluded');
  update public.knowledge_sources set status='active' where id=source;
  perform pg_temp.assert_true((select count(*)=1 from public.search_organization_knowledge_v1('10000000-0000-4000-8000-000000000001','Cobalt',6)), 'active source restores eligible retrieval');
  perform public.archive_knowledge_document_v1('10000000-0000-4000-8000-000000000001',doc);
  perform pg_temp.assert_true((select count(*)=0 from public.search_organization_knowledge_v1('10000000-0000-4000-8000-000000000001','Cobalt',6)), 'archive removes retrieval');
  rejected := false;
  begin perform public.approve_knowledge_document_v1('10000000-0000-4000-8000-000000000001',doc); exception when others then rejected := sqlerrm like '%Archived or superseded%'; end;
  perform pg_temp.assert_true(rejected,'archived cannot be reapproved');

  provenance_result := public.create_source_backed_knowledge_document_v2(
    '10000000-0000-4000-8000-000000000001',
    'Saffron provenance policy',
    'policy',
    'Saffron provenance evidence is synthetic test content and never a business fact.',
    'Synthetic policy handbook',
    'policy',
    'https://example.test/policy',
    now()-interval '1 hour',
    now()+interval '1 day',
    true
  );
  provenance_doc := (provenance_result->>'document_id')::uuid;
  provenance_source := (provenance_result->>'source_id')::uuid;
  perform pg_temp.assert_true(
    provenance_source is not null and (select source_id=provenance_source from public.knowledge_documents where id=provenance_doc),
    'source-backed create links source to document'
  );
  perform pg_temp.assert_true((
    select organization_id='10000000-0000-4000-8000-000000000001'::uuid
      and name='Synthetic policy handbook'
      and source_type='policy'
      and source_uri='https://example.test/policy'
      and status='active'
    from public.knowledge_sources where id=provenance_source
  ), 'source-backed create stores exact tenant provenance');
  perform pg_temp.assert_true((
    select valid_from is not null and valid_until is not null and valid_until > valid_from
    from public.knowledge_documents where id=provenance_doc
  ), 'source-backed create stores validity window');
  perform pg_temp.assert_true((
    select count(*)=1 from public.search_organization_knowledge_v1('10000000-0000-4000-8000-000000000001','Saffron',6)
  ), 'source-backed approved current knowledge retrieves');
  perform pg_temp.assert_true((
    select (metadata->>'source_id')::uuid=provenance_source
      and metadata->'document_metadata'->>'source_name'='Synthetic policy handbook'
      and metadata->'document_metadata'->>'source_type'='policy'
      and metadata->'document_metadata'->>'source_uri'='https://example.test/policy'
    from public.search_organization_knowledge_v1('10000000-0000-4000-8000-000000000001','Saffron',6)
    limit 1
  ), 'retrieval returns minimized source citation metadata');

  rejected := false;
  begin
    perform public.create_source_backed_knowledge_document_v2(
      '10000000-0000-4000-8000-000000000001','Invalid URL','policy','Synthetic invalid URL content for readiness.','Bad URL source','website','file:///tmp/policy',null,null,false
    );
  exception when others then rejected := sqlerrm like '%http or https%';
  end;
  perform pg_temp.assert_true(rejected,'non-http source reference rejected');

  rejected := false;
  begin
    perform public.create_source_backed_knowledge_document_v2(
      '10000000-0000-4000-8000-000000000001','Invalid window','policy','Synthetic invalid validity content for readiness.','Window source','manual',null,now()+interval '2 days',now()+interval '1 day',false
    );
  exception when others then rejected := sqlerrm like '%later than valid from%';
  end;
  perform pg_temp.assert_true(rejected,'invalid validity window rejected');

  -- Keep one approved A item so cross-tenant tests cannot pass merely because A is empty.
  perform public.create_knowledge_document_v1('10000000-0000-4000-8000-000000000001','Cobalt current policy','faq','Cobalt current synthetic evidence belongs only to tenant A.',true);
  rejected := false;
  begin perform public.create_knowledge_document_v1('10000000-0000-4000-8000-000000000002','Cross tenant attempt','faq','This must never be created in another tenant.',true); exception when others then rejected := sqlerrm like '%Only organization admins%'; end;
  perform pg_temp.assert_true(rejected,'owner A cannot mutate B');

  rejected := false;
  begin
    perform public.create_source_backed_knowledge_document_v2(
      '10000000-0000-4000-8000-000000000002','Cross tenant provenance','faq','This source-backed item must never be created in another tenant.','Tenant B source','manual',null,null,null,true
    );
  exception when others then rejected := sqlerrm like '%Only organization admins%';
  end;
  perform pg_temp.assert_true(rejected,'owner A cannot create source-backed knowledge in B');
end;
$cases$;

select set_config('request.jwt.claims','{"role":"authenticated","sub":"20000000-0000-4000-8000-000000000002","session_id":"30000000-0000-4000-8000-000000000002"}',true);
select pg_temp.assert_true((select count(*)=0 from public.knowledge_documents),'tenant B direct read cannot see A');
select pg_temp.assert_true((select count(*)=0 from public.search_organization_knowledge_v1('10000000-0000-4000-8000-000000000001','Cobalt',6)),'tenant B RPC cannot retrieve A');

select set_config('request.jwt.claims','{"role":"authenticated","sub":"20000000-0000-4000-8000-000000000003","session_id":"30000000-0000-4000-8000-000000000003"}',true);
do $employee$
declare rejected boolean := false;
begin
  begin perform public.create_knowledge_document_v1('10000000-0000-4000-8000-000000000001','Employee attempt','faq','Employee must not approve tenant knowledge.',true); exception when others then rejected := sqlerrm like '%Only organization admins%'; end;
  perform pg_temp.assert_true(rejected,'employee cannot approve or create');

  rejected := false;
  begin
    perform public.create_source_backed_knowledge_document_v2(
      '10000000-0000-4000-8000-000000000001','Employee provenance attempt','faq','Employee must not create source-backed tenant knowledge.','Employee source','manual',null,null,null,true
    );
  exception when others then rejected := sqlerrm like '%Only organization admins%';
  end;
  perform pg_temp.assert_true(rejected,'employee cannot create source-backed knowledge');
end;
$employee$;

-- An authenticated SQL role with absent JWT claims must never be able to
-- invoke the SECURITY DEFINER source-backed creation path. A nullable IF
-- predicate silently skips its deny branch in PL/pgSQL; enforce fail-closed.
select set_config('request.jwt.claims','{}',true);
select set_config('request.jwt.claim.role','',true);
do $missing_claims$
declare rejected boolean := false;
begin
  begin
    perform public.create_source_backed_knowledge_document_v2(
      '10000000-0000-4000-8000-000000000001',
      'Missing claims negative test',
      'faq',
      'This synthetic content must never be created without verified role and session claims.',
      'Synthetic missing-claims source',
      'manual',
      null, null, null, false
    );
  exception when others then
    rejected := sqlerrm like '%Only organization admins%';
  end;
  perform pg_temp.assert_true(rejected,'missing JWT role and session deny source-backed creation');
end;
$missing_claims$;

reset role;
select pg_temp.assert_true(not has_function_privilege('anon','public.search_organization_knowledge_v1(uuid,text,integer)','execute'),'anonymous retrieval execute denied');
select pg_temp.assert_true(not has_function_privilege('anon','public.create_knowledge_document_v1(uuid,text,text,text,boolean)','execute'),'anonymous lifecycle execute denied');
select pg_temp.assert_true(not has_function_privilege('anon','public.create_source_backed_knowledge_document_v2(uuid,text,text,text,text,text,text,timestamptz,timestamptz,boolean)','execute'),'anonymous source-backed lifecycle execute denied');
rollback;
select 'knowledge_readiness_v2' as suite, 28 as assertions_completed,
  to_regclass('public.organizations') is null
  and to_regclass('public.knowledge_documents') is null
  and to_regprocedure('public.create_knowledge_document_v1(uuid,text,text,text,boolean)') is null
  and to_regprocedure('public.create_source_backed_knowledge_document_v2(uuid,text,text,text,text,text,text,timestamptz,timestamptz,boolean)') is null
  as rollback_verified;
