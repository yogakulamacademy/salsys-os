-- Draft only: promote to a CLI-generated migration after isolated database tests.
begin;

-- Depends on R13-P0 and approved P1 governance. No default plan or trial is seeded.
-- Only a separately approved migration/release may configure this singleton.
-- No service API can create, approve, or change this policy directly.
create table public.signup_trial_policy (
  singleton boolean primary key default true check (singleton),
  plan_id uuid not null references public.saas_plans(id) on delete restrict,
  plan_version integer not null check (plan_version > 0),
  trial_days integer not null default 14 check (trial_days = 14),
  free_plan_id uuid not null references public.saas_plans(id) on delete restrict,
  free_plan_version integer not null check (free_plan_version > 0),
  pro_named_users integer not null check (pro_named_users between 1 and 1000000),
  pro_lead_records integer not null check (pro_lead_records between 1 and 100000000),
  free_named_users integer not null check (free_named_users between 1 and pro_named_users),
  free_lead_records integer not null check (free_lead_records between 1 and pro_lead_records),
  free_workspace_codes text[] not null
    check (cardinality(free_workspace_codes) > 0
      and array_position(free_workspace_codes, null) is null
      and 'admin' = any(free_workspace_codes)),
  allowed_workspace_codes text[] not null
    check (cardinality(allowed_workspace_codes) > 0
      and array_position(allowed_workspace_codes, null) is null
      and 'admin' = any(allowed_workspace_codes)),
  check (free_plan_id <> plan_id),
  check (free_workspace_codes <@ allowed_workspace_codes),
  approval_ref text not null check (char_length(trim(approval_ref)) between 3 and 250),
  approved_at timestamptz not null,
  enabled boolean not null default false
);
alter table public.signup_trial_policy enable row level security;
revoke all on public.signup_trial_policy from public, anon, authenticated, service_role;

-- Returns only availability, never pricing, policy details or customer records.
create function public.signup_trial_available_v1()
returns boolean language sql stable security definer set search_path = ''
as $policy$
  select exists (
    select 1 from public.signup_trial_policy t
    join public.saas_plans p on p.id = t.plan_id
    join public.saas_plans fp on fp.id = t.free_plan_id
    where t.singleton and t.enabled and p.status = 'active' and p.code = 'pro'
      and fp.status = 'active' and fp.code = 'free' and fp.version = t.free_plan_version
      and p.version = t.plan_version and t.approved_at <= now()
      and not exists (
        select 1 from unnest(t.allowed_workspace_codes) as w(code)
        where not exists (
          select 1 from public.workspace_catalog c
          where c.code = w.code and c.status = 'active'
        )
      )
  );
$policy$;
revoke all on function public.signup_trial_available_v1()
  from public, anon, authenticated, service_role;
grant execute on function public.signup_trial_available_v1() to service_role;

create table public.signup_registration_intents (
  id uuid primary key,
  email text not null check (char_length(email) between 3 and 254),
  full_name text not null check (char_length(full_name) between 2 and 180),
  business_name text not null check (char_length(business_name) between 2 and 180),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_user_id uuid unique references auth.users(id),
  user_id uuid unique references auth.users(id),
  fallback_plan_id uuid references public.saas_plans(id) on delete restrict,
  fallback_plan_version integer,
  fallback_workspace_codes text[],
  trial_plan_id uuid references public.saas_plans(id) on delete restrict,
  trial_plan_version integer,
  trial_workspace_codes text[],
  trial_ends_at timestamptz,
  trial_converted_at timestamptz,
  trial_conversion_retry_at timestamptz,
  organization_id uuid unique references public.organizations(id),
  check ((user_id is null) = (organization_id is null)),
  check (user_id is null or (fallback_plan_id is not null and fallback_plan_version is not null
    and fallback_workspace_codes is not null and trial_plan_id is not null
    and trial_plan_version is not null and trial_workspace_codes is not null and trial_ends_at is not null))
);
alter table public.signup_registration_intents enable row level security;
revoke all on public.signup_registration_intents from public, anon, authenticated, service_role;
-- All intent creation goes through the serialized quota boundary.
create index signup_intents_email_created_idx on public.signup_registration_intents(email, created_at);
create index signup_intents_created_idx on public.signup_registration_intents(created_at);

