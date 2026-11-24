-- DESIGN REHEARSAL ONLY. No migration, public wrapper or API grants.
-- Internal projection; authorization of a future platform-facing read is separate.
create function saas_governance.platform_effective_quota_preview(p_target uuid)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $fn$
declare
  v_org_status text; v_slug text;
  v_plan jsonb; v_state text; v_code text;
  v_usage public.signup_usage_counters%rowtype;
  v_users_limit bigint; v_leads_limit bigint;
begin
  select status,slug into v_org_status,v_slug from public.organizations where id=p_target;
  if not found or v_slug='salsysos' then return jsonb_build_object('state','unavailable'); end if;
  if v_org_status is distinct from 'active' then return jsonb_build_object('state','organization_inactive'); end if;
  v_plan:=public.resolve_signup_plan_internal_v1(p_target);
  v_state:=v_plan->>'state'; v_code:=v_plan->>'plan_code';
  if v_state='not_self_signup' then return jsonb_build_object('state','managed_separately'); end if;
  if v_state is null or v_state not in ('pro_trial','free','free_pending_reconciliation','manual_active')
     or v_code is null or (v_state='manual_active' and v_code not in ('free','basic','growth','pro'))
     or (v_state='pro_trial' and v_code<>'pro')
     or (v_state in ('free','free_pending_reconciliation') and v_code<>'free')
  then return jsonb_build_object('state','unavailable'); end if;
  select * into v_usage from public.signup_usage_counters where organization_id=p_target;
  if not found then return jsonb_build_object('state','unavailable'); end if;
  v_users_limit:=case when v_state='manual_active' then (v_plan->>'named_user_limit')::bigint
    when v_state='pro_trial' then v_usage.pro_named_users else v_usage.free_named_users end;
  v_leads_limit:=case when v_state='manual_active' then (v_plan->>'lead_record_limit')::bigint
    when v_state='pro_trial' then v_usage.pro_lead_records else v_usage.free_lead_records end;
  if v_users_limit is null or v_users_limit<1 or v_leads_limit is null or v_leads_limit<1
    or v_usage.named_users is null or v_usage.named_users<0
    or v_usage.lead_records is null or v_usage.lead_records<0
  then return jsonb_build_object('state','unavailable'); end if;
  return jsonb_build_object('state',v_state,'plan_code',v_code,
    'named_users',v_usage.named_users,'named_user_limit',v_users_limit,
    'lead_records',v_usage.lead_records,'lead_record_limit',v_leads_limit,
    'named_users_over_limit',v_usage.named_users>v_users_limit,
    'lead_records_over_limit',v_usage.lead_records>v_leads_limit);
end;
$fn$;
revoke all on function saas_governance.platform_effective_quota_preview(uuid)
  from public,anon,authenticated,service_role;
