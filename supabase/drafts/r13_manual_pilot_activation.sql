-- Integrated R13 manual pilot activation candidate. NOT a migration.
-- Requires actual P0, P1 (governed plans, change requests, manual approvals)
-- and P2 verified signup draft at 4f616524. No payment gateway dependency.
begin;

create table saas_governance.manual_subscription_contracts (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references saas_governance.manual_pilot_approvals(request_id) on delete restrict,
  organization_id uuid not null,
  subscription_id uuid not null,
  plan_id uuid not null,
  plan_version integer not null,
  offer_digest text not null check(offer_digest ~ '^[0-9a-f]{64}$'),
  snapshot jsonb not null check(jsonb_typeof(snapshot)='object'),
  workspace_codes text[] not null,
  integration_codes text[] not null,
  named_user_limit bigint not null check(named_user_limit>0),
  lead_record_limit bigint not null check(lead_record_limit>0),
  started_at timestamptz not null,
  ends_at timestamptz,
  activated_by uuid not null,
  check(ends_at is null or ends_at>started_at),
  foreign key(subscription_id,organization_id) references public.saas_organization_subscriptions(id,organization_id) on delete restrict,
  foreign key(plan_id,plan_version) references saas_governance.published_plan_versions(plan_id,version) on delete restrict
);
alter table saas_governance.manual_subscription_contracts enable row level security;
revoke all on saas_governance.manual_subscription_contracts from public,anon,authenticated,service_role;
create trigger manual_contract_immutable before update or delete on saas_governance.manual_subscription_contracts
for each row execute function saas_governance.block_immutable();
create trigger manual_contract_no_truncate before truncate on saas_governance.manual_subscription_contracts
for each statement execute function saas_governance.block_immutable();

-- Canonical subscription points to an immutable contract. Only newly verified
-- self-signup tenants with known counters and pinned Free fallback are eligible.
-- This deliberately does not convert legacy customers or auto-grant AI,
-- automation, education/residential capabilities or provider credentials.
create function saas_governance.activate_manual_pilot(p_actor uuid,p_request uuid,p_digest text)
returns uuid language plpgsql security definer set search_path=pg_catalog as $fn$
declare v_org uuid;
  v_approval saas_governance.manual_pilot_approvals%rowtype;
  v_req saas_governance.subscription_change_requests%rowtype;
  v_sub public.saas_organization_subscriptions%rowtype;
  v_intent public.signup_registration_intents%rowtype;
  v_offer saas_governance.published_plan_versions%rowtype;
  v_scope text[]; v_integrations text[]; v_id uuid; v_now timestamptz;
