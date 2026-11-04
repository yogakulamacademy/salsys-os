-- Newest-created Leads sorting for the authorized paginated workspace read models.
-- Both v2 (standard list) and v3 (attribution-scoped list) rank all filtered
-- rows *before* pagination. Reuse their existing created_at DESC, id DESC
-- deterministic tie-breakers; do not sort individual 50-row pages in JS.
--
-- Preserve the exact existing SECURITY DEFINER/INVOKER, tenant isolation,
-- original function signatures, grants, and any other filtering behavior.
begin;

do $migration$
declare
  v_function regprocedure;
  v_definition text;
  v_existing text := 'when p_sort in (''name'',''stage_age_desc'',''followup_asc'')';
  v_added text := 'when p_sort in (''name'',''stage_age_desc'',''followup_asc'',''created_desc'')';
begin
  foreach v_function in array array[
    'public.get_leads_workspace_page_v2(uuid,integer,integer,text,text,text,text,text,text,text,text,text)'::regprocedure,
    'public.get_leads_workspace_page_v3(uuid,integer,integer,text,text,text,text,text,text,text,text,text,text,text)'::regprocedure
  ] loop
    select pg_get_functiondef(v_function::oid) into v_definition;
    if v_definition is null then
      raise exception 'Unable to read Leads read-model function %', v_function;
    end if;

    if position(v_added in v_definition) > 0 then
      -- Idempotent against an already-updated database.
      continue;
    end if;

    if position(v_existing in v_definition) = 0 or
       length(v_definition) - length(replace(v_definition, v_existing, '')) <> length(v_existing) then
      raise exception 'Unexpected sort-mode guard in %, no changes applied', v_function;
    end if;

    if position('f.created_at desc nulls last' in v_definition) = 0 or
       position('f.id desc' in v_definition) = 0 then
      raise exception 'Expected global creation-date tie-breakers missing in %', v_function;
    end if;

    execute replace(v_definition, v_existing, v_added);
  end loop;
end;
$migration$;

commit;
