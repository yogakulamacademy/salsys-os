begin;

-- =============================================================================
-- 058_sales_workspace_manager_authorization.sql
--
-- Aligns Sales management mutations with the functional workspace RBAC model.
--
-- - Sales owner/admin/manager may create manual CRM leads.
-- - Sales owner/admin/manager may assign/unassign leads.
-- - Sales members/viewers may not perform those management mutations.
-- - Assignment targets must belong to the same organization and have usable
--   Sales access (owner/admin or Sales manager/member).
-- =============================================================================

create or replace function public.can_manage_sales_workspace(
  p_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $function$
  select
    auth.role() = 'service_role'
    or coalesce(
      public.workspace_role(
        p_organization_id,
        'sales'
      ) in (
        'owner',
        'admin',
        'manager'
      ),
      false
    );
$function$;

revoke all on function public.can_manage_sales_workspace(uuid)
  from public, anon;

grant execute on function public.can_manage_sales_workspace(uuid)
  to authenticated, service_role;

comment on function public.can_manage_sales_workspace(uuid) is
  'Returns true for service_role or an effective Sales workspace owner/admin/manager in the organization.';


-- =============================================================================
-- CREATE LEAD AUTHORIZATION
-- Preserve the existing create_crm_lead() body and replace only its legacy
-- organization-CRM-admin authorization helper.
-- =============================================================================

do $migration$
declare
  v_signature regprocedure :=
    'public.create_crm_lead(uuid,text,text,text,text,uuid,uuid,text,date,text,text,text,contact_channel,contact_channel,text,text,text,text)'::regprocedure;
  v_definition text;
  v_updated_definition text;
begin
  select pg_get_functiondef(v_signature::oid)
    into v_definition;

  if v_definition is null then
    raise exception 'Unable to read function definition for %', v_signature;
  end if;

  if position('public.can_administer_organization_crm(' in v_definition) = 0 then
    raise exception
      'Expected legacy create_crm_lead authorization helper was not found in %',
      v_signature;
  end if;

  v_updated_definition := replace(
    v_definition,
    'public.can_administer_organization_crm(',
    'public.can_manage_sales_workspace('
  );

  if v_updated_definition = v_definition then
    raise exception 'Authorization replacement made no change for %', v_signature;
  end if;

  execute v_updated_definition;
end;
$migration$;


-- =============================================================================
-- LEAD ASSIGNMENT AUTHORIZATION + TENANT-SAFE TARGET VALIDATION
-- =============================================================================

create or replace function public.assign_lead_owner(
  p_lead_id uuid,
  p_owner_user_id uuid default null::uuid,
  p_sync_open_work boolean default true
)
returns void
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $function$
declare
  v_organization_id uuid;
  v_old_owner uuid;
  v_owner_name text;
begin

  -- -------------------------------------------------------
  -- RESOLVE + LOCK LEAD TENANT
  -- -------------------------------------------------------

  select
    l.organization_id,
    l.owner_user_id
  into
    v_organization_id,
    v_old_owner
  from public.leads l
  where l.id = p_lead_id
  for update;

  if not found then
    raise exception 'Lead not found';
  end if;


  -- -------------------------------------------------------
  -- SALES MANAGER AUTHORIZATION
  -- -------------------------------------------------------

  if not public.can_manage_sales_workspace(v_organization_id) then
    raise exception
      'Not authorized to assign leads for this Sales workspace';
  end if;


  -- -------------------------------------------------------
  -- VALIDATE NEW OWNER
  -- -------------------------------------------------------

  if p_owner_user_id is not null then

    select
      coalesce(
        nullif(btrim(p.full_name), ''),
        'CRM User'
      )
    into v_owner_name
    from public.profiles p
    join public.organization_members om
      on om.organization_id = v_organization_id
     and om.user_id = p.id
     and om.active = true
    where p.id = p_owner_user_id
      and p.active = true
      and exists (
        select 1
        from public.organization_workspaces ow
        where ow.organization_id = v_organization_id
          and ow.workspace_code = 'sales'
          and ow.enabled = true
      )
      and (
        om.role in ('owner', 'admin')
        or exists (
          select 1
          from public.workspace_memberships wm
          where wm.organization_id = v_organization_id
            and wm.workspace_code = 'sales'
            and wm.user_id = p.id
            and wm.active = true
            and wm.role in ('manager', 'member')
        )
      )
    limit 1;

    if not found then
      raise exception
        'Selected owner must be an active Sales user in the lead organization';
    end if;

  else

    v_owner_name := 'Unassigned';

  end if;


  -- -------------------------------------------------------
  -- UPDATE LEAD OWNER
  -- -------------------------------------------------------

  update public.leads
  set owner_user_id = p_owner_user_id
  where id = p_lead_id;


  -- -------------------------------------------------------
  -- SYNC OPEN WORK
  -- -------------------------------------------------------

  if p_sync_open_work then

    update public.tasks
    set assigned_to = p_owner_user_id
    where lead_id = p_lead_id
      and status in ('open', 'snoozed');

    update public.conversations
    set assigned_to = p_owner_user_id
    where lead_id = p_lead_id
      and status = 'open';

  end if;


  -- -------------------------------------------------------
  -- AUDIT LOG
  -- -------------------------------------------------------

  insert into public.activities (
    lead_id,
    activity_type,
    actor_type,
    actor_id,
    title,
    details,
    metadata
  )
  values (
    p_lead_id,
    'owner_assignment',
    'human',
    auth.uid()::text,

    case
      when p_owner_user_id is null
        then 'Lead unassigned'
      else
        'Lead assigned'
    end,

    case
      when p_owner_user_id is null
        then 'Admissions ownership removed.'
      else
        'Admissions owner set to '
        || v_owner_name
        || '.'
    end,

    jsonb_build_object(
      'from_owner_user_id',
        v_old_owner,
      'to_owner_user_id',
        p_owner_user_id,
      'sync_open_work',
        p_sync_open_work
    )
  );

end;
$function$;


-- Keep execution explicit and prevent anonymous/public invocation drift.
revoke all on function public.create_crm_lead(
  uuid,
  text,
  text,
  text,
  text,
  uuid,
  uuid,
  text,
  date,
  text,
  text,
  text,
  public.contact_channel,
  public.contact_channel,
  text,
  text,
  text,
  text
) from public, anon;

revoke all on function public.assign_lead_owner(uuid, uuid, boolean)
  from public, anon;

grant execute on function public.create_crm_lead(
  uuid,
  text,
  text,
  text,
  text,
  uuid,
  uuid,
  text,
  date,
  text,
  text,
  text,
  public.contact_channel,
  public.contact_channel,
  text,
  text,
  text,
  text
) to authenticated, service_role;

grant execute on function public.assign_lead_owner(uuid, uuid, boolean)
  to authenticated, service_role;

comment on function public.assign_lead_owner(uuid, uuid, boolean) is
  'Assigns a lead within its organization. Requires Sales workspace management authority and validates the target as an active same-organization Sales user.';

commit;
