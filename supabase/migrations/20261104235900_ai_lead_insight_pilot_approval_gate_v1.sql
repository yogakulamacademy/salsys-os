-- Phase C5d. Deliberately default-deny release-governance gate.
-- This migration records ZERO approvals and enables ZERO AI tenants.
-- Only an audited, separately authorized administrative workflow may
-- submit a real approval record after privacy/compliance review.
create table if not exists public.ai_lead_insight_pilot_approvals (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  policy_version text not null default 'lead_insight_pilot_v1'
    check (policy_version = 'lead_insight_pilot_v1'),
  privacy_approved_at timestamptz,
  retention_approved_at timestamptz,
  provider_budget_verified_at timestamptz,
  quality_review_approved_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
  approval_reference text
    check (approval_reference is null or length(btrim(approval_reference)) between 8 and 2000),
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ai_lead_insight_pilot_approvals enable row level security;
alter table public.ai_lead_insight_pilot_approvals force row level security;
revoke all on public.ai_lead_insight_pilot_approvals from public, anon, authenticated;
grant select, insert, update on public.ai_lead_insight_pilot_approvals to service_role;

comment on table public.ai_lead_insight_pilot_approvals is
  'Explicit human release approvals for staff AI insights. An absent, partial, revoked, expired or wrong-version record denies generation. No client writes or default approvals.';

-- Preserve all C4 quota logic. Add mandatory pre-reservation approval check.
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

  -- C5d: require a current, explicit, attributable release record.
  -- No row exists by default. This check runs INSIDE the same transaction
  -- that reserves quota and cannot be bypassed by a client-side toggle.
  if not exists (
    select 1 from public.ai_lead_insight_pilot_approvals a
    where a.organization_id = p_organization_id
      and a.policy_version = 'lead_insight_pilot_v1'
      and a.privacy_approved_at is not null
      and a.privacy_approved_at <= now()
      and a.retention_approved_at is not null
      and a.retention_approved_at <= now()
      and a.provider_budget_verified_at is not null
      and a.provider_budget_verified_at <= now()
      and a.quality_review_approved_at is not null
      and a.quality_review_approved_at <= now()
      and a.approved_by is not null
      and a.approval_reference is not null
      and length(btrim(a.approval_reference)) >= 8
      and a.expires_at > now()
      and a.revoked_at is null
  ) then
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
