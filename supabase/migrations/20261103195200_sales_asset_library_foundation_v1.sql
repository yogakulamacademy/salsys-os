-- Governed Sales Asset Library V1
-- Private, tenant-scoped media registry for future AI/automation delivery.
-- This migration does NOT send media or enable autonomous provider delivery.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'sales-assets-private',
  'sales-assets-private',
  false,
  52428800,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/pdf',
    'video/mp4',
    'video/quicktime',
    'audio/mpeg',
    'audio/mp4',
    'audio/wav'
  ]::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.sales_asset_storage_organization_id(p_name text)
returns uuid
language sql
immutable
strict
set search_path = pg_catalog
as $function$
  select case
    when split_part(p_name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then split_part(p_name, '/', 1)::uuid
    else null
  end;
$function$;

create table if not exists public.sales_assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 180),
  description text,
  asset_kind text not null
    check (asset_kind in ('image','video','pdf','audio','document','other')),
  storage_bucket text not null default 'sales-assets-private'
    check (storage_bucket = 'sales-assets-private'),
  storage_path text not null,
  mime_type text not null check (mime_type ~ '^[a-z0-9.+-]+/[a-z0-9.+-]+$'),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 52428800),
  version integer not null default 1 check (version > 0),
  state text not null default 'draft'
    check (state in ('draft','approved','revoked','archived')),
  course_scope text[] not null default '{}'::text[],
  location_scope text[] not null default '{}'::text[],
  language_scope text[] not null default '{}'::text[],
  channel_scope text[] not null default '{}'::text[],
  rights_status text not null default 'cleared'
    check (rights_status in ('pending','cleared','restricted','expired')),
  rights_owner text,
  rights_reference text,
  rights_valid_until timestamptz,
  valid_from timestamptz,
  valid_until timestamptz,
  auto_send_allowed boolean not null default false,
  accessibility_alt_text text,
  accessibility_caption text,
  approved_by uuid,
  approved_at timestamptz,
  revoked_by uuid,
  revoked_at timestamptz,
  revoked_reason text,
  supersedes_asset_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  unique (organization_id, storage_path),
  constraint sales_assets_storage_path_tenant_check
    check (storage_path like organization_id::text || '/%'),
  constraint sales_assets_validity_check
    check (valid_until is null or valid_from is null or valid_until > valid_from),
  constraint sales_assets_image_alt_text_check
    check (asset_kind <> 'image' or length(btrim(coalesce(accessibility_alt_text, ''))) > 0),
  constraint sales_assets_approved_governance_check
    check (
      state <> 'approved'
      or (
        rights_status = 'cleared'
        and approved_by is not null
        and approved_at is not null
        and revoked_at is null
      )
    ),
  constraint sales_assets_auto_send_check
    check (not auto_send_allowed or state = 'approved'),
  constraint sales_assets_revocation_check
    check (
      (state = 'revoked' and revoked_at is not null and length(btrim(coalesce(revoked_reason, ''))) > 0)
      or (state <> 'revoked' and revoked_at is null and revoked_by is null and revoked_reason is null)
    ),
  constraint sales_assets_channel_scope_check
    check (channel_scope <@ array['whatsapp','instagram','email','webchat','sms','other']::text[]),
  constraint sales_assets_supersedes_fk
    foreign key (supersedes_asset_id, organization_id)
    references public.sales_assets(id, organization_id)
    on delete restrict
);

create index if not exists sales_assets_org_state_idx
  on public.sales_assets (organization_id, state, updated_at desc);

create index if not exists sales_assets_dispatch_idx
  on public.sales_assets (organization_id, state, auto_send_allowed, valid_from, valid_until)
  where state = 'approved' and auto_send_allowed = true;

create table if not exists public.sales_asset_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  asset_id uuid not null,
  action text not null
    check (action in ('created','approved','revoked','archived')),
  actor_id uuid,
  note text,
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (id, organization_id),
  constraint sales_asset_events_asset_fk
    foreign key (asset_id, organization_id)
    references public.sales_assets(id, organization_id)
    on delete cascade
);

create index if not exists sales_asset_events_org_asset_idx
  on public.sales_asset_events (organization_id, asset_id, created_at desc);

drop trigger if exists sales_assets_set_updated_at on public.sales_assets;
create trigger sales_assets_set_updated_at
before update on public.sales_assets
for each row execute function public.set_updated_at();

alter table public.sales_assets enable row level security;
alter table public.sales_asset_events enable row level security;

drop policy if exists sales_assets_read on public.sales_assets;
create policy sales_assets_read
on public.sales_assets
for select
to authenticated
using (
  public.is_crm_user()
  and public.is_organization_member(organization_id)
);

drop policy if exists sales_asset_events_read on public.sales_asset_events;
create policy sales_asset_events_read
on public.sales_asset_events
for select
to authenticated
using (
  public.is_crm_user()
  and public.is_organization_member(organization_id)
);

