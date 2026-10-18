-- Claude SEO Intelligence -> draft experiment staging v1
-- Additive only. No automatic approval, execution, or publishing.

create table if not exists public.seo_ai_recommendation_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  analysis_run_id uuid not null references public.seo_ai_analysis_runs(id) on delete cascade,
  recommendation_kind text not null default 'action'
    check (recommendation_kind in ('action')),
  recommendation_index integer not null check (recommendation_index >= 0),
  experiment_id uuid not null references public.seo_experiments(id) on delete cascade,
  recommendation_snapshot jsonb not null default '{}'::jsonb
    check (jsonb_typeof(recommendation_snapshot) = 'object'),
  evidence_fingerprint text,
  prompt_version text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (organization_id, analysis_run_id, recommendation_kind, recommendation_index)
);

create index if not exists seo_ai_recommendation_links_org_created_idx
  on public.seo_ai_recommendation_links(organization_id, created_at desc);

create index if not exists seo_ai_recommendation_links_experiment_idx
  on public.seo_ai_recommendation_links(experiment_id);

alter table public.seo_ai_recommendation_links enable row level security;

revoke insert, update, delete on public.seo_ai_recommendation_links from anon, authenticated;
grant select on public.seo_ai_recommendation_links to authenticated;

create policy "seo_ai_recommendation_links_member_read"
  on public.seo_ai_recommendation_links
  for select
  to authenticated
  using (public.is_organization_member(organization_id));

create or replace function public.create_claude_seo_recommendation_experiment_v1(
  p_organization_id uuid,
  p_analysis_run_id uuid,
  p_recommendation_index integer,
  p_created_by uuid default null
)
returns table(
  experiment_id uuid,
  link_id uuid,
  experiment_status text,
  created boolean
)
language plpgsql
security definer
set search_path to 'public', 'auth', 'pg_temp'
as $function$
declare
  v_analysis public.seo_ai_analysis_runs%rowtype;
  v_item jsonb;
  v_existing public.seo_ai_recommendation_links%rowtype;
  v_action text;
  v_expected text;
  v_evidence text;
  v_candidate_url text;
  v_page_id uuid;
  v_page_url text;
  v_title text;
  v_hypothesis text;
  v_primary_metric text := 'gsc_clicks';
  v_experiment_id uuid;
  v_link_id uuid;
