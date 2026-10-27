-- Once an Instagram provider event is durable in raw_events, derived CRM
-- projection failures must not cause Meta to redeliver the entire webhook
-- envelope indefinitely. Preserve failed processing state and recover it through
-- a bounded internal service-role retry worker instead.

create or replace function public.ingest_instagram_dm_event(
  p_raw_event_id uuid,
  p_sender_username text default null,
  p_message_type text default 'text',
  p_body text default null,
  p_message_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_event public.raw_events%rowtype;
  v_has_supported_payload boolean := false;
  v_result jsonb;
begin
  select * into v_event
  from public.raw_events
  where id = p_raw_event_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Instagram raw event not found', 'raw_event_id', p_raw_event_id);
  end if;

  if v_event.source_system <> 'instagram' then
    return jsonb_build_object('ok', false, 'error', 'Raw event is not an Instagram event', 'raw_event_id', p_raw_event_id, 'source_system', v_event.source_system);
  end if;

  v_has_supported_payload :=
    coalesce(v_event.payload ? 'message', false)
    or coalesce(v_event.payload ? 'postback', false)
    or coalesce(v_event.payload ? 'referral', false);

  if not v_has_supported_payload then
    perform public.set_raw_event_processing_status(
      v_event.organization_id, 'instagram', v_event.source_event_id,
      'processed', 'instagram_dm_ingestion_guard_v1', 'guard-v1', null,
      jsonb_build_object('raw_event_id', p_raw_event_id, 'ignored', true, 'reason', 'non_message_messaging_envelope')
    );

    return jsonb_build_object(
      'ok', true, 'processed', false, 'ignored', true,
      'reason', 'non_message_messaging_envelope',
      'raw_event_id', p_raw_event_id,
      'organization_id', v_event.organization_id
    );
  end if;

  v_result := public.ingest_instagram_dm_event_core_v1(
    p_raw_event_id, p_sender_username, p_message_type, p_body, p_message_at
  );

  if coalesce((v_result ->> 'ok')::boolean, false) then
    return v_result;
  end if;

  return jsonb_build_object(
    'ok', true,
    'processed', false,
    'deferred', true,
    'reason', 'crm_processing_deferred',
    'raw_event_id', p_raw_event_id,
    'organization_id', v_event.organization_id
  );
end;
$function$;

revoke all on function public.ingest_instagram_dm_event(uuid,text,text,text,timestamptz)
from public, anon, authenticated;
grant execute on function public.ingest_instagram_dm_event(uuid,text,text,text,timestamptz)
to service_role;

create or replace function public.retry_instagram_dm_events_v1(p_limit integer default 10)
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
  v_failed integer := 0;
  v_remaining integer := 0;
  v_old_claims text := current_setting('request.jwt.claims', true);
begin
  p_limit := least(greatest(coalesce(p_limit, 10), 1), 50);
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);

  for r in
    select
      re.id,
      re.source_event_type,
      re.occurred_at,
      coalesce(
        nullif(re.payload #>> '{message,text}', ''),
        nullif(re.payload #>> '{postback,payload}', ''),
        nullif(re.payload #>> '{referral,ref}', '')
      ) as body
    from public.raw_events re
    join public.raw_event_processing rep
      on rep.raw_event_id = re.id
     and rep.organization_id = re.organization_id
    where re.source_system = 'instagram'
      and rep.status in ('received','failed')
      and (
        coalesce(re.payload ? 'message', false)
        or coalesce(re.payload ? 'postback', false)
        or coalesce(re.payload ? 'referral', false)
      )
    order by re.received_at asc, re.id asc
    limit p_limit
    for update of rep skip locked
  loop
    v_attempted := v_attempted + 1;
    begin
      v_result := public.ingest_instagram_dm_event_core_v1(
        r.id,
        null,
        coalesce(nullif(split_part(r.source_event_type, ':', 2), ''), 'unknown'),
        r.body,
        r.occurred_at
      );

      if coalesce((v_result ->> 'ok')::boolean, false) then
        v_processed := v_processed + 1;
      else
        v_failed := v_failed + 1;
      end if;
    exception
      when others then
        v_failed := v_failed + 1;
    end;
  end loop;

  if v_old_claims is null then
    perform set_config('request.jwt.claims', '', true);
  else
    perform set_config('request.jwt.claims', v_old_claims, true);
  end if;

  select count(*)::integer into v_remaining
  from public.raw_event_processing rep
  join public.raw_events re
    on re.id = rep.raw_event_id
   and re.organization_id = rep.organization_id
  where re.source_system = 'instagram'
    and rep.status in ('received','failed')
    and (
      coalesce(re.payload ? 'message', false)
      or coalesce(re.payload ? 'postback', false)
      or coalesce(re.payload ? 'referral', false)
    );

  return jsonb_build_object(
    'ok', true,
    'attempted', v_attempted,
    'processed', v_processed,
    'failed', v_failed,
    'remaining', v_remaining
  );
exception
  when others then
    if v_old_claims is null then
      perform set_config('request.jwt.claims', '', true);
    else
      perform set_config('request.jwt.claims', v_old_claims, true);
    end if;
    raise;
end;
$function$;

revoke all on function public.retry_instagram_dm_events_v1(integer)
from public, anon, authenticated;
grant execute on function public.retry_instagram_dm_events_v1(integer)
to service_role;
