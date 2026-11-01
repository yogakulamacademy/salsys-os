-- WhatsApp final closeout v1
--
-- Preserve historical account rows, but make rollout/readiness depend on one
-- active default sender that is actually bound to a connected WhatsApp
-- integration. Also prevent a tenant from ever having two active defaults.

begin;

do $migration$
begin
  if exists (
    select 1
    from public.whatsapp_accounts
    where active = true
      and is_default = true
    group by organization_id
    having count(*) > 1
  ) then
    raise exception 'WhatsApp closeout: multiple active default senders already exist for at least one organization';
  end if;
end;
$migration$;

create unique index if not exists whatsapp_accounts_one_active_default_per_org_uidx
  on public.whatsapp_accounts (organization_id)
  where active = true
    and is_default = true;

create or replace function public.get_whatsapp_sender_readiness_v1(
  p_organization_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $function$
declare
  v_active_account_count integer := 0;
  v_active_default_count integer := 0;
  v_bound_active_account_count integer := 0;
  v_unbound_active_account_count integer := 0;
  v_account public.whatsapp_accounts%rowtype;
  v_connection record;
  v_connected boolean := false;
  v_issue_code text := null;
  v_issue_message text := null;
begin
  if p_organization_id is null then
    raise exception 'Organization ID is required';
  end if;

  if auth.role() <> 'service_role'
     and not public.is_organization_member(p_organization_id) then
    raise exception 'Organization membership is required';
  end if;

  select
    count(*) filter (where active = true),
    count(*) filter (where active = true and is_default = true),
    count(*) filter (where active = true and connection_id is not null),
    count(*) filter (where active = true and connection_id is null)
  into
    v_active_account_count,
    v_active_default_count,
    v_bound_active_account_count,
    v_unbound_active_account_count
  from public.whatsapp_accounts
  where organization_id = p_organization_id;

  if v_active_default_count = 0 then
    v_issue_code := 'no_default_sender';
    v_issue_message := 'No active default WhatsApp sender is configured.';
  elsif v_active_default_count > 1 then
    -- Defensive even though the organization-level unique index prevents this
    -- after this migration.
    v_issue_code := 'multiple_default_senders';
    v_issue_message := 'Multiple active default WhatsApp senders are configured.';
  else
    select *
    into v_account
    from public.whatsapp_accounts
    where organization_id = p_organization_id
      and active = true
      and is_default = true
    limit 1;

    if v_account.connection_id is null then
      v_issue_code := 'default_sender_unbound';
      v_issue_message := 'The active default WhatsApp sender is not bound to an integration connection.';
    elsif nullif(btrim(coalesce(v_account.phone_number_id, '')), '') is null then
      v_issue_code := 'missing_phone_number_id';
      v_issue_message := 'The active default WhatsApp sender is missing its provider phone number ID.';
    else
      select
        id,
        organization_id,
        provider,
        status,
        external_account_id,
        access_token_ciphertext
      into v_connection
      from public.integration_connections
      where id = v_account.connection_id
        and organization_id = p_organization_id
      limit 1;

      if v_connection.id is null then
        v_issue_code := 'connection_not_found';
        v_issue_message := 'The default WhatsApp sender connection could not be resolved.';
      elsif v_connection.provider <> 'whatsapp' then
        v_issue_code := 'wrong_provider';
        v_issue_message := 'The default WhatsApp sender is bound to a non-WhatsApp connection.';
      elsif v_connection.status <> 'connected' then
        v_issue_code := 'connection_not_connected';
        v_issue_message := 'The default WhatsApp connection is not connected.';
      elsif nullif(btrim(coalesce(v_connection.external_account_id, '')), '') is null then
        v_issue_code := 'missing_waba_id';
        v_issue_message := 'The connected WhatsApp Business Account ID is missing.';
      elsif v_connection.access_token_ciphertext is null then
        v_issue_code := 'missing_access_token';
        v_issue_message := 'The connected WhatsApp credential is unavailable.';
      else
        v_connected := true;
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'connected', v_connected,
    'account_id', case when v_active_default_count = 1 then v_account.id else null end,
    'display_phone_number', case when v_active_default_count = 1 then v_account.display_phone_number else null end,
    'active_account_count', v_active_account_count,
    'active_default_count', v_active_default_count,
    'bound_active_account_count', v_bound_active_account_count,
    'unbound_active_account_count', v_unbound_active_account_count,
    'issue_code', v_issue_code,
    'issue_message', v_issue_message
  );
end;
$function$;

revoke all on function public.get_whatsapp_sender_readiness_v1(uuid) from public, anon;
grant execute on function public.get_whatsapp_sender_readiness_v1(uuid) to authenticated, service_role;

comment on function public.get_whatsapp_sender_readiness_v1(uuid) is
  'Returns secret-minimized tenant WhatsApp sender readiness. Connected requires exactly one active default sender bound to a connected WhatsApp integration with provider identifiers and an encrypted credential.';

commit;
