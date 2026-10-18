-- Lease-safe ranking worker claims v1
-- Prevents duplicate paid ranking checks when workers overlap or retry.

alter table public.seo_rank_targets
  add column if not exists lease_token uuid,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists failure_count integer not null default 0,
  add column if not exists last_error_category text,
  add column if not exists last_error_at timestamptz;

create index if not exists idx_seo_rank_targets_worker_due_v1
  on public.seo_rank_targets (is_active, next_check_at, priority desc, lease_expires_at);

create or replace function public.claim_due_seo_rank_targets_v1(
  p_limit integer default 20,
  p_lease_seconds integer default 180
)
returns table(
  id uuid,
  organization_id uuid,
  priority smallint,
  next_check_at timestamptz,
  lease_token uuid,
  lease_expires_at timestamptz
)
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'Service role required'; end if;

  return query
  with due as (
    select t.id
    from public.seo_rank_targets t
    where t.is_active = true
      and (t.next_check_at is null or t.next_check_at <= now())
      and (t.lease_expires_at is null or t.lease_expires_at <= now())
    order by t.priority desc, t.next_check_at asc nulls first, t.created_at asc
    for update skip locked
    limit greatest(1, least(coalesce(p_limit,20),50))
  ), claimed as (
    update public.seo_rank_targets t
    set lease_token = gen_random_uuid(),
        lease_expires_at = now() + make_interval(secs => greatest(30, least(coalesce(p_lease_seconds,180),600))),
        updated_at = now()
    from due
    where t.id = due.id
    returning t.id, t.organization_id, t.priority, t.next_check_at, t.lease_token, t.lease_expires_at
  )
  select c.id, c.organization_id, c.priority, c.next_check_at, c.lease_token, c.lease_expires_at
  from claimed c;
end;
$$;

create or replace function public.complete_seo_rank_target_check_v1(
  p_target_id uuid,
  p_lease_token uuid,
  p_success boolean,
  p_error_category text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_target public.seo_rank_targets;
  v_failures integer;
  v_retry_minutes integer;
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'Service role required'; end if;

  select * into v_target
  from public.seo_rank_targets
  where id = p_target_id
    and lease_token = p_lease_token
  for update;
  if not found then return false; end if;

  if p_success then
    update public.seo_rank_targets
    set lease_token = null,
        lease_expires_at = null,
        failure_count = 0,
        last_error_category = null,
        last_error_at = null,
        last_checked_at = coalesce(last_checked_at, now()),
        next_check_at = greatest(
          coalesce(next_check_at, now()),
          now() + make_interval(mins => check_interval_minutes)
        ),
        updated_at = now()
    where id = p_target_id and lease_token = p_lease_token;
  else
    v_failures := least(coalesce(v_target.failure_count,0) + 1, 20);
    v_retry_minutes := least(360, 15 * (2 ^ least(v_failures - 1, 5))::integer);
    update public.seo_rank_targets
    set lease_token = null,
        lease_expires_at = null,
        failure_count = v_failures,
        last_error_category = left(coalesce(nullif(btrim(p_error_category),''),'rank_check_failed'),120),
        last_error_at = now(),
        next_check_at = now() + make_interval(mins => v_retry_minutes),
        updated_at = now()
    where id = p_target_id and lease_token = p_lease_token;
  end if;

  return true;
end;
$$;

revoke all on function public.claim_due_seo_rank_targets_v1(integer,integer) from public, anon, authenticated;
revoke all on function public.complete_seo_rank_target_check_v1(uuid,uuid,boolean,text) from public, anon, authenticated;
grant execute on function public.claim_due_seo_rank_targets_v1(integer,integer) to service_role;
grant execute on function public.complete_seo_rank_target_check_v1(uuid,uuid,boolean,text) to service_role;
