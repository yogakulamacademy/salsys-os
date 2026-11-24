-- R13 manual-first pilot. Candidate only; no migration or seed.
-- Depends on P0, P1 governed plans and plan-change requests.
-- A decision is authorization evidence, NOT payment or runtime activation.
begin;
alter table saas_governance.operators add column may_approve_pilot boolean not null default false;

-- Count distinct approved organizations over the pilot lifetime. A customer
-- changing plans does not consume another slot. Never cap Free registration.
create table saas_governance.manual_pilot_organizations (
  organization_id uuid primary key references public.organizations(id) on delete restrict,
  slot integer not null unique check(slot between 1 and 10),
  enrolled_at timestamptz not null default clock_timestamp()
);
create table saas_governance.manual_pilot_approvals (
  request_id uuid primary key references saas_governance.subscription_change_requests(id) on delete restrict,
  organization_id uuid not null references saas_governance.manual_pilot_organizations(organization_id) on delete restrict,
  subscription_id uuid not null,
  plan_id uuid not null,
  plan_version integer not null,
  offer_digest text not null check(offer_digest ~ '^[0-9a-f]{64}$'),
  source_revision timestamptz not null,
  approval_mode text not null check(approval_mode in ('free','offline_confirmation','complimentary')),
  offline_reference text,
  approved_by uuid not null,
  approval_reason text not null check(char_length(btrim(approval_reason)) between 10 and 2048),
  approved_at timestamptz not null default clock_timestamp(),
  access_ends_at timestamptz,
  check((approval_mode='offline_confirmation' and offline_reference is not null and char_length(btrim(offline_reference)) between 3 and 256)
    or (approval_mode in ('free','complimentary') and offline_reference is null)),
  check(access_ends_at is null or access_ends_at>approved_at),
  check((approval_mode='free')=(access_ends_at is null)),
  foreign key(subscription_id,organization_id) references public.saas_organization_subscriptions(id,organization_id) on delete restrict,
  foreign key(plan_id,plan_version) references saas_governance.published_plan_versions(plan_id,version) on delete restrict
);
alter table saas_governance.manual_pilot_organizations enable row level security;
alter table saas_governance.manual_pilot_approvals enable row level security;
revoke all on saas_governance.manual_pilot_organizations,saas_governance.manual_pilot_approvals
  from public,anon,authenticated,service_role;
create trigger pilot_organizations_immutable before update or delete on saas_governance.manual_pilot_organizations
  for each row execute function saas_governance.block_immutable();
create trigger pilot_organizations_no_truncate before truncate on saas_governance.manual_pilot_organizations
  for each statement execute function saas_governance.block_immutable();
create trigger pilot_approvals_immutable before update or delete on saas_governance.manual_pilot_approvals
  for each row execute function saas_governance.block_immutable();
create trigger pilot_approvals_no_truncate before truncate on saas_governance.manual_pilot_approvals
  for each statement execute function saas_governance.block_immutable();

create function saas_governance.require_pilot_approver(p_actor uuid) returns void
language plpgsql security definer set search_path=pg_catalog as $fn$
begin
  perform saas_governance.require_operator(p_actor,null);
  if not exists(select 1 from saas_governance.operators where user_id=p_actor and active and may_approve_pilot)
    then raise exception 'Manual pilot approval permission required' using errcode='42501'; end if;
end;
$fn$;

-- Customer already requested the exact published offer. Admin records their
-- approval, explicit offline reference (not provider-verified), or an
-- explicit complimentary grant. No quote/payment gateway is required.
-- Approval must be revalidated by the integrated activation transaction.
create function saas_governance.approve_manual_pilot_request(
  p_actor uuid,p_request uuid,p_digest text,p_mode text,p_reference text,p_reason text,p_ends_at timestamptz
) returns uuid language plpgsql security definer set search_path=pg_catalog as $fn$
declare v_org uuid; v_req saas_governance.subscription_change_requests%rowtype;
  v_sub public.saas_organization_subscriptions%rowtype; v_offer saas_governance.published_plan_versions%rowtype;
  v_prior saas_governance.manual_pilot_approvals%rowtype; v_slot integer;