-- Per-tenant counters updated in the same transaction as actual row writes.
-- Only self-signup tenants receive a counter. Existing tenants are untouched.
create table public.signup_usage_counters (
  organization_id uuid primary key references public.organizations(id) on delete restrict,
  named_users bigint not null check (named_users >= 0),
  lead_records bigint not null check (lead_records >= 0),
  pro_named_users integer not null check (pro_named_users > 0),
  pro_lead_records integer not null check (pro_lead_records > 0),
  free_named_users integer not null check (free_named_users between 1 and pro_named_users),
  free_lead_records integer not null check (free_lead_records between 1 and pro_lead_records)
);
alter table public.signup_usage_counters enable row level security;
revoke all on public.signup_usage_counters from public, anon, authenticated, service_role;

create function public.reserve_signup_intent_v1(
  p_id uuid, p_email text, p_full_name text, p_business_name text
) returns boolean
language plpgsql security definer set search_path = ''
as $quota$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Registration not authorized';
  end if;
  if not public.signup_trial_available_v1() then return false; end if;
  -- Serialize quota checks and insertion across application instances.
  perform pg_catalog.pg_advisory_xact_lock(138130826);
  -- Purge abandoned expired intent PII; consumed intents preserve replay safety.
  delete from public.signup_registration_intents
    where user_id is null and expires_at < now();
  if (select count(*) from public.signup_registration_intents
      where created_at > now() - interval '1 hour') >= 100
     or (select count(*) from public.signup_registration_intents
      where email = lower(trim(p_email))
        and created_at > now() - interval '1 hour') >= 3 then
    return false;
  end if;
  insert into public.signup_registration_intents(id,email,full_name,business_name)
  values(p_id,lower(trim(p_email)),trim(p_full_name),trim(p_business_name));
  return true;
end;
$quota$;
revoke all on function public.reserve_signup_intent_v1(uuid,text,text,text)
  from public, anon, authenticated, service_role;
grant execute on function public.reserve_signup_intent_v1(uuid,text,text,text) to service_role;

-- Bind only a genuinely unconfirmed identity returned by the signup request.
create function public.accept_signup_intent_v1(p_id uuid, p_user_id uuid)
returns boolean language plpgsql security definer set search_path = ''
as $accept$
declare v_user auth.users%rowtype;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Registration not authorized';
  end if;
  select * into v_user from auth.users where id = p_user_id for update;
  if not found or v_user.email_confirmed_at is not null
     or coalesce(v_user.is_anonymous,false) then return false; end if;
  update public.signup_registration_intents
    set accepted_user_id = p_user_id
    where id = p_id and accepted_user_id is null and user_id is null
      and email = lower(v_user.email)
      and id::text = v_user.raw_user_meta_data->>'signup_intent_id'
      and created_at <= v_user.created_at and expires_at > now();
  return found;
