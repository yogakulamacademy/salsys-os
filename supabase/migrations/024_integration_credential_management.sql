begin;


/* ============================================================
   MIGRATION 024
   Salsys Integration Credential Management
   ============================================================ */


/* ============================================================
   1. HARDEN ENVIRONMENT ↔ KEY PREFIX CONSISTENCY
   ============================================================ */

alter table public.integration_api_credentials
drop constraint if exists
integration_api_credentials_environment_key_match_check;

alter table public.integration_api_credentials
add constraint
integration_api_credentials_environment_key_match_check
check (
  (
    environment = 'live'
    and public_key like 'pk_live_%'
    and secret_key_prefix = 'sk_live'
  )
  or
  (
    environment = 'test'
    and public_key like 'pk_test_%'
    and secret_key_prefix = 'sk_test'
  )
);


/* ============================================================
   2. LIMIT CREDENTIAL SCOPES TO KNOWN SALSYS PERMISSIONS
   ============================================================ */

alter table public.integration_api_credentials
drop constraint if exists
integration_api_credentials_known_scopes_check;

alter table public.integration_api_credentials
add constraint
integration_api_credentials_known_scopes_check
check (
  scopes <@ array[
    'events:write',
    'leads:write',
    'identity:link'
  ]::text[]
);


/* ============================================================
   3. CREATE API CREDENTIAL

   - authenticated organization admin only
   - secret generated in database
   - plaintext secret returned exactly once
   - only SHA-256 hash stored
   ============================================================ */

create or replace function
public.create_integration_api_credential(

  p_organization_id uuid,
  p_name text,

  p_credential_kind text default 'website',

  p_environment text default 'live',

  p_allowed_hosts text[] default '{}'::text[],

  p_scopes text[] default array[
    'events:write',
    'leads:write',
    'identity:link'
  ]::text[],

  p_expires_at timestamptz default null

)
returns table (

  credential_id uuid,
  connection_id uuid,

  organization_id uuid,

  name text,

  credential_kind text,

  environment text,

  public_key text,

  secret_key text,

  scopes text[],

  allowed_hosts text[],

  expires_at timestamptz

)
language plpgsql
security definer

set search_path = public, extensions, pg_temp

as $function$

declare

  v_user_id uuid;

  v_connection_id uuid;
  v_credential_id uuid;

  v_public_key text;
  v_secret_key text;

  v_public_prefix text;
  v_secret_prefix text;

begin

  /* ----------------------------------------------------------
     Authentication
     ---------------------------------------------------------- */

  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception
      'Authentication required';
  end if;


  /* ----------------------------------------------------------
     Authorization
     ---------------------------------------------------------- */

  if not public.can_administer_organization_crm(
    p_organization_id
  ) then

    raise exception
      'Not authorized to administer integrations for organization %',
      p_organization_id;

  end if;


  /* ----------------------------------------------------------
     Input validation
     ---------------------------------------------------------- */

  if nullif(btrim(p_name), '') is null then
    raise exception
      'Credential name is required';
  end if;


  if p_credential_kind not in (
    'website',
    'api',
    'mobile'
  ) then

    raise exception
      'Invalid credential kind';

  end if;


  if p_environment not in (
    'live',
    'test'
  ) then

    raise exception
      'Invalid credential environment';

  end if;


  if cardinality(p_scopes) = 0 then
    raise exception
      'At least one scope is required';
  end if;


  if not (
    p_scopes <@ array[
      'events:write',
      'leads:write',
      'identity:link'
    ]::text[]
  ) then

    raise exception
      'One or more requested scopes are invalid';

  end if;


  if p_expires_at is not null
     and p_expires_at <= now() then

    raise exception
      'Credential expiry must be in the future';

  end if;


  /* ----------------------------------------------------------
     Prefixes
     ---------------------------------------------------------- */

  if p_environment = 'live' then

    v_public_prefix := 'pk_live_';
    v_secret_prefix := 'sk_live';

  else

    v_public_prefix := 'pk_test_';
    v_secret_prefix := 'sk_test';

  end if;


  /* ----------------------------------------------------------
     Generate cryptographically-random credentials.
     ---------------------------------------------------------- */

  v_public_key :=
    v_public_prefix
    || encode(
      extensions.gen_random_bytes(24),
      'hex'
    );


  v_secret_key :=
    v_secret_prefix
    || '_'
    || encode(
      extensions.gen_random_bytes(32),
      'hex'
    );


  /* ----------------------------------------------------------
     Create canonical Salsys integration connection.
     ---------------------------------------------------------- */

  insert into public.integration_connections (

    organization_id,

    provider,

    auth_mode,

    status,

    external_account_id,

    account_name,

    scopes,

    connected_by,

    connected_at,

    last_verified_at,

    provider_metadata

  )
  values (

    p_organization_id,

    'salsys',

    'api_key',

    'connected',

    v_public_key,

    btrim(p_name),

    p_scopes,

    v_user_id,

    now(),

    now(),

    jsonb_build_object(

      'integration_kind',
        p_credential_kind,

      'environment',
        p_environment,

      'credential_version',
        1

    )

  )
  returning id
  into v_connection_id;


  /* ----------------------------------------------------------
     Store credential.

     Plaintext secret NEVER enters the table.
     ---------------------------------------------------------- */

  insert into public.integration_api_credentials (

    organization_id,

    connection_id,

    credential_kind,

    environment,

    name,

    public_key,

    secret_key_hash,

    secret_key_prefix,

    secret_key_last4,

    scopes,

    allowed_hosts,

    status,

    created_by,

    expires_at,

    metadata

  )
  values (

    p_organization_id,

    v_connection_id,

    p_credential_kind,

    p_environment,

    btrim(p_name),

    v_public_key,

    extensions.digest(
      v_secret_key,
      'sha256'
    ),

    v_secret_prefix,

    right(v_secret_key, 4),

    p_scopes,

    p_allowed_hosts,

    'active',

    v_user_id,

    p_expires_at,

    jsonb_build_object(

      'credential_version',
        1,

      'secret_storage',
        'sha256_hash_only',

      'plaintext_persisted',
        false

    )

  )
  returning id
  into v_credential_id;


  /* ----------------------------------------------------------
     Audit log
     ---------------------------------------------------------- */

  insert into public.integration_audit_log (

    organization_id,

    connection_id,

    provider,

    event_type,

    actor_user_id,

    detail

  )
  values (

    p_organization_id,

    v_connection_id,

    'salsys',

    'api_credential_created',

    v_user_id,

    jsonb_build_object(

      'credential_id',
        v_credential_id,

      'credential_kind',
        p_credential_kind,

      'environment',
        p_environment,

      'public_key',
        v_public_key,

      'scopes',
        p_scopes,

      'allowed_hosts',
        p_allowed_hosts

    )

  );


  /* ----------------------------------------------------------
     Return plaintext secret ONCE.
     ---------------------------------------------------------- */

  return query

  select

    v_credential_id,

    v_connection_id,

    p_organization_id,

    btrim(p_name),

    p_credential_kind,

    p_environment,

    v_public_key,

    v_secret_key,

    p_scopes,

    p_allowed_hosts,

    p_expires_at;

