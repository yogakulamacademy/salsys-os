-- Marketing Campaign evidence health gate v1
--
-- The optimized Campaigns RPC can remain technically available while the
-- underlying paid-media sync is failed or materially stale. In that state the
-- workspace must not present cached campaign evidence as healthy/current.
--
-- Preserve the existing optimized read model as an internal implementation and
-- put an evidence-health gate in front of the public RPC. The application
-- already has a safe fallback path that renders cached rows with a directional
-- warning when the primary RPC is unavailable.

begin;

-- Fail loudly if the expected public read model is not present or if this
-- migration would collide with an already-defined internal implementation.
do $$
begin
  if to_regprocedure('public.get_campaigns_workspace(uuid,text,text,text,text,integer,integer)') is null then
    raise exception 'Expected public.get_campaigns_workspace(uuid,text,text,text,text,integer,integer)';
  end if;

  if to_regprocedure('public.get_campaigns_workspace_internal_v2(uuid,text,text,text,text,integer,integer)') is not null then
    raise exception 'public.get_campaigns_workspace_internal_v2 already exists';
  end if;
end
$$;

alter function public.get_campaigns_workspace(uuid,text,text,text,text,integer,integer)
  rename to get_campaigns_workspace_internal_v2;

revoke all on function public.get_campaigns_workspace_internal_v2(uuid,text,text,text,text,integer,integer)
  from public, anon, authenticated;
grant execute on function public.get_campaigns_workspace_internal_v2(uuid,text,text,text,text,integer,integer)
  to service_role;

comment on function public.get_campaigns_workspace_internal_v2(uuid,text,text,text,text,integer,integer) is
  'Internal optimized Campaigns read model. Public callers must use get_campaigns_workspace so provider evidence health is checked before campaign metrics are treated as current.';

create function public.get_campaigns_workspace(
  p_organization_id uuid,
  p_query text default null::text,
  p_platform text default 'all'::text,
  p_outcome text default 'all'::text,
  p_sort text default 'spend_desc'::text,
  p_page integer default 1,
  p_page_size integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public','auth','pg_temp'
as $function$
declare
  v_platform text := lower(btrim(coalesce(p_platform, 'all')));
  v_google_relevant boolean;
  v_meta_relevant boolean;
  v_google_health record;
  v_meta_health record;
  v_issues text[] := array[]::text[];
begin
  if p_organization_id is null then
    raise exception 'Organization ID is required';
  end if;

  if not public.is_organization_member(p_organization_id) then
    raise exception 'Not authorized for organization %', p_organization_id using errcode = '42501';
  end if;

  v_google_relevant := v_platform in ('all', 'google', 'google ads');
  v_meta_relevant := v_platform in ('all', 'meta', 'meta ads');

  if v_google_relevant then
    select
      h.last_sync_status,
      h.last_sync_completed_at,
      h.latest_data_date,
      h.latest_cache_update_at
    into v_google_health
    from public.v_google_ads_sync_health h
    where h.organization_id = p_organization_id
    limit 1;

    -- No row is not treated as a failure here because provider visibility is
    -- resolved by the application before this RPC is called. A present health
    -- row, however, is authoritative evidence about sync readiness.
    if found then
      if coalesce(v_google_health.last_sync_status, '') <> 'success' then
        v_issues := array_append(
          v_issues,
          format(
            'Google Ads evidence is unavailable because the last sync status is %s. Cached campaign data must be treated as directional.',
            coalesce(v_google_health.last_sync_status, 'unknown')
          )
        );
      elsif coalesce(v_google_health.last_sync_completed_at, v_google_health.latest_cache_update_at) is null
         or coalesce(v_google_health.last_sync_completed_at, v_google_health.latest_cache_update_at) < now() - interval '72 hours' then
        v_issues := array_append(
          v_issues,
          format(
            'Google Ads evidence is stale; the last successful sync completed %s. Cached campaign data must be treated as directional.',
            coalesce(v_google_health.last_sync_completed_at::text, v_google_health.latest_cache_update_at::text, 'at an unknown time')
          )
        );
      end if;
    end if;
  end if;

  if v_meta_relevant then
    select
      h.last_sync_status,
      h.last_sync_completed_at,
      h.latest_data_date,
      h.latest_cache_update_at
    into v_meta_health
    from public.v_meta_ads_sync_health h
    where h.organization_id = p_organization_id
    limit 1;

    if found then
      if coalesce(v_meta_health.last_sync_status, '') <> 'success' then
        v_issues := array_append(
          v_issues,
          format(
            'Meta Ads evidence is unavailable because the last sync status is %s. Cached campaign data must be treated as directional.',
            coalesce(v_meta_health.last_sync_status, 'unknown')
          )
        );
      elsif coalesce(v_meta_health.last_sync_completed_at, v_meta_health.latest_cache_update_at) is null
         or coalesce(v_meta_health.last_sync_completed_at, v_meta_health.latest_cache_update_at) < now() - interval '72 hours' then
        v_issues := array_append(
          v_issues,
          format(
            'Meta Ads evidence is stale; the last successful sync completed %s. Cached campaign data must be treated as directional.',
            coalesce(v_meta_health.last_sync_completed_at::text, v_meta_health.latest_cache_update_at::text, 'at an unknown time')
          )
        );
      end if;
    end if;
  end if;

  if cardinality(v_issues) > 0 then
    raise exception 'Paid-media evidence health gate: %', array_to_string(v_issues, ' ')
      using errcode = 'P0001';
  end if;

  return public.get_campaigns_workspace_internal_v2(
    p_organization_id,
    p_query,
    p_platform,
    p_outcome,
    p_sort,
    p_page,
    p_page_size
  );
end;
$function$;

revoke all on function public.get_campaigns_workspace(uuid,text,text,text,text,integer,integer)
  from public, anon;
grant execute on function public.get_campaigns_workspace(uuid,text,text,text,text,integer,integer)
  to authenticated, service_role;

comment on function public.get_campaigns_workspace(uuid,text,text,text,text,integer,integer) is
  'Authorized Campaigns workspace read with paid-media sync-health gating. Relevant Google/Meta evidence must have a successful sync within 72 hours; otherwise callers are forced onto the application directional fallback instead of silently treating stale cached data as current.';

commit;