begin
  perform saas_governance.require_pilot_approver(p_actor);
  if p_mode is null or p_mode not in ('free','offline_confirmation','complimentary')
    or p_reason is null or char_length(btrim(p_reason)) not between 10 and 2048
    or (p_mode='offline_confirmation' and (p_reference is null or char_length(btrim(p_reference)) not between 3 and 256))
    or (p_mode<>'offline_confirmation' and p_reference is not null)
    then raise exception 'Explicit approval terms required'; end if;
  select organization_id into v_org from saas_governance.subscription_change_requests where id=p_request;
  if not found then raise exception 'Request unavailable'; end if;
  -- Serialize all admissions to the ten-organization pilot. Acquire global
  -- lock before tenant lock; future activation must follow the same order.
  perform pg_advisory_xact_lock(hashtextextended('saas_manual_pilot_10',0));
  perform pg_advisory_xact_lock(hashtextextended('saas_change:'||v_org::text,0));
  select * into v_prior from saas_governance.manual_pilot_approvals where request_id=p_request;
  if found then
    if v_prior.approved_by<>p_actor or v_prior.offer_digest is distinct from p_digest
      or v_prior.approval_mode<>p_mode or v_prior.offline_reference is distinct from p_reference
      or v_prior.approval_reason<>p_reason or v_prior.access_ends_at is distinct from p_ends_at
      then raise exception 'Approval already recorded with different terms'; end if;
    return p_request;
  end if;
  select * into v_req from saas_governance.subscription_change_requests where id=p_request for update;
  if v_req.status<>'requested' or v_req.requested_by=p_actor or v_req.target_digest is distinct from p_digest
    or not exists(select 1 from public.organizations where id=v_org and status='active')
    or not exists(select 1 from public.organization_members m
      join public.profiles pr on pr.id=m.user_id and pr.active
      join auth.users u on u.id=m.user_id and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false)
      where m.organization_id=v_org and m.user_id=v_req.requested_by and m.active and m.role='owner')
    then raise exception 'Current independent plan request required'; end if;
  perform 1 from saas_governance.change_request_access where organization_id=v_org and enabled for share;
  if not found then raise exception 'Plan changes unavailable'; end if;
  select * into v_sub from public.saas_organization_subscriptions where id=v_req.subscription_id and organization_id=v_org for update;
  if not found or v_sub.updated_at<>v_req.from_subscription_updated_at or v_sub.plan_id<>v_req.from_plan_id
    or v_sub.status not in ('active','trialing')
    or (v_sub.status='trialing' and (v_sub.trial_ends_at is null or v_sub.trial_ends_at<=clock_timestamp()))
    then raise exception 'Subscription changed; new request required'; end if;
  select p.* into v_offer from saas_governance.published_plan_versions p
    join public.saas_plans c on c.id=p.plan_id and c.version=p.version and c.code=p.plan_code and c.status='active'
    where p.plan_id=v_req.target_plan_id and p.version=v_req.target_version
      and p.snapshot_sha256=p_digest and p.effective_from<=clock_timestamp() for share of c;
  if not found then raise exception 'Published offer unavailable'; end if;
  if (v_offer.plan_code='free' and (p_mode<>'free' or p_ends_at is not null or v_offer.amount_minor<>0))
    or (v_offer.plan_code<>'free' and (p_mode='free' or p_ends_at is null or p_ends_at<=clock_timestamp()
      or p_ends_at>clock_timestamp()+interval '1 month'))
    then raise exception 'Free is permanent; paid-tier pilot access requires an explicit period of up to one month'; end if;
  if not exists(select 1 from saas_governance.manual_pilot_organizations where organization_id=v_org) then
    select min(n) into v_slot from generate_series(1,10) n
      where not exists(select 1 from saas_governance.manual_pilot_organizations where slot=n);
    if v_slot is null then raise exception 'Manual pilot capacity reached'; end if;
    insert into saas_governance.manual_pilot_organizations(organization_id,slot) values(v_org,v_slot);
  end if;
  insert into saas_governance.manual_pilot_approvals(request_id,organization_id,subscription_id,plan_id,plan_version,
    offer_digest,source_revision,approval_mode,offline_reference,approved_by,approval_reason,access_ends_at)
  values(p_request,v_org,v_sub.id,v_offer.plan_id,v_offer.version,p_digest,v_sub.updated_at,p_mode,p_reference,p_actor,p_reason,p_ends_at);
  return p_request;
