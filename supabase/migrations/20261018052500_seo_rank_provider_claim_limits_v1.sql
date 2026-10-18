-- Enforce tenant provider activation, surface controls and hourly/daily budgets
-- before a paid ranking check may be claimed.

create or replace function public.claim_due_seo_rank_targets_v2(
  p_limit integer default 20,
  p_lease_seconds integer default 180
)
returns table(
  id uuid,
  organization_id uuid,
  query text,
  surface text,
  locale text,
  country_code text,
  device text,
  engine text,
  priority smallint,
  check_interval_minutes integer,
  lease_token uuid
)
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit,20),100));
  v_lease_seconds integer := greatest(30, least(coalesce(p_lease_seconds,180),900));
begin
  if coalesce(auth.role(),'') <> 'service_role' then
    raise exception 'Service role required';
  end if;

  return query
  with eligible as (
    select t.id
    from public.seo_rank_targets t
    join public.seo_rank_provider_settings s
      on s.organization_id = t.organization_id
    where t.is_active = true
      and s.enabled = true
      and case t.surface
        when 'seo' then s.seo_enabled
        when 'aeo' then s.aeo_enabled
        when 'geo' then s.geo_enabled
        else false
      end
      and t.check_interval_minutes >= s.min_interval_minutes
      and (t.next_check_at is null or t.next_check_at <= now())
      and (t.lease_expires_at is null or t.lease_expires_at <= now())
      and (
        select count(*)
        from public.seo_rank_snapshots h
        where h.organization_id = t.organization_id
          and h.created_at >= now() - interval '1 hour'
      ) < s.max_checks_per_hour
      and (
        select count(*)
        from public.seo_rank_snapshots d
        where d.organization_id = t.organization_id
          and d.created_at >= now() - interval '24 hours'
      ) < s.max_checks_per_day
    order by t.priority desc, t.next_check_at asc nulls first, t.created_at asc
    for update of t skip locked
    limit v_limit
  ), claimed as (
    update public.seo_rank_targets t
    set lease_token = gen_random_uuid(),
        lease_expires_at = now() + make_interval(secs => v_lease_seconds),
        updated_at = now()
    from eligible e
    where t.id = e.id
    returning t.id,t.organization_id,t.query,t.surface,t.locale,t.country_code,t.device,t.engine,
              t.priority,t.check_interval_minutes,t.lease_token
  )
  select c.id,c.organization_id,c.query,c.surface,c.locale,c.country_code,c.device,c.engine,
         c.priority,c.check_interval_minutes,c.lease_token
  from claimed c;
end;
$$;

revoke all on function public.claim_due_seo_rank_targets_v2(integer,integer) from public, anon, authenticated;
grant execute on function public.claim_due_seo_rank_targets_v2(integer,integer) to service_role;
