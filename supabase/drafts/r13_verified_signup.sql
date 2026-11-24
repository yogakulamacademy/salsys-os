-- Draft only: promote to a CLI-generated migration after isolated database tests.
begin;

create table public.signup_registration_intents (
  id uuid primary key,
  email text not null check (char_length(email) between 3 and 254),
  full_name text not null check (char_length(full_name) between 2 and 180),
  business_name text not null check (char_length(business_name) between 2 and 180),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
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
    where id::text = v_user.raw_user_meta_data->>'signup_intent_id'
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
