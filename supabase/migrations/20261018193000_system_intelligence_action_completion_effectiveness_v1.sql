begin;

create or replace function public.get_system_intelligence_action_completion_effectiveness_v1()
returns table (
  signal_id text,
  role_scope text,
  category text,
  acted_count bigint,
  completed_count bigint,
  started_not_completed_count bigint,
  completion_rate numeric
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_organization_id uuid := public.current_tenant_organization_id();
begin
  if auth.uid() is null or v_organization_id is null then
    raise exception 'AUTHENTICATED_TENANT_REQUIRED';
  end if;

  if not public.session_is_bound_to_organization(v_organization_id)
     or not public.is_organization_member(v_organization_id) then
    raise exception 'TENANT_ACCESS_DENIED';
  end if;

  return query
  with grouped as (
    select
      r.signal_id,
      r.role_scope,
      r.category,
      count(*) filter (where r.acted_at is not null)::bigint as acted_count,
      count(*) filter (where r.completed_at is not null)::bigint as completed_count
    from public.system_intelligence_recommendations r
    where r.organization_id = v_organization_id
      and r.source_version = 'v2'
    group by r.signal_id, r.role_scope, r.category
  )
  select
    g.signal_id,
    g.role_scope,
    g.category,
    g.acted_count,
    g.completed_count,
    greatest(g.acted_count - g.completed_count, 0)::bigint as started_not_completed_count,
    case
      when g.acted_count = 0 then null
      else round(g.completed_count::numeric / g.acted_count::numeric, 4)
    end as completion_rate
  from grouped g
  where g.acted_count > 0
  order by
    g.completed_count desc,
    g.acted_count desc,
    g.signal_id asc;
end;
$$;

revoke all on function public.get_system_intelligence_action_completion_effectiveness_v1() from public, anon;
grant execute on function public.get_system_intelligence_action_completion_effectiveness_v1() to authenticated;

comment on function public.get_system_intelligence_action_completion_effectiveness_v1()
is 'Tenant-safe summary of recommendation actions started versus explicitly completed, grouped by signal and role. Completion measures operator-confirmed workflow follow-through only.';

commit;
