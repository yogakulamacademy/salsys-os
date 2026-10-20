-- Instagram Operations V1 hardening
-- Keep operational views server-only and persist human-approval evidence in the
-- immediate provider claim so the canonical CRM message can preserve lineage.

revoke all on public.v_instagram_reachability_v1 from public, anon, authenticated;
revoke all on public.v_instagram_automation_performance_v1 from public, anon, authenticated;
grant select on public.v_instagram_reachability_v1 to service_role;
grant select on public.v_instagram_automation_performance_v1 to service_role;

create or replace function public.claim_instagram_automation_run_v1(
  p_organization_id uuid,
  p_run_id uuid,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_run public.instagram_automation_runs%rowtype;
  v_policy jsonb;
  v_allowed boolean := false;
begin
  select * into v_run from public.instagram_automation_runs r
  where r.id=p_run_id and r.organization_id=p_organization_id
  for update;

  if v_run.id is null then
    return jsonb_build_object('ok',false,'error','instagram_automation_run_not_found');
  end if;

  if v_run.status not in ('approved','queued') then
    return jsonb_build_object('ok',true,'claimed',false,'reason','instagram_run_not_claimable','status',v_run.status);
  end if;

  if v_run.provider_message_id is not null or v_run.sent_at is not null then
    return jsonb_build_object('ok',true,'claimed',false,'reason','instagram_run_already_sent');
  end if;

  if v_run.scheduled_at > p_now then
    return jsonb_build_object('ok',true,'claimed',false,'reason','instagram_run_not_due');
  end if;

  if v_run.trigger_type='comment_keyword' then
    v_policy := public.evaluate_instagram_comment_private_reply_policy_v1(
      p_organization_id,
      v_run.comment_id,
      p_now,
      v_run.human_approved
    );
  else
    v_policy := public.evaluate_instagram_dm_send_policy_v1(
      p_organization_id,
      v_run.conversation_id,
      p_now,
      true,
      v_run.human_approved
    );
  end if;

  v_allowed := coalesce((v_policy->>'allowed')::boolean,false);

  update public.instagram_automation_runs
  set
    policy_checked_at=p_now,
    policy_snapshot=v_policy,
    block_reasons=coalesce(v_policy->'reasons','[]'::jsonb)
  where id=v_run.id;

  if not v_allowed then
    return jsonb_build_object(
      'ok',true,
      'claimed',false,
      'reason','instagram_policy_blocked',
      'policy',v_policy
    );
  end if;

  update public.instagram_automation_runs
  set status='running',attempted_at=p_now
  where id=v_run.id;

  return jsonb_build_object(
    'ok',true,
    'claimed',true,
    'run_id',v_run.id,
    'trigger_type',v_run.trigger_type,
    'instagram_account_id',v_run.instagram_account_id,
    'instagram_user_id',v_run.instagram_user_id,
    'comment_id',v_run.comment_id,
    'conversation_id',v_run.conversation_id,
    'lead_id',v_run.lead_id,
    'response_text',v_run.response_text,
    'human_approved',v_run.human_approved,
    'approved_by',v_run.approved_by,
    'approved_at',v_run.approved_at,
    'policy',v_policy
  );
end;
$$;

revoke all on function public.claim_instagram_automation_run_v1(uuid,uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.claim_instagram_automation_run_v1(uuid,uuid,timestamptz) to service_role;
