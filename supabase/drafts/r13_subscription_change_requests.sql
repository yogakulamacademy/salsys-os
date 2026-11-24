-- R13-P1/P3 contract boundary candidate. NOT a migration.
-- Requires P0 and r13_governed_plan_admin.sql. No seed, charge, or plan assignment.
begin;

-- Enrollment in the request pilot must be separately approved. This is not
-- an entitlement grant and does not modify a customer's existing subscription.
create table saas_governance.change_request_access (
  organization_id uuid primary key references public.organizations(id) on delete restrict,
  enabled boolean not null default false,
  approval_ref text not null check(char_length(btrim(approval_ref)) between 10 and 512)
);
create table saas_governance.subscription_change_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  subscription_id uuid not null,
  requested_by uuid not null,
  request_origin text not null default 'customer' check(request_origin in ('customer','admin')),
  supersedes_request_id uuid references saas_governance.subscription_change_requests(id) on delete restrict,
  idempotency_key uuid not null,
  from_plan_id uuid not null references public.saas_plans(id) on delete restrict,
  from_subscription_updated_at timestamptz not null,
  target_plan_id uuid not null,
  target_version integer not null,
  target_digest text not null check(target_digest ~ '^[0-9a-f]{64}$'),
  status text not null default 'requested' check(status in ('requested','withdrawn','activated','superseded')),
  requested_at timestamptz not null default clock_timestamp(),
  withdrawn_at timestamptz,
  withdrawn_by uuid,
  check((status in ('requested','activated','superseded') and withdrawn_at is null and withdrawn_by is null)
    or (status='withdrawn' and withdrawn_at is not null and withdrawn_by is not null)),
  foreign key(subscription_id,organization_id) references public.saas_organization_subscriptions(id,organization_id) on delete restrict,
  foreign key(target_plan_id,target_version) references saas_governance.published_plan_versions(plan_id,version) on delete restrict,
  unique(organization_id,idempotency_key)
);
create unique index subscription_one_pending_change_v1
  on saas_governance.subscription_change_requests(organization_id) where status='requested';
create table saas_governance.subscription_change_events (
  request_id uuid not null references saas_governance.subscription_change_requests(id) on delete restrict,
  action text not null check(action in ('requested','withdrawn','activated')),
  actor_user_id uuid not null,
  occurred_at timestamptz not null default clock_timestamp(),
  primary key(request_id,action)
);
alter table saas_governance.change_request_access enable row level security;
alter table saas_governance.subscription_change_requests enable row level security;
alter table saas_governance.subscription_change_events enable row level security;
revoke all on saas_governance.change_request_access,saas_governance.subscription_change_requests,
  saas_governance.subscription_change_events from public,anon,authenticated,service_role;
create trigger change_events_immutable before update or delete on saas_governance.subscription_change_events
for each row execute function saas_governance.block_immutable();
create trigger change_events_no_truncate before truncate on saas_governance.subscription_change_events
for each statement execute function saas_governance.block_immutable();

-- Current session only. No organization or actor chosen by the browser.
-- Do not expose this private resolver through the Data API.
create function saas_governance.current_change_owner() returns uuid
language plpgsql security definer set search_path=pg_catalog as $fn$
declare v_context jsonb; v_org uuid;
begin
  if auth.role() is distinct from 'authenticated' or auth.uid() is null
    or not exists(select 1 from auth.users u where u.id=auth.uid()
      and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false))
    or not exists(select 1 from public.profiles p where p.id=auth.uid() and p.active)
  then raise exception 'Active verified account required' using errcode='42501'; end if;
  v_context:=public.get_current_workspace_context_v1();
  v_org:=nullif(v_context->>'organization_id','')::uuid;
  if v_org is null or v_context->>'role' is distinct from 'owner'
    or not exists(select 1 from public.organization_members m
      join public.organizations o on o.id=m.organization_id and o.status='active'
      where m.organization_id=v_org and m.user_id=auth.uid() and m.active and m.role='owner')
  then raise exception 'Subscription owner required' using errcode='42501'; end if;
  return v_org;
end;
$fn$;
revoke all on function saas_governance.current_change_owner() from public,anon,authenticated,service_role;

-- Read exact approved offer terms, not unpublished proposals. Existing
-- customer subscription terms are never inferred from a current price.
create function public.get_current_plan_change_options_v1() returns jsonb
language plpgsql security definer set search_path=pg_catalog as $fn$
declare v_org uuid; v_sub public.saas_organization_subscriptions%rowtype; v_offers jsonb; v_requests jsonb;
begin
  v_org:=saas_governance.current_change_owner();
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',r.id,'status',r.status,'request_origin',r.request_origin,'target_code',p.plan_code,'target_version',r.target_version,
    'amount_minor',p.amount_minor,'currency',p.currency,'requested_at',r.requested_at,
    'withdrawn_at',r.withdrawn_at) order by r.requested_at desc,r.id),'[]'::jsonb)
    into v_requests from (
      select * from saas_governance.subscription_change_requests
      where organization_id=v_org order by requested_at desc,id limit 50
    ) r join saas_governance.published_plan_versions p
      on p.plan_id=r.target_plan_id and p.version=r.target_version;
  if not exists(select 1 from saas_governance.change_request_access where organization_id=v_org and enabled)
    then return jsonb_build_object('state','unavailable','requests',v_requests); end if;
  select * into v_sub from public.saas_organization_subscriptions where organization_id=v_org;
  if not found or v_sub.status not in ('active','trialing') or
    (v_sub.status='trialing' and (v_sub.trial_ends_at is null or v_sub.trial_ends_at<=clock_timestamp()))
  then return jsonb_build_object('state','unavailable','requests',v_requests); end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'plan_id',p.plan_id,'version',p.version,'digest',p.snapshot_sha256,'code',p.plan_code,
    'display_name',p.snapshot->>'display_name','amount_minor',p.amount_minor,'currency',p.currency,
    'billing_period',p.billing_period,'setup_min_minor',p.setup_min_minor,'setup_max_minor',p.setup_max_minor,
    'setup_optional',p.setup_optional,'tax_treatment',p.tax_treatment,
    'named_users',p.snapshot->'named_users','lead_records',p.snapshot->'lead_records') order by p.amount_minor,p.plan_code),'[]'::jsonb)
  into v_offers from saas_governance.published_plan_versions p
  join public.saas_plans c on c.id=p.plan_id and c.code=p.plan_code and c.version=p.version and c.status='active'
  where p.effective_from<=clock_timestamp() and (p.plan_id<>v_sub.plan_id or v_sub.status='trialing' or (v_sub.metadata->>'origin'='manual_pilot_contract' and v_sub.current_period_ends_at>clock_timestamp()));
  return jsonb_build_object('state','available','subscription_revision',v_sub.updated_at,'offers',v_offers,'requests',v_requests);
