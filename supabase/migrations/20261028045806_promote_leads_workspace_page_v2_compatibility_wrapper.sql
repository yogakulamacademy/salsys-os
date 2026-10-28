create or replace function public.get_leads_workspace_page(
  p_organization_id uuid,
  p_page integer default 1,
  p_page_size integer default 50,
  p_query text default null,
  p_stage text default null,
  p_source text default null,
  p_channel text default null,
  p_owner text default null,
  p_course text default null,
  p_aging text default null,
  p_quick_view text default 'all',
  p_sort text default 'stage_age_desc'
)
returns jsonb
language sql
stable
security invoker
set search_path to 'public','auth','pg_temp'
as $fn$
  select public.get_leads_workspace_page_v2(
    p_organization_id,
    p_page,
    p_page_size,
    p_query,
    p_stage,
    p_source,
    p_channel,
    p_owner,
    p_course,
    p_aging,
    p_quick_view,
    p_sort
  );
$fn$;
