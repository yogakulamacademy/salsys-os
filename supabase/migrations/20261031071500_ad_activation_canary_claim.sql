begin;

-- Phase 7D.4: one-person / one-destination canary claim boundary.
-- The initial live phase must not be capable of draining a broad audience.

create or replace function public.claim_ad_activation_canary_delivery_v1(
  p_provider text,
  p_destination_id uuid,
  p_person_id uuid,
  p_lease_seconds integer default 300
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
  v_lease_seconds integer := greatest(60, least(coalesce(p_lease_seconds, 300), 600));
begin
  if v_provider not in ('meta','google') then
    raise exception 'Unsupported ad activation provider: %', v_provider
      using errcode = '22023';
  end if;

  if p_destination_id is null or p_person_id is null then
    raise exception 'Canary destination and person are required'
      using errcode = '22023';
  end if;

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
      and q.destination_id = p_destination_id
      and q.person_id = p_person_id
      and d.status = 'active'
      and ic.status = 'connected'
      and ic.provider = v_provider
    order by q.next_attempt_at asc, q.created_at asc, q.id asc
    for update of q skip locked
    limit 1
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

revoke all on function public.claim_ad_activation_canary_delivery_v1(text, uuid, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.claim_ad_activation_canary_delivery_v1(text, uuid, uuid, integer)
  to service_role;

comment on function public.claim_ad_activation_canary_delivery_v1(text, uuid, uuid, integer) is
'Claims at most one activation delivery for an explicitly configured provider, destination and person. Intended only for controlled first-live canary validation.';

commit;
