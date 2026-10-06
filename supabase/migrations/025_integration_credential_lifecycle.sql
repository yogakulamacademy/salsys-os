begin;


/* ============================================================
   MIGRATION 025
   Salsys Integration Credential Lifecycle
   ============================================================ */


/* ============================================================
   1. SAFE CREDENTIAL LISTING
   ============================================================ */

create or replace function
public.list_integration_api_credentials(
  p_organization_id uuid
)
returns table (

  credential_id uuid,
  connection_id uuid,

  name text,
  credential_kind text,
  environment text,

  public_key text,

  secret_key_prefix text,
  secret_key_last4 text,

  scopes text[],
  allowed_hosts text[],

  status text,
  effective_status text,

  created_at timestamptz,
  updated_at timestamptz,
  last_used_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,

  rotated_from_id uuid

)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$

declare
  v_user_id uuid;

begin

  v_user_id := auth.uid();


  if v_user_id is null then
    raise exception
      'Authentication required';
  end if;


  if not public.can_administer_organization_crm(
    p_organization_id
  ) then

    raise exception
      'Not authorized to administer integrations for organization %',
      p_organization_id;

  end if;


  return query

  select

    c.id,
    c.connection_id,

    c.name,
    c.credential_kind,
    c.environment,

    c.public_key,

    c.secret_key_prefix,
    c.secret_key_last4,

    c.scopes,
    c.allowed_hosts,

    c.status,

    case

      when c.status = 'active'
       and c.expires_at is not null
       and c.expires_at <= now()
        then 'expired'

      else c.status

    end as effective_status,

    c.created_at,
    c.updated_at,
    c.last_used_at,
    c.expires_at,
    c.revoked_at,

    c.rotated_from_id

  from public.integration_api_credentials c

  where c.organization_id =
    p_organization_id

  order by c.created_at desc;

end;

$function$;


/* ============================================================
   2. REVOKE CREDENTIAL
   ============================================================ */

create or replace function
public.revoke_integration_api_credential(
  p_credential_id uuid
)
returns table (

  credential_id uuid,
  connection_id uuid,
  status text,
  revoked_at timestamptz

)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$

declare

  v_user_id uuid;

  v_organization_id uuid;
  v_connection_id uuid;

  v_current_status text;
  v_revoked_at timestamptz;

begin

  v_user_id := auth.uid();


  if v_user_id is null then
    raise exception
      'Authentication required';
  end if;


  select

    c.organization_id,
    c.connection_id,
    c.status,
    c.revoked_at

  into

    v_organization_id,
    v_connection_id,
    v_current_status,
    v_revoked_at

  from public.integration_api_credentials c

  where c.id =
    p_credential_id;


  if not found then
    raise exception
      'Credential % does not exist',
      p_credential_id;
  end if;


  if not public.can_administer_organization_crm(
    v_organization_id
  ) then

    raise exception
      'Not authorized to administer this credential';

  end if;


  if v_current_status <> 'revoked' then

    update public.integration_api_credentials c

    set

      status = 'revoked',

      revoked_at = coalesce(
        c.revoked_at,
        now()
      )

    where c.id =
      p_credential_id

    returning c.revoked_at
    into v_revoked_at;


    if not exists (

      select 1

      from public.integration_api_credentials other

      where other.connection_id =
        v_connection_id

        and other.id <>
          p_credential_id

        and other.status =
          'active'

        and (
          other.expires_at is null
          or other.expires_at > now()
        )

    ) then

      update public.integration_connections ic

      set

        status =
          'revoked',

        last_verified_at =
          now()

      where ic.id =
        v_connection_id;

    end if;


    insert into public.integration_audit_log (

      organization_id,
      connection_id,
      provider,
      event_type,
      actor_user_id,
      detail

    )
    values (

      v_organization_id,
      v_connection_id,
      'salsys',
      'api_credential_revoked',
      v_user_id,

      jsonb_build_object(
        'credential_id',
        p_credential_id
      )

    );

  end if;


  return query

  select

    c.id,
    c.connection_id,
    c.status,
    c.revoked_at

  from public.integration_api_credentials c

  where c.id =
    p_credential_id;

end;

$function$;


/* ============================================================
   3. ROTATE CREDENTIAL
   ============================================================ */

