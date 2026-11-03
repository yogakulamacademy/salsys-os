-- Approved empty sandbox only. Exact command bodies with reduced foundation tables.
-- This is a financial subsystem test, not the complete GT-01 intake/identity/enrollment replay.
begin;
set local statement_timeout='30s';
set local lock_timeout='3s';
do $guard$ begin
  if to_regclass('public.organizations') is not null or to_regclass('public.payments') is not null
     or to_regclass('public.profiles') is not null then
    raise exception 'Refusing a populated application project';
  end if;
end; $guard$;
create type public.payment_kind as enum ('deposit','balance','full','refund','other');
create type public.payment_status as enum ('pending','paid','failed','refunded','partially_refunded');
create type public.lead_stage as enum ('new','payment_pending','closed_won','enrolled','lost');
create type public.lead_status as enum ('open','won','lost','archived');
create type public.actor_type as enum ('lead','human','ai','automation','system');
create type public.task_type as enum ('follow_up','call','payment_check','human_review','other');
create type public.task_status as enum ('open','completed','cancelled','snoozed');
create table public.organizations(id uuid primary key,status text default 'active');
create table public.profiles(id uuid primary key,active boolean default true);
create table public.organization_members(organization_id uuid,user_id uuid,role text,active boolean default true);
create table public.tenant_session_bindings(session_id uuid,user_id uuid,organization_id uuid);
create table public.tenant_security_config(singleton boolean primary key,enforce_session_tenant boolean);
insert into public.tenant_security_config values(true,true);
create table public.leads(id uuid primary key,organization_id uuid references public.organizations(id),
  current_stage public.lead_stage default 'payment_pending',status public.lead_status default 'open',metadata jsonb default '{}');
create table public.enrollments(id uuid primary key,organization_id uuid references public.organizations(id),
  lead_id uuid references public.leads(id),metadata jsonb not null default '{}',currency text not null default 'INR');
create table public.tasks(id uuid primary key,organization_id uuid,lead_id uuid,task_type public.task_type,
  status public.task_status,completed_at timestamptz,metadata jsonb default '{}');
create table public.activities(id uuid primary key default gen_random_uuid(),lead_id uuid references public.leads(id),
  activity_type text,actor_type public.actor_type,actor_id text,title text,details text,metadata jsonb default '{}');
create table public.lead_stage_history(id uuid primary key default gen_random_uuid(),lead_id uuid,
  from_stage public.lead_stage,to_stage public.lead_stage,changed_by_type public.actor_type,
  changed_by_id text,reason text,changed_at timestamptz);
-- __AUTHORIZATION__
-- __PAYMENTS__
alter table public.payments add column organization_id uuid not null references public.organizations(id);
create unique index uq_payments_provider_external_reference
  on public.payments(organization_id,coalesce(provider,''),external_payment_id)
  where external_payment_id is not null and btrim(external_payment_id) <> '';
alter table public.payments enable row level security;
grant select,insert,update,delete on public.payments to authenticated;
create policy fixture_owner_payments on public.payments to authenticated
  using(public.can_mutate_organization(organization_id) and public.has_organization_role(organization_id,array['owner','admin']))
  with check(public.can_mutate_organization(organization_id) and public.has_organization_role(organization_id,array['owner','admin']));
revoke all on public.organizations,public.profiles,public.organization_members,public.tenant_session_bindings,
  public.tenant_security_config,public.leads,public.activities from public,anon,authenticated;
-- __COMMANDS__
revoke all on function public.verify_payment_v1(uuid,numeric,text,public.payment_kind,text,text,timestamptz,text,uuid) from public,anon;
grant execute on function public.verify_payment_v1(uuid,numeric,text,public.payment_kind,text,text,timestamptz,text,uuid) to authenticated;
create trigger payments_promote_closed_won_v1 after insert or update of status on public.payments
  for each row execute function public.promote_paid_payment_to_closed_won_v1();

create temp table assertions(label text);
grant select,insert on assertions to authenticated;
create function pg_temp.assert_true(value boolean,label text) returns void language plpgsql as $assert$
begin
  if value is distinct from true then raise exception 'Refund assertion failed: %',label; end if;
  insert into pg_temp.assertions values(label);
