begin;

create or replace function public.normalize_web_touchpoint_event_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_canonical text;
  v_payload jsonb := '{}'::jsonb;
  v_action text;
  v_mapped text;
begin
  if new.event_type is null or new.event_type not like 'web.%' then
    return new;
  end if;

  v_canonical := lower(btrim(new.event_type));

  if new.event_id is not null and new.organization_id is not null then
    select case when jsonb_typeof(re.payload)='object' then re.payload else '{}'::jsonb end
      into v_payload
    from public.raw_events re
    where re.organization_id = new.organization_id
      and re.source_system = 'website'
      and re.source_event_id = new.event_id
    order by re.received_at desc
    limit 1;
  end if;

  v_action := nullif(lower(btrim(coalesce(v_payload->>'action',''))),'');

  v_mapped := case v_canonical
    when 'web.session_started' then 'session_start'
    when 'web.page_viewed' then 'page_view'
    when 'web.form_started' then 'form_start'
    when 'web.form_submitted' then 'lead_form_submit'
    when 'web.lead_submitted' then 'lead_form_submit'
    when 'web.cta_clicked' then
      case
        when v_action in ('whatsapp_click','whatsapp_clicked') then 'whatsapp_click'
        when v_action in ('phone_click','call_click','call_clicked') then 'phone_click'
        when v_action in ('email_click','email_clicked') then 'email_click'
        when v_action in ('instagram_click','instagram_clicked') then 'instagram_click'
        when v_action in ('enroll_click','enrollment_click','enrollment_cta_click','enroll_now') then 'enrollment_cta_click'
        when v_action is not null and v_action ~ '^[a-z][a-z0-9_]{0,79}$' then v_action
        else 'cta_click'
      end
    else regexp_replace(v_canonical, '^web\.', '')
  end;

  new.metadata := coalesce(new.metadata,'{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
    'canonical_event_type', v_canonical,
    'canonical_action', v_action,
    'canonical_form_id', nullif(v_payload->>'form_id',''),
    'canonical_form_action', nullif(v_payload->>'form_action',''),
    'semantic_projection', 'web_touchpoint_compat_v1'
  ));
  new.event_type := v_mapped;

  return new;
end;
$function$;

revoke all on function public.normalize_web_touchpoint_event_v1() from public, anon, authenticated;
grant execute on function public.normalize_web_touchpoint_event_v1() to service_role;

drop trigger if exists trg_normalize_web_touchpoint_event_v1 on public.touchpoints;
create trigger trg_normalize_web_touchpoint_event_v1
before insert or update of event_type on public.touchpoints
for each row
when (new.event_type like 'web.%')
execute function public.normalize_web_touchpoint_event_v1();

comment on function public.normalize_web_touchpoint_event_v1() is
'Projects canonical web.* raw-event names into the established semantic touchpoint vocabulary while preserving canonical evidence in metadata.';

commit;
