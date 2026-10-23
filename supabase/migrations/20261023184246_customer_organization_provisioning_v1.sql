begin;

create or replace function public.provision_customer_organization_v1(
  p_user_id uuid,
  p_organization_name text,
  p_organization_slug text,
  p_owner_full_name text
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'auth', 'pg_temp'
as $function$
declare
  v_name text := nullif(btrim(coalesce(p_organization_name, '')), '');
  v_slug text := lower(nullif(btrim(coalesce(p_organization_slug, '')), ''));
  v_owner_name text := nullif(btrim(coalesce(p_owner_full_name, '')), '');
  v_organization_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required';
  end if;

  if p_user_id is null then
    raise exception 'Owner user ID is required';
  end if;

  if not exists (select 1 from auth.users u where u.id = p_user_id) then
    raise exception 'Owner auth identity does not exist';
  end if;

  if v_name is null or char_length(v_name) < 2 then
    raise exception 'Organization name is required';
  end if;

  if v_slug is null or v_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' or char_length(v_slug) > 80 then
    raise exception 'Organization slug is invalid';
  end if;

  if v_owner_name is null or char_length(v_owner_name) < 2 then
    raise exception 'Owner name is required';
  end if;

  if exists (select 1 from public.organizations o where lower(o.slug) = v_slug) then
    raise exception 'Organization slug is already in use';
  end if;

  insert into public.organizations (
    name,
    slug,
    status
  )
  values (
    v_name,
    v_slug,
    'active'
  )
  returning id into v_organization_id;

  insert into public.profiles (
    id,
    full_name,
    role,
    active
  )
  values (
    p_user_id,
    v_owner_name,
    'admin',
    true
  )
  on conflict (id)
  do update set
    full_name = excluded.full_name,
    role = 'admin',
    active = true,
    updated_at = now();

  insert into public.organization_members (
    organization_id,
    user_id,
    role,
    active
  )
  values (
    v_organization_id,
    p_user_id,
    'owner',
    true
  );

  insert into public.organization_workspaces (
    organization_id,
    workspace_code,
    enabled
  )
  select
    v_organization_id,
    wc.code,
    true
  from public.workspace_catalog wc
  where wc.status = 'active';

  if not exists (
    select 1
    from public.organization_workspaces ow
    where ow.organization_id = v_organization_id
      and ow.workspace_code = 'admin'
      and ow.enabled = true
  ) then
    raise exception 'Admin workspace could not be provisioned';
  end if;

  insert into public.organization_onboarding (
    organization_id,
    status,
    current_step,
    goals,
    completed_steps,
    enforce_on_sign_in
  )
  values (
    v_organization_id,
    'not_started',
    'business',
    '{}'::text[],
    '{}'::text[],
    true
  );

  return v_organization_id;
end;
$function$;

revoke all on function public.provision_customer_organization_v1(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.provision_customer_organization_v1(uuid, text, text, text)
  to service_role;

commit;