end;

$function$;


/* ============================================================
   4. EXECUTION SECURITY FOR CREATION FUNCTION
   ============================================================ */

revoke all
on function public.create_integration_api_credential(
  uuid,
  text,
  text,
  text,
  text[],
  text[],
  timestamptz
)
from public;


revoke all
on function public.create_integration_api_credential(
  uuid,
  text,
  text,
  text,
  text[],
  text[],
  timestamptz
)
from anon;


grant execute
on function public.create_integration_api_credential(
  uuid,
  text,
  text,
  text,
  text[],
  text[],
  timestamptz
)
to authenticated;


/* ============================================================
   5. SERVER-ONLY SECRET VALIDATION
   ============================================================ */

create or replace function
public.validate_integration_api_secret(

  p_secret_key text,

  p_required_scope text default null,

  p_hostname text default null

)
returns table (

  credential_id uuid,

  connection_id uuid,

  organization_id uuid,

  public_key text,

  credential_kind text,

  environment text,

  scopes text[],

  allowed_hosts text[]

)
language sql
security definer

set search_path = public, extensions, pg_temp

as $function$

  with matched as (

    select
      c.id

    from public.integration_api_credentials c

    join public.integration_connections ic
      on ic.id = c.connection_id
     and ic.organization_id = c.organization_id

    where c.secret_key_hash =
      extensions.digest(
        p_secret_key,
        'sha256'
      )

      and c.status = 'active'

      and ic.status = 'connected'

      and ic.provider = 'salsys'

      and ic.auth_mode = 'api_key'

      and (
        c.expires_at is null
        or c.expires_at > now()
      )

      and (
        p_required_scope is null
        or p_required_scope = any(c.scopes)
      )

      and (

        cardinality(c.allowed_hosts) = 0

        or (

          p_hostname is not null

          and lower(btrim(p_hostname))
              = any(c.allowed_hosts)

        )

      )

    limit 1

  ),

  touched as (

    update public.integration_api_credentials c

    set last_used_at = now()

    from matched m

    where c.id = m.id

    returning c.*

  )

  select

    t.id,

    t.connection_id,

    t.organization_id,

    t.public_key,

    t.credential_kind,

    t.environment,

    t.scopes,

    t.allowed_hosts

  from touched t;

$function$;


/* ============================================================
   6. VALIDATION FUNCTION SECURITY
   ============================================================ */

revoke all
on function public.validate_integration_api_secret(
  text,
  text,
  text
)
from public;


revoke all
on function public.validate_integration_api_secret(
  text,
  text,
  text
)
from anon;


revoke all
on function public.validate_integration_api_secret(
  text,
  text,
  text
)
from authenticated;


grant execute
on function public.validate_integration_api_secret(
  text,
  text,
  text
)
to service_role;


commit;