end;
$accept$;
revoke all on function public.accept_signup_intent_v1(uuid,uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.accept_signup_intent_v1(uuid,uuid) to service_role;

create table public.signup_resend_attempts (
  id bigint generated always as identity primary key,
  intent_id uuid not null references public.signup_registration_intents(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.signup_resend_attempts enable row level security;
revoke all on public.signup_resend_attempts from public, anon, authenticated, service_role;
create index signup_resend_intent_created_idx on public.signup_resend_attempts(intent_id,created_at);
create index signup_resend_created_idx on public.signup_resend_attempts(created_at);

create function public.reserve_signup_resend_v1(p_email text)
returns boolean language plpgsql security definer set search_path = ''
as $resend$
declare v_id uuid;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Registration not authorized';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(138130827);
  select i.id into v_id
    from public.signup_registration_intents i
    join auth.users u on u.id = i.accepted_user_id
    where i.email = lower(trim(p_email)) and i.user_id is null
      and i.expires_at > now() and u.email_confirmed_at is null
      and lower(u.email) = i.email
    order by i.created_at desc limit 1;
  if not found then return false; end if;
  if (select count(*) from public.signup_resend_attempts
      where created_at > now() - interval '1 hour') >= 100
     or (select count(*) from public.signup_resend_attempts
      where intent_id = v_id and created_at > now() - interval '1 hour') >= 3
     or exists (select 1 from public.signup_resend_attempts
      where intent_id = v_id and created_at > now() - interval '1 minute')
  then return false; end if;
  insert into public.signup_resend_attempts(intent_id) values(v_id);
  return true;
end;
$resend$;
revoke all on function public.reserve_signup_resend_v1(text)
  from public, anon, authenticated, service_role;
grant execute on function public.reserve_signup_resend_v1(text) to service_role;

create function public.provision_verified_signup_v1(p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user auth.users%rowtype;
  v_intent public.signup_registration_intents%rowtype;
  v_org uuid;
  v_slug text;
  v_trial_end timestamptz;
  v_policy public.signup_trial_policy%rowtype;
begin
  if auth.role() is distinct from 'service_role' or p_user_id is null then
    raise exception 'Registration not authorized';
  end if;
  -- Serialize retries for this identity.
  select * into v_user from auth.users where id = p_user_id for update;
  if not found or v_user.email_confirmed_at is null or v_user.email is null
     or coalesce(v_user.is_anonymous, false) then
    raise exception 'Registration not authorized';
  end if;

  -- Return only a previously provisioned workspace that the caller still owns.
  select * into v_intent from public.signup_registration_intents
    where user_id = p_user_id for update;
  if found then
    if exists (
      select 1 from public.organization_members m
      join public.organizations o on o.id = m.organization_id
      where m.user_id = p_user_id and m.organization_id = v_intent.organization_id
        and m.role = 'owner' and m.active and o.status = 'active'
    ) then
      return v_intent.organization_id;
    end if;
    raise exception 'Registration not authorized';
  end if;

  -- Metadata is merely a locator: the trusted service-created record, verified
  -- email, creation time and absence of any membership determine eligibility.
  select * into v_intent from public.signup_registration_intents
    where accepted_user_id = p_user_id
      and email = lower(v_user.email)
      and created_at <= v_user.created_at
      and expires_at > now()
      and user_id is null
    for update;
  if not found then
    raise exception 'Registration not authorized';
  end if;
  if exists (select 1 from public.organization_members where user_id = p_user_id) then
    raise exception 'Registration not authorized';
  end if;

  -- Pin approved policy and plan version in this same transaction. P1 must
  -- advance the version for every commercially material plan change.
  select t.* into v_policy from public.signup_trial_policy t
    join public.saas_plans p on p.id = t.plan_id
    join public.saas_plans fp on fp.id = t.free_plan_id
    where t.singleton and t.enabled and p.status = 'active' and p.code = 'pro'
      and fp.status = 'active' and fp.code = 'free' and fp.version = t.free_plan_version
      and p.version = t.plan_version and t.approved_at <= now()
    for share of t, p, fp;
  if not found or not public.signup_trial_available_v1() then
    raise exception 'Approved trial policy unavailable';
  end if;

  v_slug := 'customer-' || replace(p_user_id::text, '-', '');
  v_org := public.provision_customer_organization_v1(
    p_user_id, v_intent.business_name, v_slug, v_intent.full_name
  );
  if v_org is null then
    raise exception 'Workspace creation failed';
  end if;
  -- Existing provisioning grants all active workspaces; narrow the new
  -- tenant before the transaction commits. Never touch other organizations.
  update public.organization_workspaces
    set enabled = false
    where organization_id = v_org
      and not (workspace_code = any(v_policy.allowed_workspace_codes));

  v_trial_end := now() + interval '336 hours';
  -- Commercial assignment and its P0 audit are atomic with organization creation.
  insert into public.saas_organization_subscriptions(
    organization_id, plan_id, status, source, trial_started_at, trial_ends_at, metadata
  ) values (
    v_org, v_policy.plan_id, 'trialing', 'manual', now(),
    v_trial_end,
    jsonb_build_object('origin','verified_self_signup','plan_version',v_policy.plan_version,
      'approval_ref',v_policy.approval_ref)
  );
  update public.signup_registration_intents
    set user_id = p_user_id, organization_id = v_org,
      fallback_plan_id = v_policy.free_plan_id, fallback_plan_version = v_policy.free_plan_version,
      fallback_workspace_codes = v_policy.free_workspace_codes,
      trial_plan_id = v_policy.plan_id, trial_plan_version = v_policy.plan_version,
      trial_workspace_codes = v_policy.allowed_workspace_codes, trial_ends_at = v_trial_end
    where id = v_intent.id;
  -- Snapshot the approved limits, counting the initial owner. The tenant is
  -- not visible to concurrent requests until this whole transaction commits.
  insert into public.signup_usage_counters(
    organization_id,named_users,lead_records,pro_named_users,pro_lead_records,free_named_users,free_lead_records
  ) values (
    v_org,
    (select count(*) from public.organization_members where organization_id=v_org and active),
    (select count(*) from public.leads where organization_id=v_org),
    v_policy.pro_named_users,v_policy.pro_lead_records,v_policy.free_named_users,v_policy.free_lead_records
  );
  -- Trusted routing hint only; membership remains the authorization boundary.
  update auth.users
    set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
      || jsonb_build_object('self_signup_organization_id', v_org::text)
    where id = p_user_id;
  return v_org;
end;
$$;
revoke all on function public.provision_verified_signup_v1(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.provision_verified_signup_v1(uuid) to service_role;

-- Idempotent, tenant-scoped conversion. A separately reviewed scheduler and
-- request-time enforcement must invoke/check this boundary before public launch.
-- No billing, deletion, suspension or re-enabling disabled workspaces.
create function public.convert_expired_signup_trial_v1(p_organization_id uuid)
returns boolean language plpgsql security definer set search_path = ''
as $convert$
declare
  v_intent public.signup_registration_intents%rowtype;
  v_changed uuid;
begin
  if auth.role() is distinct from 'service_role' or p_organization_id is null then
    raise exception 'Trial conversion not authorized';
  end if;
  select * into v_intent from public.signup_registration_intents
    where organization_id = p_organization_id for update;
  if not found or v_intent.trial_converted_at is not null
     or v_intent.trial_ends_at > now() then return false; end if;

  -- Do not overwrite an independently changed or paid subscription.
  perform 1 from public.saas_plans
    where id = v_intent.fallback_plan_id and code = 'free' and status = 'active'
      and version = v_intent.fallback_plan_version for share;
  if not found then raise exception 'Approved Free fallback unavailable'; end if;
  update public.saas_organization_subscriptions
    set plan_id = v_intent.fallback_plan_id, status = 'active',
      metadata = metadata || jsonb_build_object('origin','verified_self_signup_free_fallback',
        'plan_version',v_intent.fallback_plan_version,'trial_converted_at',now())
    where organization_id = p_organization_id
      and plan_id = v_intent.trial_plan_id and status = 'trialing'
      and source = 'manual' and trial_ends_at = v_intent.trial_ends_at
      and trial_ends_at <= now()
      and metadata->>'origin' = 'verified_self_signup'
    returning organization_id into v_changed;
  if not found then return false; end if;
  update public.organization_workspaces set enabled = false
    where organization_id = p_organization_id
      and not (workspace_code = any(v_intent.fallback_workspace_codes));
  update public.signup_registration_intents set trial_converted_at = now()
    where id = v_intent.id;
  return true;
end;
$convert$;
revoke all on function public.convert_expired_signup_trial_v1(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.convert_expired_signup_trial_v1(uuid) to service_role;

-- Bounded scheduled reconciliation; skip locked rows across concurrent runs.
-- Existing paid upgrades and unrelated subscriptions are excluded.
create index signup_trial_expiry_pending_idx
  on public.signup_registration_intents(trial_ends_at)
  where organization_id is not null and trial_converted_at is null;

create function public.reconcile_expired_signup_trials_v1(p_limit integer default 100)
returns jsonb language plpgsql security definer set search_path = ''
as $reconcile$
declare
  v_org uuid;
  v_checked integer := 0;
  v_converted integer := 0;
  v_failed integer := 0;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Trial reconciliation not authorized';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'Invalid reconciliation batch size';
  end if;
  for v_org in
    select i.organization_id
    from public.signup_registration_intents i
    join public.saas_organization_subscriptions s on s.organization_id = i.organization_id
    where i.trial_converted_at is null and i.trial_ends_at <= now()
      and (i.trial_conversion_retry_at is null or i.trial_conversion_retry_at <= now())
      and s.status = 'trialing' and s.source = 'manual'
      and s.plan_id = i.trial_plan_id and s.trial_ends_at = i.trial_ends_at
      and s.metadata->>'origin' = 'verified_self_signup'
    order by i.trial_ends_at, i.organization_id
    limit p_limit for update of i skip locked
  loop
    v_checked := v_checked + 1;
    begin
      if public.convert_expired_signup_trial_v1(v_org) then
        v_converted := v_converted + 1;
      end if;
    exception when others then
      -- Roll back only the failed conversion, leave its customer data intact,
      -- and postpone retry so one broken plan cannot starve the queue.
      update public.signup_registration_intents
        set trial_conversion_retry_at = now() + interval '15 minutes'
        where organization_id = v_org;
      v_failed := v_failed + 1;
    end;
  end loop;
  return jsonb_build_object('checked',v_checked,'converted',v_converted,'failed',v_failed);
end;
$reconcile$;
revoke all on function public.reconcile_expired_signup_trials_v1(integer)
  from public, anon, authenticated, service_role;
grant execute on function public.reconcile_expired_signup_trials_v1(integer) to service_role;

-- No caller-selected tenant. Return only current session's minimum commercial
-- state. This projection is also the basis for request-time commercial checks.
-- Independent runtime role/capability/provider checks remain mandatory.
create function public.resolve_signup_plan_internal_v1(v_org uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $current_plan$
declare
  v_intent public.signup_registration_intents%rowtype;
  v_sub public.saas_organization_subscriptions%rowtype;
  v_plan uuid;
  v_version integer;
  v_code text;
  v_scope text[];
  v_status text;
begin
  if v_org is null then raise exception 'Workspace access denied'; end if;
  select * into v_intent from public.signup_registration_intents where organization_id = v_org;
  if not found then
    -- Do not alter existing manually provisioned organizations.
    return jsonb_build_object('state','not_self_signup');
  end if;
  select * into v_sub from public.saas_organization_subscriptions where organization_id = v_org;
  if not found then return jsonb_build_object('state','unavailable'); end if;
  if v_sub.plan_id = v_intent.trial_plan_id and v_sub.status = 'trialing'
     and v_sub.source = 'manual' and v_sub.trial_ends_at = v_intent.trial_ends_at
     and v_sub.metadata->>'origin' = 'verified_self_signup'
     and v_intent.trial_converted_at is null then
    if clock_timestamp() < v_intent.trial_ends_at then
      v_plan := v_intent.trial_plan_id;
      v_version := v_intent.trial_plan_version;
      v_scope := v_intent.trial_workspace_codes;
      v_status := 'pro_trial';
      v_code := 'pro';
    else
      v_plan := v_intent.fallback_plan_id;
      v_version := v_intent.fallback_plan_version;
      v_scope := v_intent.fallback_workspace_codes;
      v_status := 'free_pending_reconciliation';
      v_code := 'free';
    end if;
  elsif v_sub.plan_id = v_intent.fallback_plan_id and v_sub.status = 'active'
     and v_sub.source = 'manual' and v_intent.trial_converted_at is not null
     and v_sub.metadata->>'origin' = 'verified_self_signup_free_fallback' then
    v_plan := v_intent.fallback_plan_id;
    v_version := v_intent.fallback_plan_version;
    v_scope := v_intent.fallback_workspace_codes;
    v_status := 'free';
    v_code := 'free';
  else
    -- Paid upgrades are not overwritten or treated as a trial. Their
    -- authorization needs independently approved P1/P3 governance.
    return jsonb_build_object('state','unavailable');
  end if;
  if not exists(select 1 from public.saas_plans where id=v_plan and code=v_code
    and version=v_version and status='active') then
    return jsonb_build_object('state','unavailable');
  end if;
  return jsonb_build_object('state',v_status,'plan_code',v_code,
    'trial_ends_at',v_intent.trial_ends_at,
    'remaining_seconds',case when v_status='pro_trial' then
      greatest(0,ceil(extract(epoch from (v_intent.trial_ends_at-clock_timestamp())))) else 0 end,
    'workspace_codes',to_jsonb(v_scope));
end;
$current_plan$;
revoke all on function public.resolve_signup_plan_internal_v1(uuid)
  from public, anon, authenticated, service_role;

create function public.get_current_signup_plan_v1()
returns jsonb language plpgsql security definer set search_path = ''
as $session_plan$
declare
  v_context jsonb;
  v_org uuid;
begin
  if auth.role() is distinct from 'authenticated' or auth.uid() is null then
    raise exception 'Authenticated session required';
  end if;
  v_context := public.get_current_workspace_context_v1();
  v_org := nullif(v_context->>'organization_id','')::uuid;
  return public.resolve_signup_plan_internal_v1(v_org);
end;
$session_plan$;
revoke all on function public.get_current_signup_plan_v1()
  from public, anon, authenticated, service_role;
grant execute on function public.get_current_signup_plan_v1() to authenticated;

-- Private transactional counter boundary. Row locks serialize increases even
-- for service-role ingestion and concurrent bulk writes. Decreases remain
-- possible after downgrade; existing records are never removed by quotas.
create function public.adjust_signup_usage_internal_v1(p_org uuid, p_metric text, p_delta integer)
returns void language plpgsql security definer set search_path = ''
as $usage$
declare
  v_usage public.signup_usage_counters%rowtype;
  v_state text;
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
    v_state := public.resolve_signup_plan_internal_v1(p_org)->>'state';
    if v_state not in ('pro_trial','free','free_pending_reconciliation') or v_state is null then
      raise exception 'Commercial usage state unavailable';
    end if;
    if p_metric='named_users' then
      v_used := v_usage.named_users;
      v_limit := case when v_state='pro_trial' then v_usage.pro_named_users else v_usage.free_named_users end;
    else
      v_used := v_usage.lead_records;
      v_limit := case when v_state='pro_trial' then v_usage.pro_lead_records else v_usage.free_lead_records end;
    end if;
    if v_used >= v_limit then
      raise exception 'Commercial usage limit reached: %',p_metric using errcode='P0001';
    end if;
  end if;
  update public.signup_usage_counters
    set named_users = named_users + case when p_metric='named_users' then p_delta else 0 end,
        lead_records = lead_records + case when p_metric='lead_records' then p_delta else 0 end
    where organization_id=p_org;
end;
$usage$;
revoke all on function public.adjust_signup_usage_internal_v1(uuid,text,integer)
  from public, anon, authenticated, service_role;

-- AFTER triggers count only actual changes, including INSERT ON CONFLICT,
-- reactivation, and tenant reassignment. Any rejection rolls back the write.
create function public.signup_usage_row_guard_v1()
returns trigger language plpgsql security definer set search_path = ''
as $guard$
declare
  v_old uuid;
  v_new uuid;
  v_metric text;
begin
  if tg_table_schema <> 'public' then raise exception 'Invalid quota source'; end if;
  if tg_table_name='leads' then
    v_metric := 'lead_records';
    if tg_op <> 'INSERT' then v_old:=old.organization_id; end if;
    if tg_op <> 'DELETE' then v_new:=new.organization_id; end if;
  elsif tg_table_name='organization_members' then
    v_metric := 'named_users';
    if tg_op <> 'INSERT' then
      if old.active then v_old:=old.organization_id; end if;
    end if;
    if tg_op <> 'DELETE' then
      if new.active then v_new:=new.organization_id; end if;
    end if;
  else
    raise exception 'Invalid quota source';
  end if;
  if v_old is not distinct from v_new then return null; end if;
  -- Stable tenant lock order for a move; transaction rollback preserves both.
  if v_old is not null and v_new is not null and v_old < v_new then
    perform public.adjust_signup_usage_internal_v1(v_old,v_metric,-1);
    perform public.adjust_signup_usage_internal_v1(v_new,v_metric,1);
  else
    if v_new is not null then perform public.adjust_signup_usage_internal_v1(v_new,v_metric,1); end if;
    if v_old is not null then perform public.adjust_signup_usage_internal_v1(v_old,v_metric,-1); end if;
  end if;
  return null;
end;
$guard$;
revoke all on function public.signup_usage_row_guard_v1()
  from public, anon, authenticated, service_role;
create trigger signup_lead_usage_guard_v1
  after insert or update or delete on public.leads
  for each row execute function public.signup_usage_row_guard_v1();
create trigger signup_member_usage_guard_v1
  after insert or update or delete on public.organization_members
  for each row execute function public.signup_usage_row_guard_v1();

commit;