end; $assert$;
create function pg_temp.expect_error(command text,expected text,label text) returns void language plpgsql as $expect$
declare rejected boolean:=false;
begin
  begin execute command;
  exception when others then
    if position(expected in sqlerrm)=0 then raise exception 'Unexpected error for %: %',label,sqlerrm; end if;
    rejected:=true;
  end;
  perform pg_temp.assert_true(rejected,label);
end; $expect$;
insert into public.organizations(id) values('10000000-0000-4000-8000-000000000001'),('10000000-0000-4000-8000-000000000002');
insert into public.profiles(id) values('20000000-0000-4000-8000-000000000001'),('20000000-0000-4000-8000-000000000002'),('20000000-0000-4000-8000-000000000003');
insert into public.organization_members(organization_id,user_id,role) values
('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','owner'),
('10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','owner'),
('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000003','employee');
insert into public.tenant_session_bindings values
('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001'),
('30000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002'),
('30000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001');
insert into public.leads(id,organization_id) values
('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001'),
('40000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002'),
('40000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001');

set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"20000000-0000-4000-8000-000000000001","session_id":"30000000-0000-4000-8000-000000000001"}',true);
do $test$ declare a uuid;b uuid;r uuid;j jsonb;changed integer;begin
  a:=(public.verify_payment_v1('40000000-0000-4000-8000-000000000001',30000,'INR','deposit','bank_transfer','deposit-1')->>'payment_id')::uuid;
  b:=(public.verify_payment_v1('40000000-0000-4000-8000-000000000001',60000,'INR','balance','bank_transfer','balance-1')->>'payment_id')::uuid;
  perform pg_temp.assert_true((select sum(amount)=90000 from public.payments),'two canonical verified collections total 90000');
  j:=public.record_refund_v1('40000000-0000-4000-8000-000000000001',a,10000,'INR','50000000-0000-4000-8000-000000000001','bank_transfer','refund-1',null,'Bank return verified');
  r:=(j->>'payment_id')::uuid;
  perform pg_temp.assert_true((j->>'remaining_refundable')::numeric=20000,'remaining original balance 20000');
  perform pg_temp.assert_true((select sum(case when payment_kind='refund' then -amount else amount end)=80000 from public.payments),'canonical cash subcase nets 80000');
  perform pg_temp.assert_true((select original_payment_id=a and metadata->>'original_payment_id'=a::text from public.payments where id=r),'refund links original payment and metadata');
  perform pg_temp.assert_true((select status='paid' and amount=30000 from public.payments where id=a),'original payment financial truth retained');
  j:=public.record_refund_v1('40000000-0000-4000-8000-000000000001',a,10000,'INR','50000000-0000-4000-8000-000000000001','bank_transfer','refund-1',null,'Bank return verified');
  perform pg_temp.assert_true((j->>'replayed')::boolean and (j->>'payment_id')::uuid=r,'same request retry returns same refund');
  j:=public.record_refund_v1('40000000-0000-4000-8000-000000000001',a,10000,'INR','50000000-0000-4000-8000-000000000002','bank_transfer','refund-1',null,'Bank return verified');
  perform pg_temp.assert_true((j->>'replayed')::boolean and (select count(*)=1 from public.payments where payment_kind='refund'),'provider reference retry creates no extra cash return');
  perform pg_temp.expect_error(format($q$select public.record_refund_v1('40000000-0000-4000-8000-000000000001',%L,11000,'INR','50000000-0000-4000-8000-000000000001','bank_transfer','refund-1',null,'Bank return verified')$q$,a),'conflicts','reused request with changed amount rejected');
  perform pg_temp.expect_error(format($q$select public.record_refund_v1('40000000-0000-4000-8000-000000000001',%L,20000.01,'INR','50000000-0000-4000-8000-000000000003','bank_transfer',null,null,'Verified')$q$,a),'exceeds','cumulative over-refund rejected');
  perform pg_temp.expect_error(format($q$select public.record_refund_v1('40000000-0000-4000-8000-000000000001',%L,1,'USD','50000000-0000-4000-8000-000000000003','bank_transfer',null,null,'Verified')$q$,a),'same lead','currency mismatch rejected');
  perform pg_temp.expect_error(format($q$select public.record_refund_v1('40000000-0000-4000-8000-000000000003',%L,1,'INR','50000000-0000-4000-8000-000000000003','bank_transfer',null,null,'Verified')$q$,a),'same lead','other lead original rejected');
  perform pg_temp.expect_error(format($q$select public.record_refund_v1('40000000-0000-4000-8000-000000000001',%L,1,'INR','50000000-0000-4000-8000-000000000003','bank_transfer',null,null,'Verified')$q$,r),'same lead','refund of a refund rejected');
  perform pg_temp.expect_error(format($q$select public.record_refund_v1('40000000-0000-4000-8000-000000000001',%L,0.001,'INR','50000000-0000-4000-8000-000000000003','bank_transfer',null,null,'Verified')$q$,a),'two decimal','sub-cent amount rejected');
  perform pg_temp.expect_error(format($q$select public.record_refund_v1('40000000-0000-4000-8000-000000000001',%L,'NaN','INR','50000000-0000-4000-8000-000000000003','bank_transfer',null,null,'Verified')$q$,a),'two decimal','NaN amount rejected');
  perform pg_temp.expect_error(format($q$select public.record_refund_v1('40000000-0000-4000-8000-000000000001',%L,1,'INR','50000000-0000-4000-8000-000000000003','bank_transfer',null,null,' ')$q$,a),'reason','missing reason rejected');
  perform pg_temp.expect_error($q$insert into public.payments(lead_id,organization_id,payment_kind,status,amount,currency) values('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','refund','refunded',1,'INR')$q$,'row-level security','direct browser refund insert denied');
  update public.payments set amount=1 where id=r;
  get diagnostics changed = row_count;
  perform pg_temp.assert_true(changed=0,'direct browser refund edit denied');
  perform pg_temp.expect_error(format('update public.payments set amount=1 where id=%L',a),'immutable','refunded original amount protected');
  perform pg_temp.expect_error(format('delete from public.payments where id=%L',a),'cannot be deleted','refunded original deletion protected');
  perform pg_temp.expect_error(format($q$select public.record_refund_v1('40000000-0000-4000-8000-000000000001',%L,0,'INR','50000000-0000-4000-8000-000000000003','bank_transfer',null,null,'Verified')$q$,a),'two decimal','zero refund rejected');
  perform pg_temp.expect_error(format($q$select public.record_refund_v1('40000000-0000-4000-8000-000000000001',%L,-1,'INR','50000000-0000-4000-8000-000000000003','bank_transfer',null,null,'Verified')$q$,a),'two decimal','negative refund rejected');
  perform pg_temp.expect_error(format($q$select public.record_refund_v1('40000000-0000-4000-8000-000000000001',%L,'Infinity','INR','50000000-0000-4000-8000-000000000003','bank_transfer',null,null,'Verified')$q$,a),'two decimal','infinite refund rejected');
  perform pg_temp.expect_error(format($q$select public.record_refund_v1('40000000-0000-4000-8000-000000000001',%L,1,'INR',null,'bank_transfer',null,null,'Verified')$q$,a),'request ID','missing request key rejected');
  perform pg_temp.expect_error(format($q$select public.record_refund_v1('40000000-0000-4000-8000-000000000001',%L,1,null,'50000000-0000-4000-8000-000000000003','bank_transfer',null,null,'Verified')$q$,a),'currency','missing currency rejected');
  perform pg_temp.expect_error(format($q$select public.record_refund_v1('40000000-0000-4000-8000-000000000001',%L,1,'INR','50000000-0000-4000-8000-000000000003',null,null,null,'Verified')$q$,a),'method','missing method rejected');
  perform pg_temp.expect_error(format($q$select public.record_refund_v1('40000000-0000-4000-8000-000000000001',%L,1,'INR','50000000-0000-4000-8000-000000000003','bank_transfer','deposit-1',null,'Verified')$q$,a),'conflicts','collection reference cannot become a refund');
  delete from public.payments where id=r;
  get diagnostics changed = row_count;
  perform pg_temp.assert_true(changed=0,'direct browser refund deletion denied');
  perform pg_temp.expect_error($q$select public.verify_payment_v1('40000000-0000-4000-8000-000000000001',1,'INR','other','cash',null,null,null)$q$,'evidence','direct verification without evidence rejected');
  perform pg_temp.expect_error($q$select public.verify_payment_v1('40000000-0000-4000-8000-000000000001',1.001,'INR','other','cash','bad-precision')$q$,'two decimal','direct verification cannot round sub-cent input');
  perform pg_temp.expect_error($q$select public.verify_payment_v1('40000000-0000-4000-8000-000000000001',1,'INR','other','cash','bad-task',null,'Verified','70000000-0000-4000-8000-000000000001')$q$,'open payment','invalid verification task blocks financial write');