end;
$fn$;

create function saas_governance.list_manual_pilot_queue(p_actor uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $fn$
declare v_rows jsonb;
begin
  perform saas_governance.require_pilot_approver(p_actor);
  select coalesce(jsonb_agg(to_jsonb(x) order by x.requested_at,x.id),'[]'::jsonb) into v_rows from (
    select r.id,o.name as organization_name,p.plan_code,p.version,p.amount_minor,p.snapshot_sha256 as digest,
      r.requested_at,a.approved_at,a.approval_mode,a.access_ends_at
    from saas_governance.subscription_change_requests r
    join public.organizations o on o.id=r.organization_id and o.status='active'
    join saas_governance.change_request_access e on e.organization_id=o.id and e.enabled
    join public.saas_organization_subscriptions s on s.id=r.subscription_id and s.organization_id=o.id
    join saas_governance.published_plan_versions p on p.plan_id=r.target_plan_id and p.version=r.target_version and p.snapshot_sha256=r.target_digest
    join public.saas_plans c on c.id=p.plan_id and c.version=p.version and c.status='active'
    left join saas_governance.manual_pilot_approvals a on a.request_id=r.id
    where r.status='requested' and r.requested_by<>p_actor
      and s.updated_at=r.from_subscription_updated_at and s.plan_id=r.from_plan_id
      and s.status in ('active','trialing') and (s.status<>'trialing' or s.trial_ends_at>clock_timestamp())
      and p.effective_from<=clock_timestamp()
    order by r.requested_at,r.id limit 100
  ) x;
  return jsonb_build_object('used_slots',(select count(*) from saas_governance.manual_pilot_organizations),
    'max_slots',10,'requests',v_rows);
end;
$fn$;
revoke all on function saas_governance.require_pilot_approver(uuid),
  saas_governance.approve_manual_pilot_request(uuid,uuid,text,text,text,text,timestamptz),
  saas_governance.list_manual_pilot_queue(uuid) from public,anon,authenticated,service_role;
grant execute on function saas_governance.approve_manual_pilot_request(uuid,uuid,text,text,text,text,timestamptz),
  saas_governance.list_manual_pilot_queue(uuid) to service_role;
create function public.commercial_list_manual_pilot_v1(p_actor uuid) returns jsonb
language sql security invoker set search_path=pg_catalog as $fn$
  select saas_governance.list_manual_pilot_queue(p_actor);
$fn$;
create function public.commercial_approve_manual_pilot_v1(p_actor uuid,p_request uuid,p_digest text,p_mode text,p_reference text,p_reason text,p_ends_at timestamptz)
returns uuid language sql security invoker set search_path=pg_catalog as $fn$
  select saas_governance.approve_manual_pilot_request(p_actor,p_request,p_digest,p_mode,p_reference,p_reason,p_ends_at);
$fn$;
revoke all on function public.commercial_list_manual_pilot_v1(uuid),
  public.commercial_approve_manual_pilot_v1(uuid,uuid,text,text,text,text,timestamptz)
from public,anon,authenticated,service_role;
grant execute on function public.commercial_list_manual_pilot_v1(uuid),
  public.commercial_approve_manual_pilot_v1(uuid,uuid,text,text,text,text,timestamptz)
to service_role;
-- Gateway evidence stays independent. Offline approval never fabricates a
-- settled gateway payment, invoice, renewal mandate or access change.
commit;