begin
  perform saas_governance.require_pilot_approver(p_actor);
  select organization_id into v_org from saas_governance.manual_pilot_approvals where request_id=p_request;
  if not found then raise exception 'Manual approval required'; end if;
  perform pg_advisory_xact_lock(hashtextextended('saas_manual_pilot_10',0));
  perform pg_advisory_xact_lock(hashtextextended('saas_change:'||v_org::text,0));
  select * into v_approval from saas_governance.manual_pilot_approvals where request_id=p_request;
  if v_approval.approved_by<>p_actor or v_approval.offer_digest is distinct from p_digest
    then raise exception 'Exact approving operator and offer required'; end if;
  select id into v_id from saas_governance.manual_subscription_contracts where request_id=p_request;
  if found then return v_id; end if;
  select * into v_req from saas_governance.subscription_change_requests where id=p_request for update;
  if not found or v_req.status<>'requested' or v_req.requested_by=p_actor
    or not exists(select 1 from public.organizations where id=v_org and status='active')
    or not exists(select 1 from public.organization_members m join public.profiles pr on pr.id=m.user_id and pr.active
      join auth.users u on u.id=m.user_id and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false)
      where m.organization_id=v_org and m.user_id=v_req.requested_by and m.active and m.role='owner')
    then raise exception 'Current independent plan request required'; end if;
  perform 1 from saas_governance.change_request_access where organization_id=v_org and enabled for share;
  if not found then raise exception 'Plan changes unavailable'; end if;
  -- Usage row first, then signup intent, then subscription. Existing quota
  -- writes lock usage; expiry locks intent then subscription. No reverse order.
  perform 1 from public.signup_usage_counters where organization_id=v_org for update;
  if not found then raise exception 'Verified signup usage required'; end if;
  select * into v_intent from public.signup_registration_intents where organization_id=v_org for update;
  if not found then raise exception 'Verified signup required'; end if;
  select * into v_sub from public.saas_organization_subscriptions where id=v_req.subscription_id and organization_id=v_org for update;
  if not found or v_sub.updated_at is distinct from v_approval.source_revision
    or v_sub.updated_at is distinct from v_req.from_subscription_updated_at or v_sub.plan_id<>v_req.from_plan_id
    or v_sub.status not in ('active','trialing')
    or (v_sub.status='trialing' and (v_sub.trial_ends_at is null or v_sub.trial_ends_at<=clock_timestamp()))
    or v_sub.source<>'manual' then raise exception 'Subscription changed; new approval required'; end if;
  if public.resolve_signup_plan_internal_v1(v_org)->>'state' not in ('free','pro_trial','manual_active')
    then raise exception 'Current subscription not eligible'; end if;
  select p.* into v_offer from saas_governance.published_plan_versions p
    join public.saas_plans c on c.id=p.plan_id and c.code=p.plan_code and c.version=p.version and c.status='active'
    where p.plan_id=v_approval.plan_id and p.version=v_approval.plan_version and p.snapshot_sha256=p_digest
      and p.effective_from<=clock_timestamp() for share of c;
  if not found then raise exception 'Published offer unavailable'; end if;
  v_now:=clock_timestamp();
  if v_offer.plan_code='free' then
    if v_offer.plan_id<>v_intent.fallback_plan_id or v_offer.version<>v_intent.fallback_plan_version
      or v_approval.approval_mode<>'free' or v_approval.access_ends_at is not null
      then raise exception 'Free fallback version mismatch'; end if;
  elsif v_approval.approval_mode='free' or v_approval.access_ends_at is null or v_approval.access_ends_at<=v_now then
    raise exception 'Approved access period expired';
  end if;
  perform 1 from public.saas_plans where id=v_intent.fallback_plan_id and version=v_intent.fallback_plan_version
    and code='free' and status='active' for share;
  if not found then raise exception 'Pinned Free fallback unavailable'; end if;
  select array(select jsonb_array_elements_text(v_offer.snapshot->'workspace_codes')) into v_scope;
  select array(select jsonb_array_elements_text(v_offer.snapshot->'integration_codes')) into v_integrations;
  if not (v_intent.fallback_workspace_codes <@ v_scope)
    or exists(select 1 from unnest(v_scope) w(code) where not exists(select 1 from public.workspace_catalog c where c.code=w.code and c.status='active'))
    then raise exception 'Plan must preserve approved Free workspace scope'; end if;
  insert into saas_governance.manual_subscription_contracts(request_id,organization_id,subscription_id,plan_id,
    plan_version,offer_digest,snapshot,workspace_codes,integration_codes,named_user_limit,lead_record_limit,started_at,ends_at,activated_by)
  values(p_request,v_org,v_sub.id,v_offer.plan_id,v_offer.version,p_digest,v_offer.snapshot,v_scope,v_integrations,
    (v_offer.snapshot->>'named_users')::bigint,(v_offer.snapshot->>'lead_records')::bigint,v_now,v_approval.access_ends_at,p_actor)
  returning id into v_id;
  update public.saas_organization_subscriptions set plan_id=v_offer.plan_id,status='active',
    current_period_started_at=v_now,current_period_ends_at=v_approval.access_ends_at,
    metadata=metadata||jsonb_build_object('origin','manual_pilot_contract','manual_contract_id',v_id,'plan_version',v_offer.version)
    where id=v_sub.id and organization_id=v_org;
  insert into public.organization_workspaces(organization_id,workspace_code,enabled)
    select v_org,code,true from unnest(v_scope) w(code)
    on conflict(organization_id,workspace_code) do update set enabled=true;
  update public.organization_workspaces set enabled=false where organization_id=v_org and not(workspace_code=any(v_scope));
  -- Mark the original trial consumed; the trial scheduler cannot overwrite the contract.
  update public.signup_registration_intents set trial_converted_at=coalesce(trial_converted_at,v_now)
    where organization_id=v_org;
  return v_id;
end;
$fn$;
revoke all on function saas_governance.activate_manual_pilot(uuid,uuid,text) from public,anon,authenticated,service_role;

-- Exact effective entitlement calculation at request time, including expiry.
-- Retain the original resolver for existing signup and legacy paths.
alter function public.resolve_signup_plan_internal_v1(uuid) rename to resolve_signup_plan_base_v1;
create function public.resolve_signup_plan_internal_v1(v_org uuid)
returns jsonb language plpgsql security definer set search_path=''
as $fn$
declare v_sub public.saas_organization_subscriptions%rowtype;
  v_contract saas_governance.manual_subscription_contracts%rowtype;
  v_intent public.signup_registration_intents%rowtype;
  v_usage public.signup_usage_counters%rowtype;
  v_code text;
