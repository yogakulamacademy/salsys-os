begin;

-- Phase 7B.3: claim provider-neutral activation deliveries and revalidate the
-- canonical membership/privacy state immediately before any provider call.

create or replace function public.claim_ad_activation_deliveries_v1(
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
  v_limit integer := greatest(1, least(coalesce(p_limit, 25), 100));
  v_lease_seconds integer := greatest(30, least(coalesce(p_lease_seconds, 120), 600));
begin
  -- Expired processing leases become retryable. No provider success is inferred.
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

  -- Permanently stop rows that exhausted retries.
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
    where q.status in ('queued','retry')
      and q.next_attempt_at <= v_now
      and q.attempt_count < q.max_attempts
      and d.status = 'active'
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

create or replace function public.validate_ad_activation_delivery_v1(
  p_outbox_id uuid,
  p_lease_token uuid
)
returns jsonb
language plpgsql
set search_path = 'public', 'pg_temp'
as $function$
declare
  v_row record;
  v_privacy jsonb;
  v_privacy_eligible boolean := false;
  v_valid boolean := false;
  v_reason text := 'unknown';
  v_now timestamptz := clock_timestamp();
begin
  select
    q.*,
    d.status as destination_status,
    m.status as membership_status,
    m.qualified_at as membership_qualified_at,
    m.removed_at as membership_removed_at
  into v_row
  from public.ad_activation_outbox q
  join public.ad_audience_destinations d
    on d.id = q.destination_id
   and d.organization_id = q.organization_id
  left join public.ad_audience_memberships m
    on m.id = q.membership_id
   and m.organization_id = q.organization_id
   and m.person_id = q.person_id
   and m.audience_id = q.audience_id
  where q.id = p_outbox_id
  for update of q;

  if not found then
    return jsonb_build_object('valid', false, 'reason', 'delivery_not_found');
  end if;

  if v_row.status <> 'processing'
     or v_row.lease_token is distinct from p_lease_token then
    return jsonb_build_object('valid', false, 'reason', 'lease_not_owned');
  end if;

  if v_row.lease_expires_at is null or v_row.lease_expires_at <= v_now then
    update public.ad_activation_outbox
    set status = 'retry',
        lease_token = null,
        lease_expires_at = null,
        next_attempt_at = v_now,
        last_error_code = 'lease_expired_before_send',
        last_error_message = 'Delivery lease expired before provider send validation.'
    where id = p_outbox_id;

    return jsonb_build_object('valid', false, 'reason', 'lease_expired');
  end if;

  if v_row.destination_status <> 'active' then
    v_reason := 'destination_inactive';
  elsif v_row.membership_id is null or v_row.membership_status is null then
    v_reason := 'membership_missing';
  elsif v_row.action = 'add' and v_row.membership_status <> 'active' then
    v_reason := 'membership_no_longer_active';
  elsif v_row.action = 'remove' and v_row.membership_status <> 'removed' then
    v_reason := 'membership_no_longer_removed';
  else
    v_privacy := public.resolve_ad_activation_privacy_v1(
      v_row.organization_id,
      v_row.person_id,
      v_row.lead_id
    );
    v_privacy_eligible := coalesce((v_privacy ->> 'eligible')::boolean, false);

    if v_row.action = 'add' and not v_privacy_eligible then
      v_reason := 'privacy_no_longer_eligible';
    elsif v_row.action = 'remove' then
      -- Removing a previously exported member is privacy protective and remains
      -- valid after consent withdrawal or an export restriction is activated.
      v_valid := true;
      v_reason := 'remove_current';
    else
      v_valid := true;
      v_reason := 'add_current';
    end if;
  end if;

  if not v_valid then
    update public.ad_activation_outbox
    set status = 'skipped',
        skipped_at = v_now,
        lease_token = null,
        lease_expires_at = null,
        last_error_code = 'pre_send_invalid',
        last_error_message = v_reason
    where id = p_outbox_id;
  end if;

  return jsonb_build_object(
    'valid', v_valid,
    'reason', v_reason,
    'action', v_row.action,
    'organization_id', v_row.organization_id,
    'destination_id', v_row.destination_id,
    'audience_id', v_row.audience_id,
    'person_id', v_row.person_id,
    'lead_id', v_row.lead_id,
    'membership_id', v_row.membership_id,
    'privacy', coalesce(v_privacy, '{}'::jsonb),
    'lease_expires_at', v_row.lease_expires_at
  );
end;
$function$;

revoke all on function public.claim_ad_activation_deliveries_v1(integer, integer)
  from public, anon, authenticated;
grant execute on function public.claim_ad_activation_deliveries_v1(integer, integer)
  to service_role;

revoke all on function public.validate_ad_activation_delivery_v1(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.validate_ad_activation_delivery_v1(uuid, uuid)
  to service_role;

comment on function public.claim_ad_activation_deliveries_v1(integer, integer) is
'Claims provider-neutral activation work with bounded leases and SKIP LOCKED. Performs no external provider calls.';
comment on function public.validate_ad_activation_delivery_v1(uuid, uuid) is
'Revalidates destination, membership state, lease ownership and privacy immediately before provider delivery. Remove actions remain valid after consent withdrawal.';

commit;