end;
$fn$;

create function public.request_current_plan_change_v1(
  p_idempotency_key uuid,p_target_plan uuid,p_target_version integer,p_target_digest text,
  p_expected_subscription_updated_at timestamptz
) returns uuid language plpgsql security definer set search_path=pg_catalog as $fn$
declare v_org uuid; v_sub public.saas_organization_subscriptions%rowtype;
  v_offer saas_governance.published_plan_versions%rowtype;
  v_old saas_governance.subscription_change_requests%rowtype; v_id uuid;
begin
  v_org:=saas_governance.current_change_owner();
  if p_idempotency_key is null or p_target_plan is null or p_target_version is null
    or p_target_digest is null or p_expected_subscription_updated_at is null
  then raise exception 'Exact offer and subscription version required'; end if;
  perform pg_advisory_xact_lock(hashtextextended('saas_change:'||v_org::text,0));
  select * into v_old from saas_governance.subscription_change_requests
    where organization_id=v_org and idempotency_key=p_idempotency_key;
  if found then
    if v_old.requested_by<>auth.uid() or v_old.target_plan_id<>p_target_plan
      or v_old.target_version<>p_target_version or v_old.target_digest<>p_target_digest
      or v_old.from_subscription_updated_at<>p_expected_subscription_updated_at
    then raise exception 'Request key already used for different terms'; end if;
    return v_old.id;
  end if;
  if not exists(select 1 from saas_governance.change_request_access where organization_id=v_org and enabled)
    then raise exception 'Plan change requests unavailable' using errcode='42501'; end if;
  select * into v_sub from public.saas_organization_subscriptions where organization_id=v_org for update;
  if not found or v_sub.updated_at is distinct from p_expected_subscription_updated_at
    or v_sub.status not in ('active','trialing')
    or (v_sub.status='trialing' and (v_sub.trial_ends_at is null or v_sub.trial_ends_at<=clock_timestamp()))
    or (v_sub.plan_id=p_target_plan and v_sub.status<>'trialing' and not coalesce(v_sub.metadata->>'origin'='manual_pilot_contract' and v_sub.current_period_ends_at>clock_timestamp(),false)) then raise exception 'Subscription changed; refresh options' using errcode='40001'; end if;
  select p.* into v_offer from saas_governance.published_plan_versions p
    join public.saas_plans c on c.id=p.plan_id and c.code=p.plan_code and c.version=p.version and c.status='active'
    where p.plan_id=p_target_plan and p.version=p_target_version and p.snapshot_sha256=p_target_digest
      and p.effective_from<=clock_timestamp() for share of c;
  if not found then raise exception 'Offer changed or unavailable'; end if;
  insert into saas_governance.subscription_change_requests(
    organization_id,subscription_id,requested_by,idempotency_key,from_plan_id,from_subscription_updated_at,
    target_plan_id,target_version,target_digest)
    values(v_org,v_sub.id,auth.uid(),p_idempotency_key,v_sub.plan_id,v_sub.updated_at,
      v_offer.plan_id,v_offer.version,v_offer.snapshot_sha256) returning id into v_id;
  insert into saas_governance.subscription_change_events(request_id,action,actor_user_id)
    values(v_id,'requested',auth.uid());
  return v_id;
end;
$fn$;

-- Withdrawal remains possible even if new requests have been disabled.
create function public.withdraw_current_plan_change_v1(p_request uuid) returns boolean
language plpgsql security definer set search_path=pg_catalog as $fn$
declare v_org uuid; v_id uuid;
begin
  v_org:=saas_governance.current_change_owner();
  perform pg_advisory_xact_lock(hashtextextended('saas_change:'||v_org::text,0));
  update saas_governance.subscription_change_requests set status='withdrawn',
    withdrawn_at=clock_timestamp(),withdrawn_by=auth.uid()
    where id=p_request and organization_id=v_org and status='requested' returning id into v_id;
  if not found then return false; end if;
  insert into saas_governance.subscription_change_events(request_id,action,actor_user_id)
    values(v_id,'withdrawn',auth.uid());
  return true;
end;
$fn$;
revoke all on function public.get_current_plan_change_options_v1(),
  public.request_current_plan_change_v1(uuid,uuid,integer,text,timestamptz),
  public.withdraw_current_plan_change_v1(uuid)
from public,anon,authenticated,service_role;
grant execute on function public.get_current_plan_change_options_v1(),
  public.request_current_plan_change_v1(uuid,uuid,integer,text,timestamptz),
  public.withdraw_current_plan_change_v1(uuid) to authenticated;
-- No application or approval-to-activation function, no billing or subscription update.
commit;
