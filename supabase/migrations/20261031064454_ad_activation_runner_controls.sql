begin;

-- Phase 7D.3: provider-level execution lease + bounded operational telemetry.
-- This prevents overlapping workers for the same provider and records only
-- aggregate delivery counts / safe status codes.

create table if not exists public.ad_activation_runner_state (
  provider text primary key,
  lease_token uuid,
  lease_expires_at timestamptz,
  last_started_at timestamptz,
  last_completed_at timestamptz,
  last_status text,
  last_claimed integer not null default 0,
  last_delivered integer not null default 0,
  last_retry integer not null default 0,
  last_skipped integer not null default 0,
  last_failed integer not null default 0,
  last_lease_lost integer not null default 0,
  last_error_code text,
  updated_at timestamptz not null default now(),
  constraint ad_activation_runner_state_provider_check check (provider in ('meta','google')),
  constraint ad_activation_runner_state_status_check check (
    last_status is null or last_status in ('running','completed','disabled','failed')
  )
);

create or replace function public.acquire_ad_activation_runner_lease_v1(
  p_provider text,
  p_lease_seconds integer default 300
)
returns jsonb
language plpgsql
set search_path = 'public', 'pg_temp'
as $function$
declare
  v_provider text := lower(btrim(coalesce(p_provider, '')));
  v_now timestamptz := clock_timestamp();
  v_seconds integer := greatest(60, least(coalesce(p_lease_seconds, 300), 900));
  v_token uuid := gen_random_uuid();
  v_row public.ad_activation_runner_state%rowtype;
begin
  if v_provider not in ('meta','google') then
    raise exception 'Unsupported ad activation provider: %', v_provider
      using errcode = '22023';
  end if;

  insert into public.ad_activation_runner_state(provider)
  values (v_provider)
  on conflict (provider) do nothing;

  select *
  into v_row
  from public.ad_activation_runner_state
  where provider = v_provider
  for update;

  if v_row.lease_expires_at is not null and v_row.lease_expires_at > v_now then
    return jsonb_build_object(
      'acquired', false,
      'provider', v_provider,
      'reason', 'runner_already_active',
      'lease_expires_at', v_row.lease_expires_at
    );
  end if;

  update public.ad_activation_runner_state
  set lease_token = v_token,
      lease_expires_at = v_now + make_interval(secs => v_seconds),
      last_started_at = v_now,
      last_status = 'running',
      last_error_code = null,
      updated_at = v_now
  where provider = v_provider;

  return jsonb_build_object(
    'acquired', true,
    'provider', v_provider,
    'lease_token', v_token,
    'lease_expires_at', v_now + make_interval(secs => v_seconds)
  );
end;
$function$;

create or replace function public.release_ad_activation_runner_lease_v1(
  p_provider text,
  p_lease_token uuid,
  p_status text,
  p_claimed integer default 0,
  p_delivered integer default 0,
  p_retry integer default 0,
  p_skipped integer default 0,
  p_failed integer default 0,
  p_lease_lost integer default 0,
  p_error_code text default null
)
returns jsonb
language plpgsql
set search_path = 'public', 'pg_temp'
as $function$
declare
  v_provider text := lower(btrim(coalesce(p_provider, '')));
  v_status text := lower(btrim(coalesce(p_status, '')));
  v_now timestamptz := clock_timestamp();
begin
  if v_status not in ('completed','disabled','failed') then
    raise exception 'Unsupported runner status: %', v_status
      using errcode = '22023';
  end if;

  update public.ad_activation_runner_state
  set lease_token = null,
      lease_expires_at = null,
      last_completed_at = v_now,
      last_status = v_status,
      last_claimed = greatest(0, coalesce(p_claimed, 0)),
      last_delivered = greatest(0, coalesce(p_delivered, 0)),
      last_retry = greatest(0, coalesce(p_retry, 0)),
      last_skipped = greatest(0, coalesce(p_skipped, 0)),
      last_failed = greatest(0, coalesce(p_failed, 0)),
      last_lease_lost = greatest(0, coalesce(p_lease_lost, 0)),
      last_error_code = nullif(left(btrim(coalesce(p_error_code, '')), 120), ''),
      updated_at = v_now
  where provider = v_provider
    and lease_token = p_lease_token;

  if not found then
    return jsonb_build_object('released', false, 'reason', 'runner_lease_not_owned');
  end if;

  return jsonb_build_object('released', true, 'provider', v_provider, 'status', v_status);
end;
$function$;

revoke all on public.ad_activation_runner_state from public, anon, authenticated;
grant select, insert, update on public.ad_activation_runner_state to service_role;

revoke all on function public.acquire_ad_activation_runner_lease_v1(text, integer)
  from public, anon, authenticated;
grant execute on function public.acquire_ad_activation_runner_lease_v1(text, integer)
  to service_role;

revoke all on function public.release_ad_activation_runner_lease_v1(text, uuid, text, integer, integer, integer, integer, integer, integer, text)
  from public, anon, authenticated;
grant execute on function public.release_ad_activation_runner_lease_v1(text, uuid, text, integer, integer, integer, integer, integer, integer, text)
  to service_role;

create or replace view public.v_ad_activation_runner_health_v1
with (security_invoker = true)
as
select
  s.provider,
  s.last_started_at,
  s.last_completed_at,
  s.last_status,
  s.last_claimed,
  s.last_delivered,
  s.last_retry,
  s.last_skipped,
  s.last_failed,
  s.last_lease_lost,
  s.last_error_code,
  s.lease_expires_at,
  (s.lease_expires_at is not null and s.lease_expires_at > now()) as runner_active,
  now() as checked_at
from public.ad_activation_runner_state s;

revoke all on public.v_ad_activation_runner_health_v1 from public, anon, authenticated;
grant select on public.v_ad_activation_runner_health_v1 to authenticated, service_role;

comment on table public.ad_activation_runner_state is
'Provider-level runner lease and aggregate operational telemetry only. Never stores contact identifiers, provider payloads, access tokens, CRM notes, messages, health data, payment data, or provider response bodies.';

commit;