end; $test$;
reset role;
select pg_temp.assert_true((select count(*)=1 from public.activities where activity_type='refund_recorded'),'one refund audit after repeated retries');
select pg_temp.assert_true((select current_stage='closed_won' and status='won' from public.leads where id='40000000-0000-4000-8000-000000000001'),'refund does not change stage or enrollment');

-- Inject an audit failure; the payment insert must roll back with it.
create function pg_temp.fail_refund_audit() returns trigger language plpgsql as $fail$
begin if new.activity_type='refund_recorded' then raise exception 'synthetic audit failure'; end if;return new;end;$fail$;
create trigger synthetic_audit_failure before insert on public.activities for each row execute function pg_temp.fail_refund_audit();
set local role authenticated;
select pg_temp.expect_error($q$select public.record_refund_v1('40000000-0000-4000-8000-000000000001',(select id from public.payments where external_payment_id='balance-1'),1,'INR','50000000-0000-4000-8000-000000000004','bank_transfer',null,null,'Verified')$q$,'synthetic audit failure','audit failure rejects entire command');
reset role;
select pg_temp.assert_true((select count(*)=1 from public.payments where payment_kind='refund'),'audit failure leaves no extra refund row');
drop trigger synthetic_audit_failure on public.activities;

-- Existing unlinked refunds are never silently assigned to a selected original.
insert into public.payments(lead_id,organization_id,payment_kind,status,amount,currency) values
('40000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','deposit','paid',100,'USD'),
('40000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','refund','refunded',10,'USD');
set local role authenticated;
select pg_temp.expect_error($q$select public.record_refund_v1('40000000-0000-4000-8000-000000000003',(select id from public.payments where lead_id='40000000-0000-4000-8000-000000000003' and payment_kind='deposit'),1,'USD','50000000-0000-4000-8000-000000000005','bank_transfer',null,null,'Verified')$q$,'Reconcile','unlinked historical refund blocks new recording');

