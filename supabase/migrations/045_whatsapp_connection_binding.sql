begin;

-- =============================================================================
-- MIGRATION 045
-- WHATSAPP CONNECTION BINDING
--
-- Purpose:
--   Bind each WhatsApp phone-number account to its tenant-owned
--   integration_connections row.
--
-- This migration does NOT:
--   - move or expose any access token
--   - read environment secrets
--   - create a Yogakulam-specific credential
--   - change inbound webhook routing
--
-- Credential migration is performed separately by server-side application code
-- using the existing encrypted integration secret infrastructure.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. CONNECTION BINDING
-- -----------------------------------------------------------------------------

alter table public.whatsapp_accounts
  add column if not exists connection_id uuid;

alter table public.whatsapp_accounts
  add column if not exists is_default boolean not null default false;


-- -----------------------------------------------------------------------------
-- 2. FOREIGN KEY
-- -----------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.whatsapp_accounts'::regclass
      and conname = 'whatsapp_accounts_connection_id_fkey'
  ) then
    alter table public.whatsapp_accounts
      add constraint whatsapp_accounts_connection_id_fkey
      foreign key (connection_id)
      references public.integration_connections(id)
      on delete set null;
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 3. DEFAULT NUMBER MUST BELONG TO A CONNECTION
-- -----------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.whatsapp_accounts'::regclass
      and conname = 'whatsapp_accounts_default_requires_connection_check'
  ) then
    alter table public.whatsapp_accounts
      add constraint whatsapp_accounts_default_requires_connection_check
      check (
        is_default = false
        or connection_id is not null
      );
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 4. INDEXES
-- -----------------------------------------------------------------------------

create index if not exists
  idx_whatsapp_accounts_connection_id
on public.whatsapp_accounts(connection_id);


-- One active default sending number per WhatsApp connection.
create unique index if not exists
  whatsapp_accounts_connection_default_uidx
on public.whatsapp_accounts(connection_id)
where
  connection_id is not null
  and active = true
  and is_default = true;


-- -----------------------------------------------------------------------------
-- 5. TENANT / PROVIDER INTEGRITY GUARD
--
-- A WhatsApp account may only reference:
--   - an existing integration connection
--   - owned by the same organization
--   - whose provider is whatsapp
-- -----------------------------------------------------------------------------

create or replace function
public.enforce_whatsapp_account_connection_scope()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_connection_organization_id uuid;
  v_connection_provider text;
begin

  if new.connection_id is null then
    if new.is_default then
      raise exception
        'Default WhatsApp account requires an integration connection';
    end if;

    return new;
  end if;


  select
    ic.organization_id,
    ic.provider
  into
    v_connection_organization_id,
    v_connection_provider
  from public.integration_connections ic
  where ic.id = new.connection_id;


  if not found then
    raise exception
      'WhatsApp integration connection % does not exist',
      new.connection_id;
  end if;


  if v_connection_provider <> 'whatsapp' then
    raise exception
      'WhatsApp account connection must use provider=whatsapp';
  end if;


  if v_connection_organization_id is distinct from new.organization_id then
    raise exception
      'WhatsApp account and integration connection must belong to the same organization';
  end if;


  return new;
end
$function$;


-- Trigger functions are internal database plumbing and do not require
-- direct API execution privileges.

revoke execute
on function public.enforce_whatsapp_account_connection_scope()
from public, anon, authenticated, service_role;


drop trigger if exists
  whatsapp_accounts_connection_scope_guard
on public.whatsapp_accounts;


create trigger
  whatsapp_accounts_connection_scope_guard
before insert or update of
  organization_id,
  connection_id,
  is_default
on public.whatsapp_accounts
for each row
execute function
  public.enforce_whatsapp_account_connection_scope();


-- -----------------------------------------------------------------------------
-- 6. DOCUMENTATION
-- -----------------------------------------------------------------------------

comment on column public.whatsapp_accounts.connection_id is
  'Tenant-owned WhatsApp integration connection that controls credentials for this phone number.';

comment on column public.whatsapp_accounts.is_default is
  'True when this phone number is the default outbound sender for its WhatsApp integration connection.';

comment on function public.enforce_whatsapp_account_connection_scope() is
  'Ensures a WhatsApp phone account can only bind to a WhatsApp integration connection owned by the same organization.';


commit;