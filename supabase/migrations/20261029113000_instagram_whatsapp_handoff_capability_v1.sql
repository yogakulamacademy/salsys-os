-- Return only safe handoff state for the signed-in user; never expose the phone value.

create or replace function public.get_instagram_whatsapp_handoff_capability(
  p_lead_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth', 'pg_temp'
as $function$
declare
  v_detected boolean := false;
  v_ready boolean := false;
begin
  if p_lead_id is null then
    raise exception 'Lead ID is required';
  end if;

  if public.can_work_lead(p_lead_id) is not true then
    raise exception 'Lead access denied' using errcode = '42501';
  end if;

  select
    exists(
      select 1
      from public.lead_contacts lc
      where lc.lead_id = p_lead_id
        and lc.contact_type::text = 'phone'
        and coalesce(lc.metadata ->> 'detected_from_message', 'false') = 'true'
        and lc.metadata ->> 'source_system' = 'instagram_dm'
    ),
    exists(
      select 1
      from public.lead_contacts lc
      where lc.lead_id = p_lead_id
        and lc.contact_type::text = 'phone'
        and coalesce(lc.metadata ->> 'detected_from_message', 'false') = 'true'
        and lc.metadata ->> 'source_system' = 'instagram_dm'
        and coalesce(lc.metadata ->> 'international_format', 'false') = 'true'
    )
  into v_detected, v_ready;

  return jsonb_build_object(
    'detected', v_detected,
    'ready', v_ready,
    'needs_country_code', v_detected and not v_ready
  );
end;
$function$;

revoke all on function public.get_instagram_whatsapp_handoff_capability(uuid)
  from public, anon;
grant execute on function public.get_instagram_whatsapp_handoff_capability(uuid)
  to authenticated, service_role;
