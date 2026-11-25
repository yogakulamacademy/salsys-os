-- Test leads (owner request, 25 Nov 2026).
-- 1) mark_lead_as_test_v1: a manager/admin marks a lead as the team's own
--    test. Nothing is deleted: the lead moves to Unqualified, carries
--    metadata.test_lead = true, its unconfirmed website checkouts are marked
--    failed ("test"), open tasks are cancelled and Autopilot stops.
-- 2) The smart summaries (Leads, Pipeline, Personas) leave test leads out.

create or replace function public.mark_lead_as_test_v1(p_lead_id uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_lead record;
  v_payments integer := 0;
  v_tasks integer := 0;
begin
  if auth.uid() is null then raise exception 'Sign in to mark a test lead'; end if;
  select id, organization_id, current_stage, metadata into v_lead from public.leads where id = p_lead_id for update;
  if not found then raise exception 'Lead not found'; end if;
  if not public.can_administer_organization_crm(v_lead.organization_id) then
    raise exception 'Manager or administrator access is required to mark a test lead';
  end if;
  if coalesce((v_lead.metadata ->> 'test_lead')::boolean, false) then
    return jsonb_build_object('changed', false, 'reason', 'already_test');
  end if;

  update public.leads set
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('test_lead', true, 'test_marked_by', auth.uid(), 'test_marked_at', now(), 'test_reason', left(coalesce(p_reason, ''), 200)),
    current_stage = case when current_stage in ('closed_won', 'enrolled') then current_stage else 'unqualified' end
  where id = p_lead_id;
  if v_lead.current_stage not in ('closed_won', 'enrolled', 'unqualified') then
    insert into public.lead_stage_history (lead_id, from_stage, to_stage, changed_by_type, changed_by_id, reason, changed_at)
    values (p_lead_id, v_lead.current_stage, 'unqualified', 'human', auth.uid()::text, 'Marked as a test lead', now());
  end if;

  update public.payments set status = 'failed',
    metadata = metadata || jsonb_build_object('awaiting_verification', false, 'test_lead', true, 'rejected_by', auth.uid(), 'rejected_at', now(), 'reject_reason', 'Test lead')
  where lead_id = p_lead_id and status = 'pending';
  get diagnostics v_payments = row_count;

  update public.tasks set status = 'cancelled' where lead_id = p_lead_id and status in ('open', 'snoozed');
  get diagnostics v_tasks = row_count;
  update public.ai_autopilot_leads set status = 'completed' where lead_id = p_lead_id and status in ('active', 'paused', 'handed_over');

  insert into public.activities (lead_id, activity_type, actor_type, actor_id, title, details, metadata)
  values (p_lead_id, 'marked_test_lead', 'human', auth.uid()::text, 'Marked as a test lead', left(coalesce(p_reason, ''), 300),
    jsonb_build_object('payments_cancelled', v_payments, 'tasks_cancelled', v_tasks));

  return jsonb_build_object('changed', true, 'payments_cancelled', v_payments, 'tasks_cancelled', v_tasks);
end;
$$;

revoke all on function public.mark_lead_as_test_v1(uuid, text) from public, anon;
grant execute on function public.mark_lead_as_test_v1(uuid, text) to authenticated;

-- Leave test leads out of the smart summaries: every read of the business's
-- leads in these functions gains "and not a test lead". Applied once.
do $$
declare
  f text;
  def text;
begin
  foreach f in array array[
    'public.leads_intelligence_v1(uuid)',
    'public.pipeline_intelligence_v1(uuid)',
    'public.enrolment_intelligence_v1(uuid,integer)'
  ] loop
    if to_regprocedure(f) is null then continue; end if;
    def := pg_get_functiondef(to_regprocedure(f));
    if def like '%test_lead%' then continue; end if;
    def := regexp_replace(def, 'l\.organization_id = p_organization_id',
      'l.organization_id = p_organization_id and coalesce((l.metadata ->> ''test_lead'')::boolean, false) = false', 'g');
    execute def;
  end loop;
end;
$$;
