begin;


/* ============================================================
   MIGRATION 023
   Salsys API / Website Integration Credential Foundation
   ============================================================ */


/* ============================================================
   1. EXTEND EXISTING INTEGRATION CONNECTION CONTRACT
   ============================================================ */

alter table public.integration_connections
drop constraint if exists integration_connections_provider_check;

alter table public.integration_connections
add constraint integration_connections_provider_check
check (
  provider = any (
    array[
      'google'::text,
      'meta'::text,
      'whatsapp'::text,
      'salsys'::text
    ]
  )
);


alter table public.integration_connections
drop constraint if exists integration_connections_auth_mode_check;

alter table public.integration_connections
add constraint integration_connections_auth_mode_check
check (
  auth_mode = any (
    array[
      'oauth_user'::text,
      'service_account'::text,
      'system_user'::text,
      'embedded_signup'::text,
      'manual_token'::text,
      'api_key'::text
    ]
  )
);


/* ============================================================
   2. API CREDENTIAL TABLE
   ============================================================ */

create table if not exists public.integration_api_credentials (

  id uuid primary key
    default gen_random_uuid(),

  organization_id uuid not null
    references public.organizations(id)
    on delete cascade,

  connection_id uuid not null
    references public.integration_connections(id)
    on delete cascade,

  credential_kind text not null
    default 'website',

  environment text not null
    default 'live',

  name text not null,

  public_key text not null,

  secret_key_hash bytea not null,

  secret_key_prefix text not null,

  secret_key_last4 text not null,

  scopes text[] not null
    default array[
      'events:write',
      'leads:write',
      'identity:link'
    ]::text[],

  allowed_hosts text[] not null
    default '{}'::text[],

  status text not null
    default 'active',

  created_by uuid null
    references auth.users(id)
    on delete set null,

  created_at timestamptz not null
    default now(),

  updated_at timestamptz not null
    default now(),

  last_used_at timestamptz null,

  expires_at timestamptz null,

  revoked_at timestamptz null,

  rotated_from_id uuid null
    references public.integration_api_credentials(id)
    on delete set null,

  metadata jsonb not null
    default '{}'::jsonb,

  constraint integration_api_credentials_kind_check
  check (
    credential_kind in (
      'website',
      'api',
      'mobile'
    )
  ),

  constraint integration_api_credentials_environment_check
  check (
    environment in (
      'live',
      'test'
    )
  ),

  constraint integration_api_credentials_status_check
  check (
    status in (
      'active',
      'revoked',
      'expired'
    )
  ),

  constraint integration_api_credentials_public_key_format_check
  check (
    public_key ~ '^pk_(live|test)_[A-Za-z0-9_-]+$'
  ),

  constraint integration_api_credentials_secret_prefix_check
  check (
    secret_key_prefix in (
      'sk_live',
      'sk_test'
    )
  ),

  constraint integration_api_credentials_secret_last4_check
  check (
    length(secret_key_last4) = 4
  ),

  constraint integration_api_credentials_secret_hash_check
  check (
    octet_length(secret_key_hash) = 32
  ),

  constraint integration_api_credentials_scopes_check
  check (
    cardinality(scopes) > 0
  ),

  constraint integration_api_credentials_revoked_at_check
  check (
    status <> 'revoked'
    or revoked_at is not null
  )
);


/* ============================================================
   3. UNIQUE / LOOKUP INDEXES
   ============================================================ */

create unique index if not exists
integration_api_credentials_public_key_uidx
on public.integration_api_credentials(public_key);


create unique index if not exists
integration_api_credentials_secret_hash_uidx
on public.integration_api_credentials(secret_key_hash);


create index if not exists
idx_integration_api_credentials_organization
on public.integration_api_credentials(organization_id);


create index if not exists
idx_integration_api_credentials_connection
on public.integration_api_credentials(connection_id);


create index if not exists
idx_integration_api_credentials_active
on public.integration_api_credentials(
  organization_id,
  status
)
where status = 'active';


create index if not exists
idx_integration_api_credentials_last_used
on public.integration_api_credentials(last_used_at desc);


/* ============================================================
   4. TENANT / CONNECTION GUARD
   ============================================================ */

create or replace function
public.enforce_integration_api_credential_scope()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$

declare
  v_connection_organization_id uuid;
  v_provider text;
  v_auth_mode text;
  v_normalized_hosts text[];

begin

  select
    organization_id,
    provider,
    auth_mode
  into
    v_connection_organization_id,
    v_provider,
    v_auth_mode
  from public.integration_connections
  where id = new.connection_id;


  if not found then
    raise exception
      'Integration connection % does not exist',
      new.connection_id;
  end if;


  if v_provider <> 'salsys' then
    raise exception
      'API credentials require provider=salsys';
  end if;


  if v_auth_mode <> 'api_key' then
    raise exception
      'API credentials require auth_mode=api_key';
  end if;


  new.organization_id :=
    v_connection_organization_id;


  select coalesce(
    array_agg(
      distinct lower(btrim(host))
      order by lower(btrim(host))
    ),
    '{}'::text[]
  )
  into v_normalized_hosts
  from unnest(new.allowed_hosts) as host
  where btrim(host) <> '';


  new.allowed_hosts :=
    v_normalized_hosts;


  if new.credential_kind = 'website'
     and cardinality(new.allowed_hosts) = 0 then

    raise exception
      'Website credentials require at least one allowed hostname';

  end if;


  if exists (

    select 1

    from unnest(new.allowed_hosts) as allowed_host

    where not exists (

      select 1

      from public.organization_sites os

      where os.organization_id =
        v_connection_organization_id

        and lower(os.hostname) =
          lower(allowed_host)

        and os.status = 'active'

    )

  ) then

    raise exception
      'One or more allowed hostnames are not active organization sites';

  end if;


  return new;

end;

$function$;


/* ============================================================
   5. TENANT GUARD TRIGGER
   ============================================================ */

drop trigger if exists
trg_integration_api_credentials_scope_guard
on public.integration_api_credentials;


create trigger
trg_integration_api_credentials_scope_guard

before insert or update
on public.integration_api_credentials

for each row

execute function
public.enforce_integration_api_credential_scope();


/* ============================================================
   6. UPDATED_AT TRIGGER
   ============================================================ */

drop trigger if exists
trg_integration_api_credentials_updated_at
on public.integration_api_credentials;


create trigger
trg_integration_api_credentials_updated_at

before update
on public.integration_api_credentials

for each row

execute function
public.touch_integration_updated_at();


/* ============================================================
   7. ROW LEVEL SECURITY
   ============================================================ */

alter table
public.integration_api_credentials
enable row level security;


revoke all
on table public.integration_api_credentials
from anon;


revoke all
on table public.integration_api_credentials
from authenticated;


grant select, insert, update, delete
on table public.integration_api_credentials
to service_role;


/* ============================================================
   8. PROTECT INTERNAL TRIGGER FUNCTION
   ============================================================ */

revoke all
on function
public.enforce_integration_api_credential_scope()
from public;


commit;