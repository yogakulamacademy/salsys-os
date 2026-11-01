-- Integrations final closeout
-- 1) Make local disconnect/removal state transitions atomic.
-- 2) Preserve provider-side truth: only Google attempts token revocation in the
--    generic disconnect flow; Meta/Instagram are local disconnects.
-- 3) Correct legacy Meta/Instagram audit evidence without deleting history.

create or replace function public.finalize_integration_disconnect_v1(
  p_organization_id uuid,
  p_connection_id uuid,
  p_actor_user_id uuid,
  p_provider_revocation_status text,
  p_provider_revocation_error text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $function$
declare
  v_connection public.integration_connections%rowtype;
  v_status text := lower(btrim(coalesce(p_provider_revocation_status, '')));
  v_confirmed jsonb;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required';
  end if;

  if p_organization_id is null or p_connection_id is null or p_actor_user_id is null then
    raise exception 'Organization, connection and actor are required';
  end if;

  if not exists (
    select 1
    from public.organization_members om
    where om.organization_id = p_organization_id
      and om.user_id = p_actor_user_id
      and om.active = true
      and om.role in ('owner', 'admin')
  ) then
    raise exception 'Only organization owners/admins can manage integrations';
  end if;

  if v_status not in ('confirmed', 'failed', 'not_attempted') then
    raise exception 'Provider revocation status is invalid';
  end if;

  select *
  into v_connection
  from public.integration_connections c
  where c.id = p_connection_id
    and c.organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'Connection not found';
  end if;

  if v_connection.provider not in ('google', 'meta', 'instagram') then
    raise exception 'This provider is not managed by the generic integration disconnect flow';
  end if;

  if v_connection.provider <> 'google' and v_status <> 'not_attempted' then
    raise exception 'Provider-side revocation is not performed for this provider';
  end if;

  update public.integration_connections
  set status = 'disconnected',
      access_token_ciphertext = null,
      refresh_token_ciphertext = null,
      token_expires_at = null,
      last_error = case
        when v_status = 'failed' then nullif(left(coalesce(p_provider_revocation_error, ''), 1000), '')
        else null
      end
  where id = p_connection_id
    and organization_id = p_organization_id;

  delete from public.integration_assets
  where organization_id = p_organization_id
    and connection_id = p_connection_id;

  v_confirmed := case
    when v_status = 'confirmed' then 'true'::jsonb
    when v_status = 'failed' then 'false'::jsonb
    else 'null'::jsonb
  end;

  insert into public.integration_audit_log (
    organization_id,
    connection_id,
    provider,
    event_type,
    actor_user_id,
    detail
  )
  values (
    p_organization_id,
    p_connection_id,
    v_connection.provider,
    'disconnected',
    p_actor_user_id,
    jsonb_build_object(
      'account_name', v_connection.account_name,
      'provider_revocation_status', v_status,
      'provider_revocation_confirmed', v_confirmed,
      'provider_revocation_error', nullif(left(coalesce(p_provider_revocation_error, ''), 500), ''),
      'credential_preserved', false,
      'assets_preserved', false
    )
  );

  return jsonb_build_object(
    'ok', true,
    'connection_id', p_connection_id,
    'provider', v_connection.provider,
    'status', 'disconnected',
    'provider_revocation_status', v_status
  );
end;
$function$;

create or replace function public.finalize_whatsapp_removal_v1(
  p_organization_id uuid,
  p_connection_id uuid,
  p_actor_user_id uuid,
  p_provider_unsubscribed boolean,
  p_provider_warning text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $function$
declare
  v_connection public.integration_connections%rowtype;
  v_now timestamptz := now();
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required';
  end if;

  if p_organization_id is null or p_connection_id is null or p_actor_user_id is null then
    raise exception 'Organization, connection and actor are required';
  end if;

  if not exists (
    select 1
    from public.organization_members om
    where om.organization_id = p_organization_id
      and om.user_id = p_actor_user_id
      and om.active = true
      and om.role in ('owner', 'admin')
  ) then
    raise exception 'Only organization owners/admins can manage integrations';
  end if;

  select *
  into v_connection
  from public.integration_connections c
  where c.id = p_connection_id
    and c.organization_id = p_organization_id
    and c.provider = 'whatsapp'
  for update;

  if not found then
    raise exception 'WhatsApp connection was not found for this workspace';
  end if;

  update public.whatsapp_accounts
  set active = false,
      is_default = false,
      updated_at = v_now
  where organization_id = p_organization_id
    and connection_id = p_connection_id;

  delete from public.integration_assets
  where organization_id = p_organization_id
    and connection_id = p_connection_id;

  update public.integration_connections
  set status = 'revoked',
      access_token_ciphertext = null,
      refresh_token_ciphertext = null,
      token_expires_at = null,
      last_error = nullif(left(coalesce(p_provider_warning, ''), 1000), ''),
      provider_metadata = coalesce(provider_metadata, '{}'::jsonb) || jsonb_build_object(
        'removed_from_salsys_at', v_now,
        'provider_webhook_unsubscribed', coalesce(p_provider_unsubscribed, false)
      )
  where id = p_connection_id
    and organization_id = p_organization_id
    and provider = 'whatsapp';

  insert into public.integration_audit_log (
    organization_id,
    connection_id,
    provider,
    event_type,
    actor_user_id,
    detail
  )
  values (
    p_organization_id,
    p_connection_id,
    'whatsapp',
    'removed',
    p_actor_user_id,
    jsonb_build_object(
      'account_name', v_connection.account_name,
      'waba_id', v_connection.external_account_id,
      'provider_webhook_unsubscribed', coalesce(p_provider_unsubscribed, false),
      'provider_warning', nullif(left(coalesce(p_provider_warning, ''), 500), ''),
      'historical_crm_data_preserved', true,
      'phone_deregistered', false
    )
  );

  return jsonb_build_object(
    'ok', true,
    'connection_id', p_connection_id,
    'provider', 'whatsapp',
    'status', 'revoked',
    'provider_webhook_unsubscribed', coalesce(p_provider_unsubscribed, false)
  );
end;
$function$;

revoke all on function public.finalize_integration_disconnect_v1(uuid, uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.finalize_whatsapp_removal_v1(uuid, uuid, uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.finalize_integration_disconnect_v1(uuid, uuid, uuid, text, text) to service_role;
grant execute on function public.finalize_whatsapp_removal_v1(uuid, uuid, uuid, boolean, text) to service_role;

comment on function public.finalize_integration_disconnect_v1(uuid, uuid, uuid, text, text) is
  'Atomically clears one Google/Meta/Instagram tenant integration, removes its assets, and records truthful provider-revocation evidence.';
comment on function public.finalize_whatsapp_removal_v1(uuid, uuid, uuid, boolean, text) is
  'Atomically deactivates WhatsApp mappings, clears assets/credentials, revokes the local connection, and records removal evidence after the provider unsubscribe attempt.';

-- Correct known legacy evidence. The old generic disconnect action never called
-- a Meta/Instagram revoke endpoint, so prior boolean=true values are not
-- authoritative. Keep the original audit row and annotate the correction.
update public.integration_audit_log
set detail = coalesce(detail, '{}'::jsonb) || jsonb_build_object(
  'provider_revocation_status', 'not_attempted_legacy',
  'provider_revocation_confirmed', null,
  'revocation_evidence_note', 'Legacy Meta/Instagram disconnect did not issue a provider-side revoke call; the prior boolean was not authoritative.'
)
where event_type = 'disconnected'
  and provider in ('meta', 'instagram')
  and not (coalesce(detail, '{}'::jsonb) ? 'provider_revocation_status');
