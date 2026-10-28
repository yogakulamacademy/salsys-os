do $$
declare
  v_definition text;
begin
  v_definition := pg_get_viewdef('public.v_seo_keyword_intelligence_30d'::regclass, true);

  if position(' AS MATERIALIZED (' in v_definition) = 0 then
    raise exception 'Expected MATERIALIZED CTEs were not found in v_seo_keyword_intelligence_30d';
  end if;

  v_definition := replace(v_definition, ' AS MATERIALIZED (', ' AS NOT MATERIALIZED (');
  execute 'create or replace view public.v_seo_keyword_intelligence_30d as ' || v_definition;
end
$$;