create or replace function
public.rotate_integration_api_credential(
  p_credential_id uuid
)
returns table (

  old_credential_id uuid,

  new_credential_id uuid,

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

  v_organization_id uuid;
  v_connection_id uuid;

  v_name text;
  v_kind text;
  v_environment text;

  v_scopes text[];
  v_allowed_hosts text[];

  v_expires_at timestamptz;

  v_old_status text;

  v_public_prefix text;
  v_secret_prefix text;

  v_public_key text;
  v_secret_key text;

  v_new_credential_id uuid;

begin

  v_user_id := auth.uid();


  if v_user_id is null then
    raise exception
      'Authentication required';
  end if;


  select

    c.organization_id,
    c.connection_id,

    c.name,
    c.credential_kind,
    c.environment,

    c.scopes,
    c.allowed_hosts,

    c.expires_at,

    c.status

  into

    v_organization_id,
    v_connection_id,

    v_name,
    v_kind,
    v_environment,

    v_scopes,
    v_allowed_hosts,

    v_expires_at,

    v_old_status

  from public.integration_api_credentials c

  where c.id =
    p_credential_id

  for update;


  if not found then
    raise exception
      'Credential % does not exist',
      p_credential_id;
  end if;


  if not public.can_administer_organization_crm(
    v_organization_id
  ) then

    raise exception
      'Not authorized to administer this credential';

  end if;


  if v_old_status <> 'active' then

    raise exception
      'Only an active credential can be rotated';

  end if;


  if v_expires_at is not null
     and v_expires_at <= now() then

    raise exception
      'Expired credential cannot be rotated';

  end if;


  if not exists (

    select 1

    from public.integration_connections ic

    where ic.id =
      v_connection_id

      and ic.organization_id =
        v_organization_id

      and ic.provider =
        'salsys'

      and ic.auth_mode =
        'api_key'

      and ic.status =
        'connected'

  ) then

    raise exception
      'Integration connection is not active';

  end if;


  if v_environment = 'live' then

    v_public_prefix :=
      'pk_live_';

    v_secret_prefix :=
      'sk_live';

  else

    v_public_prefix :=
      'pk_test_';

    v_secret_prefix :=
      'sk_test';

  end if;


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

    rotated_from_id,

    metadata

  )
  values (

    v_organization_id,
    v_connection_id,

    v_kind,
    v_environment,

    v_name,

    v_public_key,

    extensions.digest(
      v_secret_key,
      'sha256'
    ),

    v_secret_prefix,
    right(v_secret_key, 4),

    v_scopes,
    v_allowed_hosts,

    'active',

    v_user_id,

    v_expires_at,

    p_credential_id,

    jsonb_build_object(

      'credential_version',
        1,

      'secret_storage',
        'sha256_hash_only',

      'plaintext_persisted',
        false,

      'rotation',
        true

    )

  )
  returning id
  into v_new_credential_id;


  update public.integration_api_credentials c

  set

    status =
      'revoked',

    revoked_at =
      now()

  where c.id =
    p_credential_id;


  update public.integration_connections ic

  set

    status =
      'connected',

    external_account_id =
      v_public_key,

    scopes =
      v_scopes,

    last_verified_at =
      now(),

    provider_metadata =
      coalesce(
        ic.provider_metadata,
        '{}'::jsonb
      )
      ||
      jsonb_build_object(
        'environment',
          v_environment,
        'integration_kind',
          v_kind,
        'last_rotation_at',
          now()
      )

  where ic.id =
    v_connection_id;


  insert into public.integration_audit_log (

    organization_id,
    connection_id,
    provider,
    event_type,
    actor_user_id,
    detail

  )
  values (

    v_organization_id,
    v_connection_id,
    'salsys',
    'api_credential_rotated',
    v_user_id,

    jsonb_build_object(

      'old_credential_id',
        p_credential_id,

      'new_credential_id',
        v_new_credential_id,

      'public_key',
        v_public_key,

      'environment',
        v_environment,

      'credential_kind',
        v_kind

    )

  );


  return query

  select

    p_credential_id,

    v_new_credential_id,

    v_connection_id,
    v_organization_id,

    v_name,
    v_kind,
    v_environment,

    v_public_key,

    v_secret_key,

    v_scopes,
    v_allowed_hosts,

    v_expires_at;

end;

$function$;


/* ============================================================
   4. FUNCTION PERMISSIONS
   ============================================================ */

revoke all
on function public.list_integration_api_credentials(uuid)
from public;

revoke all
on function public.list_integration_api_credentials(uuid)
from anon;

grant execute
on function public.list_integration_api_credentials(uuid)
to authenticated;



revoke all
on function public.revoke_integration_api_credential(uuid)
from public;

revoke all
on function public.revoke_integration_api_credential(uuid)
from anon;

grant execute
on function public.revoke_integration_api_credential(uuid)
to authenticated;



revoke all
on function public.rotate_integration_api_credential(uuid)
from public;

revoke all
on function public.rotate_integration_api_credential(uuid)
from anon;

grant execute
on function public.rotate_integration_api_credential(uuid)
to authenticated;


commit;