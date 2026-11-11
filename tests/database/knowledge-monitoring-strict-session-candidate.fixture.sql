-- KB-05C: disposable SQL-only candidate for FUTURE website monitoring auth.
-- This file is inserted ONLY into the KB-05B generated rollback transaction.
-- The helper is pg_temp, is NOT a migration, and is NEVER installed in the
-- application or production database. No knowledge route can invoke it.
-- Synthetic local JWT claims do not prove an actual signed Supabase session.

create function pg_temp.kb05c_strict_monitoring_session_candidate(p_org uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $kb05c_guard$
declare
  v_actor uuid := auth.uid();
  v_raw_session text := auth.jwt() ->> 'session_id';
  v_session uuid;
begin
  -- Explicit tenant + authenticated user + session are mandatory.
  -- The global sole-membership fallback intentionally does NOT apply.
  if auth.role() is distinct from 'authenticated'
    or v_actor is null
    or p_org is null
    or v_raw_session is null
    or length(v_raw_session) > 50
  then
    return false;
  end if;

  begin
    v_session := v_raw_session::uuid;
  exception when invalid_text_representation then
    return false;
  end;

  return exists (
    select 1
    from public.tenant_session_bindings b
    join public.organizations o
      on o.id = b.organization_id
     and o.status = 'active'
    join public.organization_members m
      on m.organization_id = b.organization_id
     and m.user_id = b.user_id
     and m.active = true
     and m.role in ('owner','admin')
    where b.session_id = v_session
      and b.user_id = v_actor
      and b.organization_id = p_org
  );
end;
$kb05c_guard$;

-- Positive control: A has exactly one matching owner session, and can be
-- allowed to REQUEST future review of its own sources (not execute a crawl).
set local role authenticated;
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"20000000-0000-4000-8000-000000000001","session_id":"30000000-0000-4000-8000-000000000001"}',true);
select pg_temp.assert_true(
  pg_temp.kb05c_strict_monitoring_session_candidate(
    '10000000-0000-4000-8000-000000000001'),
  'KB05C positive matched owner session A');
select pg_temp.assert_true(
  not pg_temp.kb05c_strict_monitoring_session_candidate(
    '10000000-0000-4000-8000-000000000002'),
  'KB05C owner A cannot authorize monitoring B');

-- Document the LEGACY risk without treating it as permission for future KB:
-- singleton membership can stay true when presented with somebody else's
-- session ID, while the candidate strict guard must refuse.
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"20000000-0000-4000-8000-000000000001","session_id":"30000000-0000-4000-8000-000000000002"}',true);
select pg_temp.assert_true(
  not pg_temp.kb05c_strict_monitoring_session_candidate(
    '10000000-0000-4000-8000-000000000001'),
  'KB05C mismatched user-bound session denies A');

select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"20000000-0000-4000-8000-000000000001"}',true);
select pg_temp.assert_true(
  not pg_temp.kb05c_strict_monitoring_session_candidate(
    '10000000-0000-4000-8000-000000000001'),
  'KB05C absent session denies');

select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"20000000-0000-4000-8000-000000000001","session_id":"not-a-uuid"}',true);
select pg_temp.assert_true(
  not pg_temp.kb05c_strict_monitoring_session_candidate(
    '10000000-0000-4000-8000-000000000001'),
  'KB05C malformed session fails closed');

select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"20000000-0000-4000-8000-000000000001","session_id":"30000000-0000-4000-8000-000000000005"}',true);
select pg_temp.assert_true(
  not pg_temp.kb05c_strict_monitoring_session_candidate(
    '10000000-0000-4000-8000-000000000001'),
  'KB05C unbound session denies');

-- Other-org owner, employee, anonymous and service worker cannot pass the
-- owner/admin monitoring preflight through client claims.
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"20000000-0000-4000-8000-000000000002","session_id":"30000000-0000-4000-8000-000000000002"}',true);
select pg_temp.assert_true(
  pg_temp.kb05c_strict_monitoring_session_candidate(
    '10000000-0000-4000-8000-000000000002'),
  'KB05C owner B matched session allowed only for B');
