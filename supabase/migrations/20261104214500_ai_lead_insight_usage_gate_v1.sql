-- C4: server-side AI generation gating. No production tenant is opted in.
-- Never grant quota tables or the reservation RPC to browser/authenticated users.

create table if not exists public.ai_lead_insight_tenant_policies (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  enabled boolean not null default false,
  org_daily_limit integer not null default 40 check (org_daily_limit between 1 and 100),
  user_hourly_limit integer not null default 6 check (user_hourly_limit between 1 and 12),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_lead_insight_quota_counters (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_key uuid not null,
  period_kind text not null check (period_kind in ('org_day', 'user_hour')),
  period_start timestamptz not null,
  attempt_count integer not null default 1 check (attempt_count between 1 and 1000000),
  created_at timestamptz not null default now(),
  primary key (organization_id, actor_key, period_kind, period_start)
);

create index if not exists ai_lead_insight_quota_recent_idx
  on public.ai_lead_insight_quota_counters(organization_id,period_start desc);

alter table public.ai_lead_insight_tenant_policies enable row level security;
alter table public.ai_lead_insight_tenant_policies force row level security;
alter table public.ai_lead_insight_quota_counters enable row level security;
alter table public.ai_lead_insight_quota_counters force row level security;

revoke all on public.ai_lead_insight_tenant_policies from public, anon, authenticated;
revoke all on public.ai_lead_insight_quota_counters from public, anon, authenticated;
grant select, insert, update on public.ai_lead_insight_tenant_policies to service_role;
grant select, insert, update on public.ai_lead_insight_quota_counters to service_role;

create or replace function public.reserve_ai_lead_insight_generation_v1(
  p_organization_id uuid,
  p_user_id uuid,
  p_lead_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $function$
declare
  v_daily_limit integer;
  v_hourly_limit integer;
  v_day timestamptz := date_trunc('day', now() at time zone 'UTC') at time zone 'UTC';
  v_hour timestamptz := date_trunc('hour', now() at time zone 'UTC') at time zone 'UTC';
  v_count integer;
begin
  if p_organization_id is null or p_user_id is null or p_lead_id is null then
    return false;
  end if;

  -- Defense in depth: never accept a foreign lead or inactive member.
  if not exists (
    select 1 from public.leads l
    where l.id = p_lead_id and l.organization_id = p_organization_id
  ) or not exists (
    select 1 from public.organization_members om
    where om.organization_id = p_organization_id
      and om.user_id = p_user_id and om.active = true
  ) then
    return false;
  end if;

  select org_daily_limit, user_hourly_limit
    into v_daily_limit, v_hourly_limit
  from public.ai_lead_insight_tenant_policies
  where organization_id = p_organization_id and enabled = true;

  if not found then
    return false;
  end if;

  -- Atomic reservation across both counters. A failed second reservation
  -- raises, rolling back the first update in this same RPC transaction.
  insert into public.ai_lead_insight_quota_counters
    (organization_id, actor_key, period_kind, period_start, attempt_count)
  values
    (p_organization_id, '00000000-0000-0000-0000-000000000000'::uuid, 'org_day', v_day, 1)
  on conflict (organization_id, actor_key, period_kind, period_start)
  do update set attempt_count = ai_lead_insight_quota_counters.attempt_count + 1
  where ai_lead_insight_quota_counters.attempt_count < v_daily_limit
  returning attempt_count into v_count;
  if v_count is null then
    raise exception 'AI generation quota exceeded' using errcode = 'P0001';
  end if;

  v_count := null;
  insert into public.ai_lead_insight_quota_counters
    (organization_id, actor_key, period_kind, period_start, attempt_count)
  values
    (p_organization_id, p_user_id, 'user_hour', v_hour, 1)
  on conflict (organization_id, actor_key, period_kind, period_start)
  do update set attempt_count = ai_lead_insight_quota_counters.attempt_count + 1
  where ai_lead_insight_quota_counters.attempt_count < v_hourly_limit
  returning attempt_count into v_count;
  if v_count is null then
    raise exception 'AI generation quota exceeded' using errcode = 'P0001';
  end if;

  return true;
end;
$function$;

revoke all on function public.reserve_ai_lead_insight_generation_v1(uuid,uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.reserve_ai_lead_insight_generation_v1(uuid,uuid,uuid)
  to service_role;

comment on table public.ai_lead_insight_tenant_policies is
  'C4 server-controlled tenant opt-in. Defaults disabled; no self-service grant.';
comment on table public.ai_lead_insight_quota_counters is
  'C4 atomic AI request reservations; counts attempted requests including provider errors.';