-- Authenticated mutations go through governed lifecycle RPCs below. Keeping
-- direct table writes unavailable prevents approval/audit state from drifting.
revoke all on table public.sales_assets from anon;
revoke all on table public.sales_asset_events from anon;
grant select on table public.sales_assets to authenticated;
grant select on table public.sales_asset_events to authenticated;

-- Private Storage boundary. Objects are immutable through the authenticated
-- API after upload. Only unregistered/orphan objects can be deleted directly.
drop policy if exists sales_assets_private_select_admins on storage.objects;
create policy sales_assets_private_select_admins
on storage.objects
for select
to authenticated
using (
  bucket_id = 'sales-assets-private'
  and public.can_manage_organization(public.sales_asset_storage_organization_id(name))
);

drop policy if exists sales_assets_private_insert_admins on storage.objects;
create policy sales_assets_private_insert_admins
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'sales-assets-private'
  and public.can_manage_organization(public.sales_asset_storage_organization_id(name))
);

drop policy if exists sales_assets_private_delete_orphans on storage.objects;
create policy sales_assets_private_delete_orphans
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'sales-assets-private'
  and public.can_manage_organization(public.sales_asset_storage_organization_id(name))
  and not exists (
    select 1
    from public.sales_assets asset
    where asset.organization_id = public.sales_asset_storage_organization_id(name)
      and asset.storage_bucket = bucket_id
      and asset.storage_path = name
  )
);

create or replace function public.register_sales_asset_v1(
  p_organization_id uuid,
  p_title text,
  p_description text,
  p_asset_kind text,
  p_storage_path text,
  p_mime_type text,
  p_size_bytes bigint,
  p_course_scope text[] default '{}'::text[],
  p_location_scope text[] default '{}'::text[],
  p_language_scope text[] default '{}'::text[],
  p_channel_scope text[] default '{}'::text[],
  p_rights_owner text default null,
  p_rights_reference text default null,
  p_rights_valid_until timestamptz default null,
  p_valid_from timestamptz default null,
  p_valid_until timestamptz default null,
  p_accessibility_alt_text text default null,
  p_accessibility_caption text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, storage, pg_temp
as $function$
declare
  v_actor uuid := auth.uid();
  v_asset_id uuid;
  v_title text := nullif(btrim(coalesce(p_title, '')), '');
  v_kind text := lower(btrim(coalesce(p_asset_kind, '')));
  v_path text := btrim(coalesce(p_storage_path, ''));
  v_mime text := lower(btrim(coalesce(p_mime_type, '')));
  v_rights_owner text := nullif(btrim(coalesce(p_rights_owner, '')), '');
  v_rights_reference text := nullif(btrim(coalesce(p_rights_reference, '')), '');
  v_alt text := nullif(btrim(coalesce(p_accessibility_alt_text, '')), '');
  v_caption text := nullif(btrim(coalesce(p_accessibility_caption, '')), '');
  v_course_scope text[];
  v_location_scope text[];
  v_language_scope text[];
  v_channel_scope text[];
begin
  if p_organization_id is null then
    raise exception 'Organization ID is required';
  end if;

  if auth.role() <> 'service_role'
     and not public.can_manage_organization(p_organization_id) then
    raise exception 'Only organization admins can manage sales assets';
  end if;

  if v_title is null or length(v_title) > 180 then
    raise exception 'Asset title must be between 1 and 180 characters';
  end if;

  if v_kind not in ('image','video','pdf','audio','document','other') then
    raise exception 'Unsupported sales asset kind';
  end if;

  if v_path = '' or v_path not like p_organization_id::text || '/%' then
    raise exception 'Sales asset storage path must be tenant scoped';
  end if;

  if p_size_bytes is null or p_size_bytes <= 0 or p_size_bytes > 52428800 then
    raise exception 'Sales asset size must be between 1 byte and 50 MB';
  end if;

  if v_mime !~ '^[a-z0-9.+-]+/[a-z0-9.+-]+$' then
    raise exception 'Sales asset MIME type is invalid';
  end if;

  if v_rights_owner is null or v_rights_reference is null then
    raise exception 'Rights owner and clearance reference are required';
  end if;

  if p_rights_valid_until is not null and p_rights_valid_until <= now() then
    raise exception 'Rights clearance must still be current';
  end if;

  if p_valid_from is not null and p_valid_until is not null and p_valid_until <= p_valid_from then
    raise exception 'Valid until must be later than valid from';
  end if;

  if v_kind = 'image' and v_alt is null then
    raise exception 'Image assets require accessibility alt text';
  end if;

  select coalesce(array_agg(distinct lower(btrim(value))) filter (where btrim(value) <> ''), '{}'::text[])
  into v_course_scope
  from unnest(coalesce(p_course_scope, '{}'::text[])) value;

  select coalesce(array_agg(distinct lower(btrim(value))) filter (where btrim(value) <> ''), '{}'::text[])
  into v_location_scope
  from unnest(coalesce(p_location_scope, '{}'::text[])) value;

  select coalesce(array_agg(distinct lower(btrim(value))) filter (where btrim(value) <> ''), '{}'::text[])
  into v_language_scope
  from unnest(coalesce(p_language_scope, '{}'::text[])) value;

  select coalesce(array_agg(distinct lower(btrim(value))) filter (where btrim(value) <> ''), '{}'::text[])
  into v_channel_scope
  from unnest(coalesce(p_channel_scope, '{}'::text[])) value;

  if not v_channel_scope <@ array['whatsapp','instagram','email','webchat','sms','other']::text[] then
    raise exception 'Unsupported sales asset channel scope';
  end if;

  if not exists (
    select 1
    from storage.objects object
    where object.bucket_id = 'sales-assets-private'
      and object.name = v_path
  ) then
    raise exception 'Private sales asset object was not found';
  end if;

  insert into public.sales_assets (
    organization_id,
    title,
    description,
    asset_kind,
    storage_bucket,
    storage_path,
    mime_type,
    size_bytes,
    course_scope,
    location_scope,
    language_scope,
    channel_scope,
    rights_status,
    rights_owner,
    rights_reference,
    rights_valid_until,
    valid_from,
    valid_until,
    accessibility_alt_text,
    accessibility_caption,
    created_by
  )
  values (
    p_organization_id,
    v_title,
    nullif(btrim(coalesce(p_description, '')), ''),
    v_kind,
    'sales-assets-private',
    v_path,
    v_mime,
    p_size_bytes,
    v_course_scope,
    v_location_scope,
    v_language_scope,
    v_channel_scope,
    'cleared',
    v_rights_owner,
    v_rights_reference,
    p_rights_valid_until,
    p_valid_from,
    p_valid_until,
    v_alt,
    v_caption,
    v_actor
  )
  returning id into v_asset_id;

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
    v_asset_id,
    'created',
    v_actor,
    'Private sales asset registered as a draft.',
    jsonb_build_object(
      'storage_bucket', 'sales-assets-private',
      'storage_path', v_path,
      'mime_type', v_mime,
      'size_bytes', p_size_bytes,
      'channel_scope', v_channel_scope
    )
  );

  return jsonb_build_object(
    'ok', true,
    'asset_id', v_asset_id,
    'state', 'draft'
  );
