begin;

-- Phase 7B.4: finalize one leased activation delivery after a provider adapter
-- returns. No arbitrary provider response body is persisted.
create or replace function public.finalize_ad_activation_delivery_v1(
  p_outbox_id uuid,
  p_lease_token uuid,
  p_outcome text,
  p_duration_ms integer default null,
  p_http_status integer default null,
  p_provider_request_id text default null,
  p_provider_response_code text default null,
  p_error_code text default null,
  p_error_message text default null,
  p_retry_after_seconds integer default 60
)
returns jsonb
language plpgsql
set search_path = 'public', 'pg_temp'
as $function$
declare
  v_row record;
  v_now timestamptz := clock_timestamp();
  v_final_outcome text;
  v_retry_seconds integer := greatest(5, least(coalesce(p_retry_after_seconds, 60), 86400));
  v_error_code text;
  v_error_message text;
  v_duration_ms integer;
  v_http_status integer;
  v_provider_request_id text;
  v_provider_response_code text;
begin
  if p_outcome not in ('delivered','retry','skipped','failed') then
    raise exception 'unsupported activation delivery outcome';
  end if;

  select q.*
  into v_row
  from public.ad_activation_outbox q
  where q.id = p_outbox_id
  for update;

  if not found then
    return jsonb_build_object('finalized', false, 'reason', 'delivery_not_found');
  end if;

  if v_row.status <> 'processing'
     or v_row.lease_token is distinct from p_lease_token then
    return jsonb_build_object(
      'finalized', false,
      'reason', 'lease_not_owned',
      'status', v_row.status
    );
  end if;

  v_final_outcome := case
    when p_outcome = 'retry' and v_row.attempt_count >= v_row.max_attempts then 'failed'
    else p_outcome
  end;

  v_duration_ms := case
    when p_duration_ms is null then null
    else greatest(0, least(p_duration_ms, 3600000))
  end;
  v_http_status := case
    when p_http_status between 100 and 599 then p_http_status
    else null
  end;
  v_provider_request_id := nullif(left(btrim(coalesce(p_provider_request_id, '')), 255), '');
  v_provider_response_code := nullif(left(btrim(coalesce(p_provider_response_code, '')), 120), '');
  v_error_code := nullif(left(btrim(coalesce(p_error_code, '')), 120), '');
  v_error_message := nullif(left(btrim(coalesce(p_error_message, '')), 1000), '');

  if v_error_message is not null then
    v_error_message := regexp_replace(
      v_error_message,
      '[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}',
      '[redacted-email]',
      'gi'
    );
    v_error_message := regexp_replace(
      v_error_message,
      '\+?[0-9][0-9 ()\-]{7,}[0-9]',
      '[redacted-phone]',
      'g'
    );
  end if;

  if p_outcome = 'retry' and v_final_outcome = 'failed' then
    v_error_code := coalesce(v_error_code, 'max_attempts_exhausted');
    v_error_message := coalesce(v_error_message, 'Activation delivery exhausted its retry budget.');
  end if;

  insert into public.ad_activation_attempts (
    organization_id,
    outbox_id,
    attempt_number,
    outcome,
    attempted_at,
    completed_at,
    duration_ms,
    http_status,
    provider_request_id,
    provider_response_code,
    error_code,
    error_message,
    request_metadata,
    response_metadata
  )
  values (
    v_row.organization_id,
    v_row.id,
    v_row.attempt_count,
    v_final_outcome,
    coalesce(v_row.updated_at, v_now),
    v_now,
    v_duration_ms,
    v_http_status,
    v_provider_request_id,
    v_provider_response_code,
    v_error_code,
    v_error_message,
    '{}'::jsonb,
    '{}'::jsonb
  )
  on conflict (outbox_id, attempt_number) do nothing;

  update public.ad_activation_outbox q
  set status = v_final_outcome,
      delivered_at = case when v_final_outcome = 'delivered' then v_now else q.delivered_at end,
      skipped_at = case when v_final_outcome = 'skipped' then v_now else q.skipped_at end,
      failed_at = case when v_final_outcome = 'failed' then v_now else q.failed_at end,
      next_attempt_at = case
        when v_final_outcome = 'retry' then v_now + make_interval(secs => v_retry_seconds)
        else q.next_attempt_at
      end,
      lease_token = null,
      lease_expires_at = null,
      last_error_code = case
        when v_final_outcome in ('retry','failed','skipped') then v_error_code
        else null
      end,
      last_error_message = case
        when v_final_outcome in ('retry','failed','skipped') then v_error_message
        else null
      end
  where q.id = v_row.id;

  return jsonb_build_object(
    'finalized', true,
    'outbox_id', v_row.id,
    'attempt_number', v_row.attempt_count,
    'outcome', v_final_outcome,
    'retry_after_seconds', case when v_final_outcome = 'retry' then v_retry_seconds else null end
  );
end;
$function$;

revoke all on function public.finalize_ad_activation_delivery_v1(uuid, uuid, text, integer, integer, text, text, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.finalize_ad_activation_delivery_v1(uuid, uuid, text, integer, integer, text, text, text, text, integer)
  to service_role;

comment on function public.finalize_ad_activation_delivery_v1(uuid, uuid, text, integer, integer, text, text, text, text, integer) is
'Finalizes one leased ad activation attempt, records bounded operational metadata, redacts obvious contact data from error text, and never stores arbitrary provider bodies.';

commit;