begin
  if coalesce(auth.role(),'') <> 'service_role' then
    raise exception 'Service role required';
  end if;

  if p_organization_id is null or p_analysis_run_id is null then
    raise exception 'Organization and analysis are required';
  end if;

  if p_recommendation_index is null or p_recommendation_index < 0 then
    raise exception 'Recommendation index is invalid';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'claude-seo-stage:' || p_organization_id::text || ':' || p_analysis_run_id::text || ':' || p_recommendation_index::text,
    0
  ));

  select * into v_existing
  from public.seo_ai_recommendation_links
  where organization_id = p_organization_id
    and analysis_run_id = p_analysis_run_id
    and recommendation_kind = 'action'
    and recommendation_index = p_recommendation_index;

  if found then
    return query
      select v_existing.experiment_id, v_existing.id, e.status, false
      from public.seo_experiments e
      where e.id = v_existing.experiment_id
        and e.organization_id = p_organization_id;
    return;
  end if;

  select * into v_analysis
  from public.seo_ai_analysis_runs
  where id = p_analysis_run_id
    and organization_id = p_organization_id
    and analysis_type = 'workspace_seo_intelligence'
    and target_kind = 'workspace'
    and target_id = 'seo-intelligence'
    and model_provider = 'anthropic'
    and status = 'completed';

  if not found then
    raise exception 'Completed Claude SEO analysis not found';
  end if;

  if coalesce(v_analysis.output->>'human_approval_required','false') <> 'true' then
    raise exception 'Claude analysis guardrail is missing';
  end if;

  v_item := v_analysis.output -> 'actions' -> p_recommendation_index;
  if v_item is null or jsonb_typeof(v_item) <> 'object' then
    raise exception 'Claude recommendation not found';
  end if;

  v_action := nullif(btrim(v_item->>'action'),'');
  if v_action is null then
    raise exception 'Claude recommendation action is missing';
  end if;

  if coalesce((v_item->>'approval_required')::boolean,false) is not true then
    raise exception 'Claude recommendation does not require approval';
  end if;

  v_expected := nullif(btrim(v_item->>'expected_signal'),'');
  v_evidence := nullif(btrim(v_item->>'evidence'),'');
  v_candidate_url := nullif(btrim(v_item->>'target_url'),'');

  if v_candidate_url is not null then
    select p.id, p.normalized_url
      into v_page_id, v_page_url
    from public.seo_pages p
    where p.organization_id = p_organization_id
      and (p.normalized_url = v_candidate_url or p.canonical_url = v_candidate_url)
    limit 1;

    if v_page_id is null then
      raise exception 'Claude target URL is not a page in this organization';
    end if;
  end if;

  v_title := left('Claude SEO: ' || v_action, 240);
  v_hypothesis := left(
    coalesce(v_evidence, 'Grounded first-party SEO evidence supports testing this recommendation.') ||
    case when v_expected is not null then ' Expected signal: ' || v_expected else '' end,
    2000
  );

  v_primary_metric := case
    when lower(v_action) ~ '(meta|title|description|ctr|snippet)' then 'gsc_ctr'
    when lower(v_action) ~ '(technical|index|crawl|canonical)' then 'gsc_impressions'
    when lower(v_action) ~ '(geo|generative|ai referral)' then 'ai_referral_sessions'
    else 'gsc_clicks'
  end;

  insert into public.seo_experiments(
    organization_id,
    title,
    hypothesis,
    target_kind,
    target_page_id,
    target_url,
    source_layer,
    source_action,
    source_reference,
    primary_metric,
    secondary_metrics,
    status,
    minimum_observation_days,
    created_by
  ) values (
    p_organization_id,
    v_title,
    v_hypothesis,
    case when v_page_id is not null then 'page' else 'other' end,
    v_page_id,
    v_page_url,
    'claude_seo_intelligence_v1',
    'workspace_action',
    jsonb_build_object(
      'analysis_run_id', p_analysis_run_id,
      'recommendation_kind', 'action',
      'recommendation_index', p_recommendation_index,
      'prompt_version', v_analysis.prompt_version,
      'input_fingerprint', v_analysis.input_fingerprint,
      'model_provider', v_analysis.model_provider,
      'model_name', v_analysis.model_name,
      'recommendation', v_item,
      'ranking_evidence_status', v_analysis.output->>'ranking_evidence_status',
      'guardrail', 'draft_only_human_approval_required'
    ),
    v_primary_metric,
    array['gsc_clicks','gsc_impressions','organic_leads']::text[],
    'draft',
    14,
    p_created_by
  ) returning id into v_experiment_id;

  insert into public.seo_ai_recommendation_links(
    organization_id,
    analysis_run_id,
    recommendation_kind,
    recommendation_index,
    experiment_id,
    recommendation_snapshot,
    evidence_fingerprint,
    prompt_version,
    created_by
  ) values (
    p_organization_id,
    p_analysis_run_id,
    'action',
    p_recommendation_index,
    v_experiment_id,
    v_item,
    v_analysis.input_fingerprint,
    v_analysis.prompt_version,
    p_created_by
  ) returning id into v_link_id;

  return query select v_experiment_id, v_link_id, 'draft'::text, true;
end;
$function$;

revoke all on function public.create_claude_seo_recommendation_experiment_v1(uuid,uuid,integer,uuid) from public, anon, authenticated;
grant execute on function public.create_claude_seo_recommendation_experiment_v1(uuid,uuid,integer,uuid) to service_role;