end;
$function$;

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

  if auth.role() <> 'service_role'
     and not public.can_manage_organization(p_organization_id) then
    raise exception 'Only organization admins can approve sales assets';
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
      then 'Approved with server-governed auto-send permission.'
      else 'Approved for human-selected use only.'
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

create or replace function public.revoke_sales_asset_v1(
  p_organization_id uuid,
  p_asset_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $function$
declare
  v_asset public.sales_assets%rowtype;
  v_actor uuid := auth.uid();
  v_now timestamptz := now();
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if p_organization_id is null or p_asset_id is null then
    raise exception 'Organization and sales asset are required';
  end if;

  if auth.role() <> 'service_role'
     and not public.can_manage_organization(p_organization_id) then
    raise exception 'Only organization admins can revoke sales assets';
  end if;

  if v_reason is null or length(v_reason) > 500 then
    raise exception 'Revocation reason must be between 1 and 500 characters';
  end if;

  select * into v_asset
  from public.sales_assets
  where organization_id = p_organization_id
    and id = p_asset_id
  for update;

  if not found then
    raise exception 'Sales asset was not found';
  end if;

  if v_asset.state = 'revoked' then
    return jsonb_build_object(
      'ok', true,
      'asset_id', p_asset_id,
      'state', 'revoked',
      'already_revoked', true
    );
  end if;

  update public.sales_assets
  set state = 'revoked',
      auto_send_allowed = false,
      revoked_by = v_actor,
      revoked_at = v_now,
      revoked_reason = v_reason
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
    'revoked',
    v_actor,
    v_reason,
    jsonb_build_object(
      'previous_state', v_asset.state,
      'auto_send_allowed', false
    )
  );

  return jsonb_build_object(
    'ok', true,
    'asset_id', p_asset_id,
    'state', 'revoked',
    'already_revoked', false
  );
end;
$function$;

