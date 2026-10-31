begin;

-- Phase 7D.2: provider-scoped claiming + bounded lease renewal for live runners.
-- Keep v1 intact for backwards compatibility; live runners must use v2 so a
-- Meta-only worker cannot accidentally lease/finalize Google Customer Match jobs.

create or replace function public.claim_ad_activation_deliveries_v2(
  p_provider text,
  p_limit integer default 25,
  p_lease_seconds integer default 120
)
returns table (
  outbox_id uuid,
  lease_token uuid,
  organization_id uuid,
  destination_id uuid,
  audience_id uuid,
  person_id uuid,
  lead_id uuid,
  membership_id uuid,
  action text,
  safe_metadata jsonb,
  attempt_number integer
)
language plpgsql
set search_path = 'public', 'pg_temp'
as $function$
declare
  v_now timestamptz := clock_timestamp();
  v_provider text := lower(btrim(coalesce(p_provider, '')));
  v_limit integer := greatest(1, least(coalesce(p_limit, 25), 100));
  v_lease_seconds integer := greatest(30, least(coalesce(p_lease_seconds, 120), 600));
begin
  if v_provider not in ('meta', 'google') then
    raise exception 'Unsupported ad activation provider: %', v_provider
      using errcode = '22023';
  end if;

  -- Recover expired leases globally. This is provider-neutral queue hygiene and
  -- does not imply provider delivery success.
  update public.ad_activation_outbox q
  set status = 'retry',
      lease_token = null,
      lease_expires_at = null,
      next_attempt_at = v_now,
      last_error_code = 'lease_expired',
      last_error_message = 'Activation delivery lease expired before completion.'
  where q.status = 'processing'
    and q.lease_expires_at is not null
    and q.lease_expires_at <= v_now
    and q.attempt_count < q.max_attempts;

  update public.ad_activation_outbox q
  set status = 'failed',
      failed_at = coalesce(q.failed_at, v_now),
      lease_token = null,
      lease_expires_at = null,
      last_error_code = coalesce(q.last_error_code, 'max_attempts_exhausted'),
      last_error_message = coalesce(q.last_error_message, 'Activation delivery exhausted its retry budget.')
  where q.status in ('queued','retry','processing')
    and q.attempt_count >= q.max_attempts;

  return query
  with claimable as (
    select q.id
    from public.ad_activation_outbox q
    join public.ad_audience_destinations d
      on d.id = q.destination_id
     and d.organization_id = q.organization_id
    join public.integration_connections ic
      on ic.id = d.connection_id
     and ic.organization_id = q.organization_id
    where q.status in ('queued','retry')
      and q.next_attempt_at <= v_now
      and q.attempt_count < q.max_attempts
      and d.status = 'active'
      and ic.status = 'connected'
      and ic.provider = v_provider
    order by q.next_attempt_at asc, q.created_at asc, q.id asc
    for update of q skip locked
    limit v_limit
  ), claimed as (
    update public.ad_activation_outbox q
    set status = 'processing',
        attempt_count = q.attempt_count + 1,
        lease_token = gen_random_uuid(),
        lease_expires_at = v_now + make_interval(secs => v_lease_seconds),
        last_error_code = null,
        last_error_message = null
    from claimable c
    where q.id = c.id
    returning q.*
  )
  select
    c.id,
    c.lease_token,
    c.organization_id,
    c.destination_id,
    c.audience_id,
    c.person_id,
    c.lead_id,
    c.membership_id,
    c.action,
    c.safe_metadata,
    c.attempt_count
  from claimed c
  order by c.created_at asc, c.id asc;
end;
$function$;

create or replace function public.renew_ad_activation_delivery_lease_v1(
  p_outbox_id uuid,
  p_lease_token uuid,
  p_lease_seconds integer default 120
)
returns jsonb
language plpgsql
set search_path = 'public', 'pg_temp'
as $function$
declare
  v_now timestamptz := clock_timestamp();
  v_lease_seconds integer := greatest(30, least(coalesce(p_lease_seconds, 120), 600));
  v_expires_at timestamptz;
begin
  update public.ad_activation_outbox q
  set lease_expires_at = v_now + make_interval(secs => v_lease_seconds)
  where q.id = p_outbox_id
    and q.status = 'processing'
    and q.lease_token = p_lease_token
    and q.lease_expires_at is not null
    and q.lease_expires_at > v_now
  returning q.lease_expires_at
  into v_expires_at;

  if v_expires_at is null then
    return jsonb_build_object(
      'renewed', false,
      'reason', 'lease_not_owned_or_expired'
    );
  end if;

  return jsonb_build_object(
    'renewed', true,
    'lease_expires_at', v_expires_at
  );
end;
$function$;

revoke all on function public.claim_ad_activation_deliveries_v2(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.claim_ad_activation_deliveries_v2(text, integer, integer)
  to service_role;

revoke all on function public.renew_ad_activation_delivery_lease_v1(uuid, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.renew_ad_activation_delivery_lease_v1(uuid, uuid, integer)
  to service_role;

comment on function public.claim_ad_activation_deliveries_v2(text, integer, integer) is
'Claims ad activation queue work only for the explicitly requested connected provider. Prevents a provider-specific runner from consuming another provider''s jobs.';

comment on function public.renew_ad_activation_delivery_lease_v1(uuid, uuid, integer) is
'Renews an unexpired activation processing lease only for the current lease owner. Performs no provider action and does not bypass pre-send validation.';

commit;
