-- Sales Asset human approval guard V1
-- Approval is deliberately human-owned. Service-role workers may revalidate
-- dispatch eligibility and enforce revocation, but cannot create approval state.

create or replace function public.approve_sales_asset_v1(
  p_organization_id uuid,
  p_asset_id uuid,
  p_auto_send_allowed boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, storage, pg_temp
as $function$
declare
  v_asset public.sales_assets%rowtype;
  v_actor uuid := auth.uid();
  v_now timestamptz := now();
begin
  if p_organization_id is null or p_asset_id is null then
    raise exception 'Organization and sales asset are required';
  end if;

  if auth.role() <> 'authenticated'
     or v_actor is null
     or not public.can_manage_organization(p_organization_id) then
    raise exception 'A signed-in organization admin is required to approve sales assets';
  end if;

  select * into v_asset
  from public.sales_assets
  where organization_id = p_organization_id
    and id = p_asset_id
  for update;

  if not found then
    raise exception 'Sales asset was not found';
  end if;

  if v_asset.state = 'approved' then
    return jsonb_build_object(
      'ok', true,
      'asset_id', p_asset_id,
      'state', 'approved',
      'already_approved', true,
      'auto_send_allowed', v_asset.auto_send_allowed
    );
  end if;

  if v_asset.state in ('revoked','archived') then
    raise exception 'Revoked or archived sales assets cannot be approved';
  end if;

  if v_asset.rights_status <> 'cleared'
     or (v_asset.rights_valid_until is not null and v_asset.rights_valid_until <= v_now) then
    raise exception 'Sales asset rights clearance is not current';
  end if;

  if v_asset.valid_until is not null and v_asset.valid_until <= v_now then
    raise exception 'Expired sales assets cannot be approved';
  end if;

  if coalesce(p_auto_send_allowed, false) and cardinality(v_asset.channel_scope) = 0 then
    raise exception 'Auto-send approval requires at least one supported channel';
  end if;

  if not exists (
    select 1
    from storage.objects object
    where object.bucket_id = v_asset.storage_bucket
      and object.name = v_asset.storage_path
  ) then
    raise exception 'Private sales asset object was not found';
  end if;

  update public.sales_assets
  set state = 'approved',
      approved_by = v_actor,
      approved_at = v_now,
      auto_send_allowed = coalesce(p_auto_send_allowed, false)
  where organization_id = p_organization_id
    and id = p_asset_id;

  insert into public.sales_asset_events (
    organization_id,
    asset_id,
    action,
    actor_id,
    note,
    snapshot
  )
  values (
    p_organization_id,
    p_asset_id,
    'approved',
    v_actor,
    case when coalesce(p_auto_send_allowed, false)
      then 'Human admin approved with server-governed auto-send permission.'
      else 'Human admin approved for human-selected use only.'
    end,
    jsonb_build_object('auto_send_allowed', coalesce(p_auto_send_allowed, false))
  );

  return jsonb_build_object(
    'ok', true,
    'asset_id', p_asset_id,
    'state', 'approved',
    'already_approved', false,
    'auto_send_allowed', coalesce(p_auto_send_allowed, false)
  );
end;
$function$;

revoke execute on function public.approve_sales_asset_v1(uuid, uuid, boolean) from public, anon, service_role;
grant execute on function public.approve_sales_asset_v1(uuid, uuid, boolean) to authenticated;

comment on function public.approve_sales_asset_v1(uuid, uuid, boolean) is
  'Human-admin-only sales asset approval. Service-role workers cannot mint approval or auto-send permission.';