begin
  select * into v_sub from public.saas_organization_subscriptions where organization_id=v_org;
  if not found or v_sub.metadata->>'origin' is distinct from 'manual_pilot_contract' then
    return public.resolve_signup_plan_base_v1(v_org); end if;
  select * into v_contract from saas_governance.manual_subscription_contracts
    where id::text=v_sub.metadata->>'manual_contract_id' and organization_id=v_org and subscription_id=v_sub.id;
  if not found or v_sub.status<>'active' or v_sub.source<>'manual'
    or v_sub.plan_id<>v_contract.plan_id or v_sub.current_period_ends_at is distinct from v_contract.ends_at
    then return jsonb_build_object('state','unavailable'); end if;
  select * into v_intent from public.signup_registration_intents where organization_id=v_org;
  if not found then return jsonb_build_object('state','unavailable'); end if;
  select * into v_usage from public.signup_usage_counters where organization_id=v_org;
  if not found then return jsonb_build_object('state','unavailable'); end if;
  if v_contract.ends_at is not null and v_contract.ends_at<=clock_timestamp() then
    if not exists(select 1 from public.saas_plans where id=v_intent.fallback_plan_id and version=v_intent.fallback_plan_version and code='free' and status='active')
      then return jsonb_build_object('state','unavailable'); end if;
    return jsonb_build_object('state','free_pending_reconciliation','plan_code','free','trial_ends_at',v_intent.trial_ends_at,
      'remaining_seconds',0,'workspace_codes',to_jsonb(v_intent.fallback_workspace_codes),
      'integration_codes',to_jsonb(v_intent.fallback_integration_codes),'named_user_limit',v_usage.free_named_users,'lead_record_limit',v_usage.free_lead_records);
  end if;
  select code into v_code from public.saas_plans where id=v_contract.plan_id and version=v_contract.plan_version and status='active';
  if not found then return jsonb_build_object('state','unavailable'); end if;
  return jsonb_build_object('state','manual_active','plan_code',v_code,'trial_ends_at',v_intent.trial_ends_at,
    'remaining_seconds',0,'workspace_codes',to_jsonb(v_contract.workspace_codes),'integration_codes',to_jsonb(v_contract.integration_codes),
    'named_user_limit',v_contract.named_user_limit,'lead_record_limit',v_contract.lead_record_limit,'access_ends_at',v_contract.ends_at);
end;
$fn$;
revoke all on function public.resolve_signup_plan_internal_v1(uuid) from public,anon,authenticated,service_role;

create or replace function public.adjust_signup_usage_internal_v1(p_org uuid, p_metric text, p_delta integer)
returns void language plpgsql security definer set search_path = ''
as $usage$
declare
  v_usage public.signup_usage_counters%rowtype;
  v_state text;
  v_effective jsonb;
  v_limit bigint;
  v_used bigint;
begin
  if p_metric not in ('named_users','lead_records') or p_metric is null
     or p_delta not in (-1,1) or p_delta is null then
    raise exception 'Invalid quota adjustment';
  end if;
  select * into v_usage from public.signup_usage_counters
    where organization_id=p_org for update;
  if not found then
    if exists(select 1 from public.signup_registration_intents where organization_id=p_org) then
      raise exception 'Commercial usage state unavailable';
    end if;
    return;
  end if;
  if p_delta = 1 then
    v_effective := public.resolve_signup_plan_internal_v1(p_org);
    v_state := v_effective->>'state';
    if v_state not in ('pro_trial','free','free_pending_reconciliation','manual_active') or v_state is null then
      raise exception 'Commercial usage state unavailable';
    end if;
    if p_metric='named_users' then
      v_used := v_usage.named_users;
      v_limit := case when v_state='pro_trial' then v_usage.pro_named_users else v_usage.free_named_users end;
    else
      v_used := v_usage.lead_records;
      v_limit := case when v_state='pro_trial' then v_usage.pro_lead_records else v_usage.free_lead_records end;
    end if;
    if v_state='manual_active' then
      v_limit := (v_effective->>case when p_metric='named_users' then 'named_user_limit' else 'lead_record_limit' end)::bigint;
    end if;
    if v_limit is null or v_used >= v_limit then
      raise exception 'Commercial usage limit reached: %',p_metric using errcode='P0001';
    end if;
  end if;
  update public.signup_usage_counters
    set named_users = named_users + case when p_metric='named_users' then p_delta else 0 end,
        lead_records = lead_records + case when p_metric='lead_records' then p_delta else 0 end
    where organization_id=p_org;