create or replace function public.resolve_sales_asset_for_dispatch_v1(
  p_organization_id uuid,
  p_asset_id uuid,
  p_channel text,
  p_language text default null,
  p_course text default null,
  p_location text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, storage, pg_temp
as $function$
declare
  v_asset public.sales_assets%rowtype;
  v_now timestamptz := now();
  v_channel text := lower(btrim(coalesce(p_channel, '')));
  v_language text := lower(btrim(coalesce(p_language, '')));
  v_course text := lower(btrim(coalesce(p_course, '')));
  v_location text := lower(btrim(coalesce(p_location, '')));
begin
  -- This is deliberately server-only. A queued action must resolve the asset ID
  -- again immediately before provider delivery; approval snapshots are not trusted.
  if auth.role() <> 'service_role' then
    raise exception 'Sales asset dispatch resolution is server-only';
  end if;

  if p_organization_id is null or p_asset_id is null or v_channel = '' then
    raise exception 'Organization, asset and channel are required';
  end if;

  select * into v_asset
  from public.sales_assets
  where organization_id = p_organization_id
    and id = p_asset_id;

  if not found then
    raise exception 'Sales asset was not found';
  end if;

  if v_asset.state <> 'approved'
     or v_asset.revoked_at is not null
     or not v_asset.auto_send_allowed then
    raise exception 'Sales asset is not approved for automatic dispatch';
  end if;

  if v_asset.rights_status <> 'cleared'
     or (v_asset.rights_valid_until is not null and v_asset.rights_valid_until <= v_now) then
    raise exception 'Sales asset rights clearance is not current';
  end if;

  if v_asset.valid_from is not null and v_asset.valid_from > v_now then
    raise exception 'Sales asset is not valid yet';
  end if;

  if v_asset.valid_until is not null and v_asset.valid_until <= v_now then
    raise exception 'Sales asset validity has expired';
  end if;

  if cardinality(v_asset.channel_scope) = 0 or not (v_channel = any(v_asset.channel_scope)) then
    raise exception 'Sales asset does not support the requested channel';
  end if;

  if cardinality(v_asset.language_scope) > 0
     and (v_language = '' or not (v_language = any(v_asset.language_scope))) then
    raise exception 'Sales asset does not match the requested language';
  end if;

  if cardinality(v_asset.course_scope) > 0
     and (v_course = '' or not (v_course = any(v_asset.course_scope))) then
    raise exception 'Sales asset does not match the requested course';
  end if;

  if cardinality(v_asset.location_scope) > 0
     and (v_location = '' or not (v_location = any(v_asset.location_scope))) then
    raise exception 'Sales asset does not match the requested location';
  end if;

  if not exists (
    select 1
    from storage.objects object
    where object.bucket_id = v_asset.storage_bucket
      and object.name = v_asset.storage_path
  ) then
    raise exception 'Private sales asset object was not found';
  end if;

  return jsonb_build_object(
    'asset_id', v_asset.id,
    'organization_id', v_asset.organization_id,
    'version', v_asset.version,
    'title', v_asset.title,
    'asset_kind', v_asset.asset_kind,
    'mime_type', v_asset.mime_type,
    'size_bytes', v_asset.size_bytes,
    'accessibility_alt_text', v_asset.accessibility_alt_text,
    'accessibility_caption', v_asset.accessibility_caption,
    'safe_reference', jsonb_build_object(
      'bucket', v_asset.storage_bucket,
      'path', v_asset.storage_path
    )
  );
end;
$function$;

revoke all on function public.sales_asset_storage_organization_id(text) from public, anon;
revoke all on function public.register_sales_asset_v1(uuid, text, text, text, text, text, bigint, text[], text[], text[], text[], text, text, timestamptz, timestamptz, timestamptz, text, text) from public, anon;
revoke all on function public.approve_sales_asset_v1(uuid, uuid, boolean) from public, anon;
revoke all on function public.revoke_sales_asset_v1(uuid, uuid, text) from public, anon;
revoke all on function public.resolve_sales_asset_for_dispatch_v1(uuid, uuid, text, text, text, text) from public, anon, authenticated;

grant execute on function public.sales_asset_storage_organization_id(text) to authenticated, service_role;
grant execute on function public.register_sales_asset_v1(uuid, text, text, text, text, text, bigint, text[], text[], text[], text[], text, text, timestamptz, timestamptz, timestamptz, text, text) to authenticated, service_role;
grant execute on function public.approve_sales_asset_v1(uuid, uuid, boolean) to authenticated, service_role;
grant execute on function public.revoke_sales_asset_v1(uuid, uuid, text) to authenticated, service_role;
grant execute on function public.resolve_sales_asset_for_dispatch_v1(uuid, uuid, text, text, text, text) to service_role;

comment on table public.sales_assets is
  'Tenant-scoped private sales media registry. Approval, rights, scope, validity and auto-send permission are governed independently of the stored object.';
comment on table public.sales_asset_events is
  'Append-only governance history for sales asset creation, approval and revocation.';
comment on function public.resolve_sales_asset_for_dispatch_v1(uuid, uuid, text, text, text, text) is
  'Server-only dispatch-time revalidation. Queued actions must resolve an asset ID here immediately before provider delivery so revocation/expiry/scope changes fail closed.';
