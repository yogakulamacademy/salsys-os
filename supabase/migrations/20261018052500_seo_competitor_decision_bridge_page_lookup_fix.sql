-- Fix page ownership lookup in competitor recommendation experiment bridge.
-- seo_pages exposes normalized_url/canonical_url, not a generic url column.

create or replace function public.create_competitor_recommendation_experiment_v1(
  p_organization_id uuid,
  p_analysis_run_id uuid,
  p_recommendation_index integer,
  p_created_by uuid default null
)
returns table(experiment_id uuid, link_id uuid, experiment_status text)
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_analysis public.seo_competitor_analysis_runs;
  v_rec jsonb;
  v_existing public.seo_competitor_recommendation_links;
  v_surface text;
  v_action text;
  v_why text;
  v_expected text;
  v_query text;
  v_candidate_url text;
  v_page_id uuid;
  v_page_url text;
  v_title text;
  v_hypothesis text;
  v_primary_metric text;
  v_secondary_metrics text[];
  v_experiment_id uuid;
  v_link_id uuid;
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'Service role required'; end if;
  if p_organization_id is null or p_analysis_run_id is null then raise exception 'Organization and analysis are required'; end if;
  if p_recommendation_index is null or p_recommendation_index < 0 then raise exception 'Recommendation index is invalid'; end if;

  select * into v_existing
  from public.seo_competitor_recommendation_links
  where organization_id = p_organization_id
    and analysis_run_id = p_analysis_run_id
    and recommendation_index = p_recommendation_index;

  if found then
    return query
      select v_existing.experiment_id, v_existing.id, e.status
      from public.seo_experiments e
      where e.id = v_existing.experiment_id
        and e.organization_id = p_organization_id;
    return;
  end if;

  select * into v_analysis
  from public.seo_competitor_analysis_runs
  where id = p_analysis_run_id
    and organization_id = p_organization_id
    and status = 'completed';
  if not found then raise exception 'Completed analysis not found'; end if;

  v_rec := v_analysis.recommendations -> p_recommendation_index;
  if v_rec is null or jsonb_typeof(v_rec) <> 'object' then raise exception 'Recommendation not found'; end if;

  v_surface := lower(coalesce(nullif(btrim(v_rec->>'surface'),''),'seo'));
  if v_surface not in ('seo','aeo','geo') then v_surface := 'seo'; end if;
  v_action := coalesce(nullif(btrim(v_rec->>'action'),''),'Improve organic visibility against observed competitors');
  v_why := coalesce(nullif(btrim(v_rec->>'why'),''),'Test whether the grounded competitor recommendation improves observed organic performance.');
  v_expected := nullif(btrim(v_rec->>'expected_signal'),'');
  v_query := nullif(btrim(v_rec->>'target_query'),'');
  v_candidate_url := nullif(btrim(v_rec->>'target_url'),'');

  -- Model-provided URLs are accepted only when they resolve to a tenant-owned SEO page.
  if v_candidate_url is not null then
    select p.id, p.normalized_url into v_page_id, v_page_url
    from public.seo_pages p
    where p.organization_id = p_organization_id
      and (p.normalized_url = v_candidate_url or p.canonical_url = v_candidate_url)
    limit 1;
  end if;

  v_title := left(
    case v_surface when 'aeo' then 'AEO competitor gap: ' when 'geo' then 'GEO competitor gap: ' else 'SEO competitor gap: ' end || v_action,
    240
  );
  v_hypothesis := left(v_why || case when v_expected is not null then ' Expected signal: ' || v_expected else '' end, 2000);
  v_primary_metric := case when v_surface = 'geo' then 'ai_referral_sessions' when v_surface = 'aeo' then 'gsc_ctr' else 'gsc_avg_position' end;
  v_secondary_metrics := array['gsc_clicks','organic_leads']::text[];

  insert into public.seo_experiments(
    organization_id,title,hypothesis,target_kind,target_page_id,target_url,
    source_layer,source_action,source_reference,primary_metric,secondary_metrics,
    status,minimum_observation_days,created_by
  ) values (
    p_organization_id,v_title,v_hypothesis,
    case when v_page_id is not null then 'page' else 'query' end,
    v_page_id,v_page_url,'competitor_intelligence',v_surface || '_competitor_gap',
    jsonb_build_object(
      'analysis_run_id',p_analysis_run_id,
      'recommendation_index',p_recommendation_index,
      'surface',v_surface,
      'target_query',v_query,
      'recommendation',v_rec,
      'guardrail','draft_only_human_approval_required'
    ),
    v_primary_metric,v_secondary_metrics,'draft',14,p_created_by
  ) returning id into v_experiment_id;

  insert into public.seo_competitor_recommendation_links(
    organization_id,analysis_run_id,recommendation_index,experiment_id,recommendation_snapshot,created_by
  ) values (
    p_organization_id,p_analysis_run_id,p_recommendation_index,v_experiment_id,v_rec,p_created_by
  ) returning id into v_link_id;

  return query select v_experiment_id, v_link_id, 'draft'::text;
end;
$$;

revoke all on function public.create_competitor_recommendation_experiment_v1(uuid,uuid,integer,uuid) from public, anon, authenticated;
grant execute on function public.create_competitor_recommendation_experiment_v1(uuid,uuid,integer,uuid) to service_role;