select pg_temp.assert_true(
  not pg_temp.kb05c_strict_monitoring_session_candidate(
    '10000000-0000-4000-8000-000000000001'),
  'KB05C owner B cannot authorize tenant A via extra employee membership');

select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"20000000-0000-4000-8000-000000000003","session_id":"30000000-0000-4000-8000-000000000003"}',true);
select pg_temp.assert_true(
  not pg_temp.kb05c_strict_monitoring_session_candidate(
    '10000000-0000-4000-8000-000000000001'),
  'KB05C employee cannot authorize monitoring even with bound session');

-- An actual bound admin (not just an owner) should be eligible in principle.
-- This is a synthetic change to the rollback-only test membership table.
reset role;
update public.organization_members set role='admin'
where user_id='20000000-0000-4000-8000-000000000003'
  and organization_id='10000000-0000-4000-8000-000000000001';
set local role authenticated;
select pg_temp.assert_true(
  pg_temp.kb05c_strict_monitoring_session_candidate(
    '10000000-0000-4000-8000-000000000001'),
  'KB05C bound active admin may enter review preflight');
reset role;
update public.organization_members set role='employee'
where user_id='20000000-0000-4000-8000-000000000003'
  and organization_id='10000000-0000-4000-8000-000000000001';
set local role authenticated;

select set_config('request.jwt.claims',
  '{"role":"anon","sub":"20000000-0000-4000-8000-000000000001","session_id":"30000000-0000-4000-8000-000000000001"}',true);
select pg_temp.assert_true(
  not pg_temp.kb05c_strict_monitoring_session_candidate(
    '10000000-0000-4000-8000-000000000001'),
  'KB05C anon role claim cannot authorize monitoring');

select set_config('request.jwt.claims',
  '{"role":"service_role","sub":"20000000-0000-4000-8000-000000000001","session_id":"30000000-0000-4000-8000-000000000001"}',true);
select pg_temp.assert_true(
  not pg_temp.kb05c_strict_monitoring_session_candidate(
    '10000000-0000-4000-8000-000000000001'),
  'KB05C service role is not an end-user monitoring actor');

-- Revocation of a session binding must immediately block the candidate.
reset role;
delete from public.tenant_session_bindings
where session_id='30000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"20000000-0000-4000-8000-000000000001","session_id":"30000000-0000-4000-8000-000000000001"}',true);
select pg_temp.assert_true(
  not pg_temp.kb05c_strict_monitoring_session_candidate(
    '10000000-0000-4000-8000-000000000001'),
  'KB05C revoked session binding denies subsequent review');
reset role;
insert into public.tenant_session_bindings
(session_id,user_id,organization_id) values
('30000000-0000-4000-8000-000000000001',
 '20000000-0000-4000-8000-000000000001',
 '10000000-0000-4000-8000-000000000001');

-- Revoking membership blocks the same previously valid binding.
update public.organization_members set active=false
where user_id='20000000-0000-4000-8000-000000000001'
  and organization_id='10000000-0000-4000-8000-000000000001';
set local role authenticated;
select pg_temp.assert_true(
  not pg_temp.kb05c_strict_monitoring_session_candidate(
    '10000000-0000-4000-8000-000000000001'),
  'KB05C inactive membership denies');
reset role;
update public.organization_members set active=true
where user_id='20000000-0000-4000-8000-000000000001'
  and organization_id='10000000-0000-4000-8000-000000000001';

-- Inactive organizations also fail closed, independent of membership.
update public.organizations set status='inactive'
where id='10000000-0000-4000-8000-000000000001';
set local role authenticated;
select pg_temp.assert_true(
  not pg_temp.kb05c_strict_monitoring_session_candidate(
    '10000000-0000-4000-8000-000000000001'),
  'KB05C inactive organization denies');
reset role;
update public.organizations set status='active'
where id='10000000-0000-4000-8000-000000000001';

-- Positive after simulated recovery: no grant survives a user/session mismatch.
set local role authenticated;
select pg_temp.assert_true(
  pg_temp.kb05c_strict_monitoring_session_candidate(
    '10000000-0000-4000-8000-000000000001'),
  'KB05C restored valid owner A session only');
reset role;

-- The candidate is intentionally a temp function. It has no production
-- migration, policy, grant or action route and cannot authorize KB-04B.
