-- KB-05B: additional, synthetic direct-RLS negative-path assertions only.
-- These fragments are injected into the existing KB-05A rollback fixture by
-- knowledge-rls-negative-matrix.test.mjs; never execute this file alone.
-- No original fixture, production migration, RPC, policy or grant is changed.

-- @@OWNER_A@@
-- Positive controls: each table contains A-owned rows before exercising denial.
select pg_temp.assert_true(
  (select count(*) > 0 from public.knowledge_sources
   where organization_id='10000000-0000-4000-8000-000000000001'),
  'KB05B owner A has source rows');
select pg_temp.assert_true(
  (select count(*) > 0 from public.knowledge_chunks
   where organization_id='10000000-0000-4000-8000-000000000001'),
  'KB05B owner A has knowledge chunks');
select pg_temp.assert_true(
  (select count(*) > 0 from public.knowledge_approvals
   where organization_id='10000000-0000-4000-8000-000000000001'),
  'KB05B owner A has approval audit rows');
select set_config('kb05b.a_doc',
  (select id::text from public.knowledge_documents
   where organization_id='10000000-0000-4000-8000-000000000001'
   and title='Cobalt current policy' limit 1), true);
select pg_temp.assert_true(
  current_setting('kb05b.a_doc',true) is not null,
  'KB05B positive A document is bound');

-- Claimed user A with an actual tenant B session ID must have no A authority.
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"20000000-0000-4000-8000-000000000001","session_id":"30000000-0000-4000-8000-000000000002"}',true);
select pg_temp.assert_true(
  (select count(*)=0 from public.knowledge_documents),
  'KB05B A user with B session cannot read A directly');
select pg_temp.assert_true(
  (select count(*)=0 from public.search_organization_knowledge_v1(
   '10000000-0000-4000-8000-000000000001','Cobalt',6)),
  'KB05B A user with B session cannot search A');

-- @@OWNER_B@@
-- Existing fixture already establishes A has real rows and B cannot see them.
select pg_temp.assert_true((select count(*)=0 from public.knowledge_sources),
  'KB05B owner B cannot read A sources');
select pg_temp.assert_true((select count(*)=0 from public.knowledge_chunks),
  'KB05B owner B cannot read A chunks');
select pg_temp.assert_true((select count(*)=0 from public.knowledge_approvals),
  'KB05B owner B cannot read A approvals');

do $kb05b_b$
declare
  a_doc uuid := current_setting('kb05b.a_doc')::uuid;
  b_doc uuid;
  denied boolean;
  affected bigint;
begin
  denied:=false;
  begin
    perform public.approve_knowledge_document_v1(
      '10000000-0000-4000-8000-000000000001',a_doc);
  exception when others then
    denied:=sqlerrm like '%Only organization admins%';
  end;
  perform pg_temp.assert_true(denied,'KB05B B cannot approve A through RPC');

  denied:=false;
  begin
    perform public.archive_knowledge_document_v1(
      '10000000-0000-4000-8000-000000000001',a_doc);
  exception when others then
    denied:=sqlerrm like '%Only organization admins%';
  end;
  perform pg_temp.assert_true(denied,'KB05B B cannot archive A through RPC');

  denied:=false;
  begin
    insert into public.knowledge_sources(organization_id,name)
    values('10000000-0000-4000-8000-000000000001','Forbidden B write into A');
  exception when others then
    denied:=sqlstate='42501';
  end;
  perform pg_temp.assert_true(denied,'KB05B B cannot insert A source via RLS');

  denied:=false;
  begin
    insert into public.knowledge_chunks(organization_id,document_id,chunk_index,content)
    values('10000000-0000-4000-8000-000000000001',a_doc,400,
      'Forbidden cross-tenant chunk');
  exception when others then
    denied:=sqlstate='42501';
  end;
  perform pg_temp.assert_true(denied,'KB05B B cannot insert A chunk via RLS');

  denied:=false;
  begin
    insert into public.knowledge_approvals(organization_id,document_id,action)
    values('10000000-0000-4000-8000-000000000001',a_doc,'approved');
  exception when others then
    denied:=sqlstate='42501';
  end;
  perform pg_temp.assert_true(denied,'KB05B B cannot forge A approval row');

  update public.knowledge_documents set title='Forbidden cross-tenant edit'
  where organization_id='10000000-0000-4000-8000-000000000001' and id=a_doc;
  get diagnostics affected=row_count;
  perform pg_temp.assert_true(affected=0,'KB05B B cannot update A document');

  update public.knowledge_sources set name='Forbidden cross-tenant source edit'
  where organization_id='10000000-0000-4000-8000-000000000001';
  get diagnostics affected=row_count;
  perform pg_temp.assert_true(affected=0,'KB05B B cannot update A sources');

  delete from public.knowledge_documents
  where organization_id='10000000-0000-4000-8000-000000000001' and id=a_doc;
  get diagnostics affected=row_count;
  perform pg_temp.assert_true(affected=0,'KB05B B cannot delete A document');

  -- Prove B is a genuine working tenant, not merely an all-deny fixture.
  b_doc := (public.create_knowledge_document_v1(
    '10000000-0000-4000-8000-000000000002',
    'Boreal current policy','faq',
    'Boreal is an invented knowledge topic belonging only to tenant B.',true
  )->>'document_id')::uuid;
  perform set_config('kb05b.b_doc',b_doc::text,true);
  perform pg_temp.assert_true(
    (select count(*)=1 from public.knowledge_documents where id=b_doc),
    'KB05B owner B can read own approved document');
  perform pg_temp.assert_true(
    (select count(*)=1 from public.search_organization_knowledge_v1(
      '10000000-0000-4000-8000-000000000002','Boreal',6)),
    'KB05B owner B can retrieve own approved document');
