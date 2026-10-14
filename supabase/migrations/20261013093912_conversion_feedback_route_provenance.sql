begin;

-- ============================================================
-- MIGRATION 053
-- CONVERSION FEEDBACK ROUTE PROVENANCE HARDENING
--
-- Guarantees:
--   * created_by is optional for service-created routes
--   * when present on INSERT, creator must be an active member
--     of the organization owning the selected integration
--     connection
--   * created_by is immutable after route creation
--   * if a pre-delivery route is rebound to another connection,
--     its existing creator must also be an active member of the
--     new connection organization
--
-- Migration 032 remains immutable; this adds a separate
-- defense-in-depth trigger.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Refuse to install over inconsistent existing provenance.
-- ------------------------------------------------------------

do $$
begin
  if exists (
    select 1
    from public.conversion_feedback_routes r
    where r.created_by is not null
      and not exists (
        select 1
        from public.organization_members om
        where om.organization_id = r.organization_id
          and om.user_id = r.created_by
          and om.active = true
      )
  ) then
    raise exception
      '053 abort: conversion_feedback_routes contains creator provenance outside the active organization membership';
  end if;
end
$$;


-- ------------------------------------------------------------
-- 2. Creator provenance validation.
-- ------------------------------------------------------------

create or replace function
public.validate_conversion_feedback_route_creator()
returns trigger
language plpgsql
set search_path =
  'public',
  'pg_temp'
as $function$
declare
  v_connection_organization_id uuid;
  v_must_validate_membership boolean := false;
begin

  if tg_op = 'UPDATE'
     and new.created_by is distinct from old.created_by then

    raise exception
      'Conversion feedback route created_by is immutable';

  end if;


  v_must_validate_membership :=
    new.created_by is not null
    and (
      tg_op = 'INSERT'
      or new.connection_id is distinct from old.connection_id
    );


  if v_must_validate_membership then

    select ic.organization_id
    into v_connection_organization_id
    from public.integration_connections ic
    where ic.id = new.connection_id;

    if not found then
      raise exception
        'Conversion feedback connection does not exist';
    end if;


    if not exists (
      select 1
      from public.organization_members om
      where om.organization_id = v_connection_organization_id
        and om.user_id = new.created_by
        and om.active = true
    ) then
      raise exception
        'Conversion feedback route creator must be an active member of the connection organization';
    end if;

  end if;


  return new;

end;
$function$;


revoke all
on function
  public.validate_conversion_feedback_route_creator()
from public, anon, authenticated;


grant execute
on function
  public.validate_conversion_feedback_route_creator()
to service_role;


drop trigger if exists
  conversion_feedback_routes_creator_provenance
on public.conversion_feedback_routes;


create trigger
conversion_feedback_routes_creator_provenance
before insert or update
on public.conversion_feedback_routes
for each row
execute function
  public.validate_conversion_feedback_route_creator();


comment on function
public.validate_conversion_feedback_route_creator()
is
'Protects conversion-feedback route creation provenance. created_by is immutable, and when present must belong to the active organization membership of the selected integration connection at creation/rebinding time.';


commit;
