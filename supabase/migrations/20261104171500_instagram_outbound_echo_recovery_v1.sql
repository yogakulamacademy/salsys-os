-- Retry provider-signed Instagram outbound echoes deferred until a CRM thread exists.
-- The inbound Instagram retry worker intentionally ignores nested outbound_echo payloads.
-- This queue is separate, bounded, idempotent, and service-role only.

create or replace function public.retry_instagram_outbound_echoes_v1(
  p_limit integer default 10
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $function$
declare
  r record;
  v_result jsonb;
  v_attempted integer := 0;
  v_processed integer := 0;
  v_duplicates integer := 0;
  v_deferred integer := 0;
  v_failed integer := 0;
  v_expired integer := 0;
  v_remaining integer := 0;
  v_old_claims text := current_setting('request.jwt.claims', true);
begin
  -- Invokable only by service_role (or the trusted pg_cron job owner).
  -- Never expose this function to anon/authenticated REST callers.
  p_limit := least(greatest(coalesce(p_limit, 10), 1), 25);
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);

  for r in
    select re.id, re.organization_id, re.source_event_id, re.received_at
    from public.raw_events re
    join public.raw_event_processing rep
      on rep.raw_event_id = re.id
     and rep.organization_id = re.organization_id
    where re.source_system = 'instagram'
      and re.source_event_type like 'outbound_echo:%'
      and re.payload ? 'outbound_echo'
      and rep.status in ('received', 'failed')
      and (rep.next_retry_at is null or rep.next_retry_at <= now())
      and (
        rep.last_attempt_at is null
        or rep.last_attempt_at <= now() - interval '5 minutes'
      )
    order by coalesce(rep.last_attempt_at, re.received_at) asc, re.id asc
    limit p_limit
    -- Lock in the same order as the webhook projector: raw event first,
    -- then the processing-state row. This avoids inverted-lock deadlocks.
    for update of re skip locked
  loop
    v_attempted := v_attempted + 1;

    begin
      if r.received_at < now() - interval '30 days' then
        perform public.set_raw_event_processing_status(
          r.organization_id, 'instagram', r.source_event_id,
          'dead_letter', 'instagram_outbound_echo_retry_v1', 'v1',
          'Outbound echo could not be matched within 30 days',
          jsonb_build_object('outbound_echo_retry', true, 'expired', true)
        );
        v_expired := v_expired + 1;
        continue;
      end if;

      v_result := public.ingest_instagram_outbound_echo_v1(r.id);

      if coalesce((v_result ->> 'ok')::boolean, false) then
        if coalesce((v_result ->> 'processed')::boolean, false) then
          v_processed := v_processed + 1;
        elsif coalesce((v_result ->> 'duplicate_message')::boolean, false) then
          v_duplicates := v_duplicates + 1;
        elsif coalesce((v_result ->> 'deferred')::boolean, false) then
          v_deferred := v_deferred + 1;
        end if;
      else
        -- The raw evidence remains immutable. Retry later in case account
        -- authorization or a conflicting conversation is reconciled.
        perform public.set_raw_event_processing_status(
          r.organization_id, 'instagram', r.source_event_id,
          'failed', 'instagram_outbound_echo_retry_v1', 'v1',
          left(coalesce(v_result ->> 'error', 'Outbound echo projection rejected'), 500),
          jsonb_build_object('outbound_echo_retry', true)
        );
        v_failed := v_failed + 1;
      end if;
    exception when others then
      -- Isolate corrupt/problematic events so one echo never blocks others.
      -- Failure details are limited to error text; never log DM bodies.
      begin
        perform public.set_raw_event_processing_status(
          r.organization_id, 'instagram', r.source_event_id,
          'failed', 'instagram_outbound_echo_retry_v1', 'v1',
          left(SQLERRM, 500),
          jsonb_build_object('outbound_echo_retry', true)
        );
      exception when others then
        null;
      end;
      v_failed := v_failed + 1;
    end;
  end loop;

  if v_old_claims is null then
    perform set_config('request.jwt.claims', '', true);
  else
    perform set_config('request.jwt.claims', v_old_claims, true);
  end if;

  select count(*)::integer into v_remaining
  from public.raw_events re
  join public.raw_event_processing rep
    on rep.raw_event_id = re.id
   and rep.organization_id = re.organization_id
  where re.source_system = 'instagram'
    and re.source_event_type like 'outbound_echo:%'
    and rep.status in ('received', 'failed');

  return jsonb_build_object(
    'ok', true,
    'attempted', v_attempted,
    'processed', v_processed,
    'duplicates', v_duplicates,
    'deferred', v_deferred,
    'failed', v_failed,
    'expired', v_expired,
    'remaining', v_remaining
  );
exception when others then
  if v_old_claims is null then
    perform set_config('request.jwt.claims', '', true);
  else
    perform set_config('request.jwt.claims', v_old_claims, true);
  end if;
  raise;
end;
$function$;

revoke all on function public.retry_instagram_outbound_echoes_v1(integer)
  from public, anon, authenticated;
grant execute on function public.retry_instagram_outbound_echoes_v1(integer)
  to service_role;

do $schedule$
begin
  if not exists (
    select 1 from cron.job
    where jobname = 'instagram-outbound-echo-retry-v1'
  ) then
    perform cron.schedule(
      'instagram-outbound-echo-retry-v1',
      '*/2 * * * *',
      'select public.retry_instagram_outbound_echoes_v1(10);'
    );
  end if;
end;
$schedule$;
