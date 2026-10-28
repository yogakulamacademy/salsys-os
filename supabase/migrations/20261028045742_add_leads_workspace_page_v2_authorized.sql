do $$
declare
  v_definition text;
begin
  v_definition := pg_get_functiondef('public.get_leads_workspace_page(uuid,integer,integer,text,text,text,text,text,text,text,text,text)'::regprocedure);

  if position('FUNCTION public.get_leads_workspace_page(' in v_definition) = 0 then
    raise exception 'Expected get_leads_workspace_page function definition not found';
  end if;

  if position('where v.organization_id = p_organization_id' in v_definition) = 0 then
    raise exception 'Expected leads base organization predicate not found';
  end if;

  v_definition := replace(v_definition,
    'FUNCTION public.get_leads_workspace_page(',
    'FUNCTION public.get_leads_workspace_page_v2('
  );

  v_definition := replace(v_definition,
    E' STABLE\n SET search_path TO ''public''',
    E' STABLE SECURITY DEFINER\n SET search_path TO ''public'', ''auth'', ''pg_temp'''
  );

  v_definition := replace(v_definition,
    'where v.organization_id = p_organization_id',
    'where v.organization_id = p_organization_id and (auth.role() = ''service_role'' or public.can_access_lead(v.id))'
  );

  execute v_definition;
end
$$;

revoke all on function public.get_leads_workspace_page_v2(uuid,integer,integer,text,text,text,text,text,text,text,text,text) from public, anon;
grant execute on function public.get_leads_workspace_page_v2(uuid,integer,integer,text,text,text,text,text,text,text,text,text) to authenticated, service_role;
