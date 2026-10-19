-- Enforce workflow quiet hours at the final WhatsApp policy boundary.
-- All existing prepare/claim paths already resolve through resolve_whatsapp_channel_policy_v3,
-- so replacing the function keeps the safety rule centralized and fail-closed.

create or replace function public.resolve_whatsapp_channel_policy_v3(
  p_organization_id uuid,
  p_lead_id uuid,
  p_workflow_id uuid default null,
  p_template_name text default null,
  p_template_language text default null,
  p_whatsapp_account_id uuid default null,
  p_approval_request_id uuid default null,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','auth','pg_temp'
as $function$
declare
  v_now timestamptz := coalesce(p_now,now());
  v_channel jsonb;
  v_base jsonb;
  v_reasons jsonb := '[]'::jsonb;
  v_reason text;
  v_channel_allowed boolean := false;
  v_final boolean := false;
  v_workflow record;
  v_quiet_hours_enabled boolean := false;
  v_quiet_hours_active boolean := false;
  v_quiet_hours_misconfigured boolean := false;
  v_timezone text;
  v_local_time time;
begin
  v_channel := public.resolve_whatsapp_channel_policy_v2(
    p_organization_id,p_lead_id,p_workflow_id,p_template_name,p_template_language,p_whatsapp_account_id,v_now
  );
  v_base := public.evaluate_automation_send_policy_v2(
    p_organization_id,p_lead_id,'whatsapp',p_workflow_id,p_approval_request_id,v_now
  );

  v_channel_allowed := coalesce((v_channel->>'channel_policy_allowed')::boolean,false);

  if p_workflow_id is not null then
    select
      w.quiet_hours_enabled,
      w.quiet_hours_start,
      w.quiet_hours_end,
      w.timezone
    into v_workflow
    from public.automation_workflows w
    where w.id=p_workflow_id
      and w.organization_id=p_organization_id
    limit 1;

    if found then
      v_quiet_hours_enabled := coalesce(v_workflow.quiet_hours_enabled,false);
    end if;
  end if;

  if v_quiet_hours_enabled then
    v_timezone := nullif(btrim(coalesce(v_workflow.timezone,'')),'');

    if v_workflow.quiet_hours_start is null
       or v_workflow.quiet_hours_end is null
       or v_timezone is null
       or not exists (select 1 from pg_timezone_names tz where tz.name=v_timezone) then
      v_quiet_hours_misconfigured := true;
    else
      v_local_time := (v_now at time zone v_timezone)::time;

      if v_workflow.quiet_hours_start = v_workflow.quiet_hours_end then
        -- Equal bounds are treated as all-day quiet time rather than silently
        -- allowing customer sends from an ambiguous configuration.
        v_quiet_hours_active := true;
      elsif v_workflow.quiet_hours_start < v_workflow.quiet_hours_end then
        v_quiet_hours_active :=
          v_local_time >= v_workflow.quiet_hours_start
          and v_local_time < v_workflow.quiet_hours_end;
      else
        -- Overnight window, for example 22:00 -> 08:00.
        v_quiet_hours_active :=
          v_local_time >= v_workflow.quiet_hours_start
          or v_local_time < v_workflow.quiet_hours_end;
      end if;
    end if;
  end if;

  for v_reason in
    select value from jsonb_array_elements_text(coalesce(v_channel->'block_reasons','[]'::jsonb))
  loop
    if v_reason <> 'base_messaging_policy_blocked' then
      v_reasons := v_reasons || jsonb_build_array(v_reason);
    end if;
  end loop;

  if coalesce((v_base->>'send_allowed')::boolean,false) is not true then
    v_reasons := v_reasons || jsonb_build_array('base_messaging_policy_blocked');
  end if;

  if v_quiet_hours_misconfigured then
    v_reasons := v_reasons || jsonb_build_array('quiet_hours_misconfigured');
  elsif v_quiet_hours_active then
    v_reasons := v_reasons || jsonb_build_array('quiet_hours_active');
  end if;

  v_final :=
    coalesce((v_base->>'send_allowed')::boolean,false)
    and v_channel_allowed
    and not v_quiet_hours_active
    and not v_quiet_hours_misconfigured;

  return v_channel || jsonb_build_object(
    'base_policy',v_base,
    'base_send_allowed',coalesce((v_base->>'send_allowed')::boolean,false),
    'approval_request_id',p_approval_request_id,
    'human_approval_satisfied',coalesce((v_base->>'human_approval_satisfied')::boolean,false),
    'quiet_hours_enabled',v_quiet_hours_enabled,
    'quiet_hours_active',v_quiet_hours_active,
    'quiet_hours_misconfigured',v_quiet_hours_misconfigured,
    'quiet_hours_timezone',v_timezone,
    'quiet_hours_local_time',case when v_local_time is null then null else v_local_time::text end,
    'quiet_hours_start',case when v_workflow.quiet_hours_start is null then null else v_workflow.quiet_hours_start::text end,
    'quiet_hours_end',case when v_workflow.quiet_hours_end is null then null else v_workflow.quiet_hours_end::text end,
    'send_allowed',v_final,
    'block_reasons',v_reasons,
    'customer_message_sent',false
  );
end;
$function$;
