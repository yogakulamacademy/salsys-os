-- Draft only: promote to a CLI-generated migration after isolated database tests.
begin;

create table public.signup_registration_intents (
  id uuid primary key,
  email text not null check (char_length(email) between 3 and 254),
  full_name text not null check (char_length(full_name) between 2 and 180),
  business_name text not null check (char_length(business_name) between 2 and 180),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_user_id uuid unique references auth.users(id),
  user_id uuid unique references auth.users(id),
  organization_id uuid unique references public.organizations(id),
  check ((user_id is null) = (organization_id is null))
);
alter table public.signup_registration_intents enable row level security;
revoke all on public.signup_registration_intents from public, anon, authenticated, service_role;
-- All intent creation goes through the serialized quota boundary.
create index signup_intents_email_created_idx on public.signup_registration_intents(email, created_at);
create index signup_intents_created_idx on public.signup_registration_intents(created_at);

create function public.reserve_signup_intent_v1(
  p_id uuid, p_email text, p_full_name text, p_business_name text
) returns boolean
language plpgsql security definer set search_path = ''
as $quota$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Registration not authorized';
  end if;
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

  v_slug := 'customer-' || replace(p_user_id::text, '-', '');
  v_org := public.provision_customer_organization_v1(
    p_user_id, v_intent.business_name, v_slug, v_intent.full_name
  );
  if v_org is null then
    raise exception 'Workspace creation failed';
  end if;
  update public.signup_registration_intents
    set user_id = p_user_id, organization_id = v_org
    where id = v_intent.id;
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

commit;
