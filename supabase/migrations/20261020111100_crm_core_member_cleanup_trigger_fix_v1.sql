begin;

-- Keep the membership lifecycle trigger side-effect-only. AFTER trigger return
-- values are ignored, so returning NULL avoids relying on composite COALESCE
-- behavior for NEW/OLD records across UPDATE and DELETE operations.
create or replace function public.reconcile_crm_assignments_on_member_status_v1()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $function$
declare
  v_organization_id uuid;
  v_user_id uuid;
  v_should_clear boolean := false;
begin
  if tg_op = 'DELETE' then
    v_organization_id := old.organization_id;
    v_user_id := old.user_id;
    v_should_clear := old.active = true;
  else
    v_organization_id := new.organization_id;
    v_user_id := new.user_id;
    v_should_clear := old.active = true and new.active = false;
  end if;

  if v_should_clear then
    update public.leads
    set owner_user_id = null
    where organization_id = v_organization_id
      and owner_user_id = v_user_id;

    update public.tasks
    set assigned_to = null
    where organization_id = v_organization_id
      and assigned_to = v_user_id
      and status in ('open', 'snoozed');

    update public.conversations
    set assigned_to = null
    where organization_id = v_organization_id
      and assigned_to = v_user_id
      and status = 'open';
  end if;

  return null;
end;
$function$;

revoke all on function public.reconcile_crm_assignments_on_member_status_v1()
  from public, anon, authenticated;

commit;
