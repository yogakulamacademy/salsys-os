begin;

-- CI-only historical recovery prerequisite.
-- finalize_course_catalog_sync existed out-of-band before
-- 20261014054613_course_catalog_finalize_rpc_hardening.sql revoked its
-- authenticated EXECUTE privilege. Production already contains the hardened
-- function. Do not promote this file into the normal migration ledger.

create or replace function public.finalize_course_catalog_sync(
  p_run_id uuid,
  p_source_system text,
  p_organization_id uuid
)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
    v_count integer := 0;
begin
    if auth.role() <> 'service_role' then
        raise exception 'Service role required';
    end if;

    if p_organization_id is null then
        raise exception 'Organization ID is required';
    end if;

    if not exists (
        select 1
        from public.course_catalog_sync_runs
        where id = p_run_id
          and organization_id = p_organization_id
          and source_system = p_source_system
    ) then
        raise exception
            'Course catalog sync run does not belong to organization';
    end if;

    update public.course_batches
    set
        source_active = false,
        last_synced_at = now()
    where organization_id = p_organization_id
      and source_system = p_source_system
      and source_active = true
      and (
          last_sync_run_id is null
          or last_sync_run_id <> p_run_id
      );

    get diagnostics v_count = row_count;

    return v_count;
end;
$function$;

commit;