select set_config('request.jwt.claims','{"role":"authenticated","sub":"20000000-0000-4000-8000-000000000002","session_id":"30000000-0000-4000-8000-000000000002"}',true);
select pg_temp.expect_error($q$select public.record_refund_v1('40000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001',1,'INR','50000000-0000-4000-8000-000000000006','bank_transfer',null,null,'Verified')$q$,'Not authorized','cross-tenant command denied');
select set_config('request.jwt.claims','{"role":"authenticated","sub":"20000000-0000-4000-8000-000000000003","session_id":"30000000-0000-4000-8000-000000000003"}',true);
select pg_temp.expect_error($q$select public.record_refund_v1('40000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001',1,'INR','50000000-0000-4000-8000-000000000006','bank_transfer',null,null,'Verified')$q$,'Not authorized','employee command denied');
reset role;
select pg_temp.assert_true(not has_function_privilege('anon','public.record_refund_v1(uuid,uuid,numeric,text,uuid,text,text,timestamptz,text)','EXECUTE'),'anonymous execution denied');
select pg_temp.expect_error($q$update public.payments set metadata='{}' where original_payment_id is not null$q$,'immutable','privileged linked refund edits rejected');
update public.profiles set active=false where id='20000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"20000000-0000-4000-8000-000000000001","session_id":"30000000-0000-4000-8000-000000000001"}',true);
select pg_temp.expect_error($q$select public.record_refund_v1('40000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001',1,'INR','50000000-0000-4000-8000-000000000006','bank_transfer',null,null,'Verified')$q$,'Authentication','inactive profile denied');
reset role;
do $count$ begin
  if (select count(*) from pg_temp.assertions) <> 40 then raise exception 'Incorrect assertion count'; end if;
end; $count$;
rollback;
select 'refund_readiness_v1' as suite,40 as assertions_completed,
  to_regclass('public.payments') is null and to_regclass('public.organizations') is null
  and to_regprocedure('public.record_refund_v1(uuid,uuid,numeric,text,uuid,text,text,timestamptz,text)') is null as rollback_verified;