end;
$usage$;

create or replace function public.signup_integration_allowed_v1(p_organization_id uuid,p_code text)
returns boolean language plpgsql security definer set search_path = ''
as $integration$
declare
  v_state text;
  v_effective jsonb;
  v_scope text[];
begin
  if auth.role() is distinct from 'service_role' or p_organization_id is null
     or p_code is null or p_code not in ('whatsapp','instagram','ga4','gsc','google_ads','meta_ads') then return false; end if;
  if not exists(select 1 from public.organizations where id=p_organization_id and status='active') then return false; end if;
  v_effective := public.resolve_signup_plan_internal_v1(p_organization_id);
  v_state := v_effective->>'state';
  if v_state='manual_active' then return coalesce((v_effective->'integration_codes') ? p_code,false); end if;
  if v_state='not_self_signup' then return true; end if;
  if v_state is null or v_state not in ('pro_trial','free','free_pending_reconciliation') then return false; end if;
  select case when v_state='pro_trial' then trial_integration_codes else fallback_integration_codes end
    into v_scope from public.signup_registration_intents where organization_id=p_organization_id;
  return coalesce(p_code=any(v_scope),false);
end;
$integration$;

create or replace function public.get_current_subscription_dashboard_v1()
returns jsonb language plpgsql security definer set search_path = ''
as $billing$
declare
  v_org uuid;
  v_context jsonb;
  v_plan jsonb;
  v_state text;
  v_usage public.signup_usage_counters%rowtype;
  v_history jsonb;
begin
  if auth.role() is distinct from 'authenticated' or auth.uid() is null
    or not exists(select 1 from auth.users u where u.id=auth.uid()
      and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false))
    or not exists(select 1 from public.profiles p where p.id=auth.uid() and p.active)
  then raise exception 'Authenticated active account required' using errcode='42501'; end if;
  v_context := public.get_current_workspace_context_v1();
  v_org := nullif(v_context->>'organization_id','')::uuid;
  if v_org is null or not exists (
    select 1 from public.organization_members m
    join public.organizations o on o.id=m.organization_id and o.status='active'
    where m.organization_id=v_org and m.user_id=auth.uid() and m.active
      and m.role in ('owner','admin') and m.role::text=v_context->>'role'
  ) then raise exception 'Subscription access denied' using errcode='42501'; end if;
  v_plan := public.resolve_signup_plan_internal_v1(v_org);
  v_state := v_plan->>'state';
  if v_state='not_self_signup' then
    return jsonb_build_object('state','managed_separately');
  end if;
  if v_state is null or v_state not in ('pro_trial','free_pending_reconciliation','free','manual_active') then
    return jsonb_build_object('state','unavailable');
  end if;
  select * into v_usage from public.signup_usage_counters where organization_id=v_org;
  if not found then return jsonb_build_object('state','unavailable'); end if;
  -- P0 generates these events transactionally. Do not invent history from
  -- the current state; pending reconciliation is an effective state only.
  select coalesce(jsonb_agg(to_jsonb(e) order by e.occurred_at desc,e.event_type),'[]'::jsonb)
    into v_history from (
      select e.event_type,e.previous_status,e.new_status,e.occurred_at,p.code as plan_code
      from public.saas_subscription_events e
      join public.saas_organization_subscriptions s on s.id=e.subscription_id and s.organization_id=e.organization_id
      left join public.saas_plans p on p.id::text=e.metadata->>'plan_id'
      where e.organization_id=v_org
        and e.event_type in ('subscription_created','subscription_status_changed','subscription_plan_changed','subscription_terms_changed')
      order by e.occurred_at desc,e.id desc limit 50
    ) e;
  return jsonb_build_object(
    'state',v_state,'plan_code',v_plan->>'plan_code',
    'trial_ends_at',v_plan->'trial_ends_at','remaining_seconds',v_plan->'remaining_seconds',
    'access_ends_at',v_plan->'access_ends_at',
    'named_users',v_usage.named_users,
    'named_user_limit',case when v_state='manual_active' then (v_plan->>'named_user_limit')::bigint when v_state='pro_trial' then v_usage.pro_named_users else v_usage.free_named_users end,
    'lead_records',v_usage.lead_records,
    'lead_record_limit',case when v_state='manual_active' then (v_plan->>'lead_record_limit')::bigint when v_state='pro_trial' then v_usage.pro_lead_records else v_usage.free_lead_records end,
    'history',v_history
  );
end;
$billing$;

-- Existing capability guard denies manual_active by default until separately approved.
-- No service-role activation grant until integrated application validation.
commit;