end;
$kb05b_b$;

-- A different authenticated session, still claiming user B, loses B access.
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"20000000-0000-4000-8000-000000000002","session_id":"30000000-0000-4000-8000-000000000001"}',true);
select pg_temp.assert_true((select count(*)=0 from public.knowledge_documents),
  'KB05B B user with A session cannot read B');

-- @@EMPLOYEE@@
-- A standard tenant A member can read only A, but can never mutate either tenant.
select pg_temp.assert_true(
  (select count(*)>0 from public.knowledge_documents
   where organization_id='10000000-0000-4000-8000-000000000001'),
  'KB05B employee can read own tenant A');
select pg_temp.assert_true(
  (select count(*)=0 from public.knowledge_documents
   where id=current_setting('kb05b.b_doc')::uuid),
  'KB05B employee A cannot see B');

do $kb05b_employee$
declare
  denied boolean;
  affected bigint;
begin
  denied:=false;
  begin
    perform public.approve_knowledge_document_v1(
      '10000000-0000-4000-8000-000000000001',
      current_setting('kb05b.a_doc')::uuid);
  exception when others then
    denied:=sqlerrm like '%Only organization admins%';
  end;
  perform pg_temp.assert_true(denied,'KB05B employee cannot approve A through RPC');

  denied:=false;
  begin
    insert into public.knowledge_sources(organization_id,name)
    values('10000000-0000-4000-8000-000000000001',
      'Forbidden employee source');
  exception when others then
    denied:=sqlstate='42501';
  end;
  perform pg_temp.assert_true(denied,'KB05B employee cannot insert own tenant source');

  update public.knowledge_documents set title='Forbidden employee edit'
  where id=current_setting('kb05b.a_doc')::uuid;
  get diagnostics affected=row_count;
  perform pg_temp.assert_true(affected=0,'KB05B employee cannot update A document');
end;
$kb05b_employee$;

-- @@DB_ROLES@@
select pg_temp.assert_true(
  not has_table_privilege('anon','public.knowledge_sources','SELECT')
  and not has_table_privilege('anon','public.knowledge_documents','SELECT')
  and not has_table_privilege('anon','public.knowledge_chunks','SELECT')
  and not has_table_privilege('anon','public.knowledge_approvals','SELECT'),
  'KB05B anon has no direct knowledge table read');
select pg_temp.assert_true(
  not has_table_privilege('authenticated','public.knowledge_approvals','UPDATE')
  and not has_table_privilege('authenticated','public.knowledge_approvals','DELETE'),
  'KB05B authenticated approval history stays append-only');
select pg_temp.assert_true(
  (select count(*)=1 from public.knowledge_documents
   where id=current_setting('kb05b.a_doc')::uuid
     and title='Cobalt current policy'),
  'KB05B unauthorized writes did not change A document');
select pg_temp.assert_true(
  (select count(*)=1 from public.knowledge_documents
   where id=current_setting('kb05b.b_doc')::uuid
     and title='Boreal current policy'),
  'KB05B authorized B document is preserved');
