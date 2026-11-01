-- Follow-ups final closeout: source-of-truth sync for the live hardened mutation boundary.
-- Production already uses these can_work_lead-guarded definitions. This additive,
-- idempotent migration restores reproducibility so a fresh database cannot regress
-- to the older workspace-only task mutation functions present in early migrations.

create or replace function public.complete_followup_task(p_task_id uuid)
returns public.tasks
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_task public.tasks;
begin
  select *
  into v_task
  from public.tasks
  where id = p_task_id
  for update;

  if not found then
    raise exception 'Task not found';
  end if;

  if not public.can_work_lead(v_task.lead_id) then
    raise exception 'Not authorized to complete this follow-up';
  end if;

  update public.tasks
  set
    status = 'completed',
    completed_at = now()
  where id = p_task_id
  returning *
  into v_task;

  update public.leads l
  set next_followup_at = (
    select min(t.due_at)
    from public.tasks t
    where t.lead_id = v_task.lead_id
      and t.status in ('open', 'snoozed')
      and t.due_at is not null
  )
  where l.id = v_task.lead_id;

  insert into public.activities (
    lead_id,
    activity_type,
    actor_type,
    actor_id,
    title,
    details,
    metadata
  )
  values (
    v_task.lead_id,
    'followup_completed',
    'human',
    auth.uid()::text,
    'Follow-up completed',
    v_task.title,
    jsonb_build_object('task_id', v_task.id)
  );

  return v_task;
end;
$function$;

create or replace function public.snooze_followup_task(
  p_task_id uuid,
  p_due_at timestamptz
)
returns public.tasks
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_task public.tasks;
begin
  select *
  into v_task
  from public.tasks
  where id = p_task_id
    and status in ('open', 'snoozed')
  for update;

  if not found then
    raise exception 'Open task not found';
  end if;

  if not public.can_work_lead(v_task.lead_id) then
    raise exception 'Not authorized to reschedule this follow-up';
  end if;

  update public.tasks
  set
    status = 'snoozed',
    due_at = p_due_at,
    completed_at = null
  where id = p_task_id
  returning *
  into v_task;

  update public.leads l
  set next_followup_at = (
    select min(t.due_at)
    from public.tasks t
    where t.lead_id = v_task.lead_id
      and t.status in ('open', 'snoozed')
      and t.due_at is not null
  )
  where l.id = v_task.lead_id;

  insert into public.activities (
    lead_id,
    activity_type,
    actor_type,
    actor_id,
    title,
    details,
    metadata
  )
  values (
    v_task.lead_id,
    'followup_snoozed',
    'human',
    auth.uid()::text,
    'Follow-up rescheduled',
    v_task.title,
    jsonb_build_object(
      'task_id', v_task.id,
      'due_at', p_due_at
    )
  );

  return v_task;
end;
$function$;

revoke all on function public.complete_followup_task(uuid) from public, anon;
revoke all on function public.snooze_followup_task(uuid, timestamptz) from public, anon;

grant execute on function public.complete_followup_task(uuid) to authenticated, service_role;
grant execute on function public.snooze_followup_task(uuid, timestamptz) to authenticated, service_role;

comment on function public.complete_followup_task(uuid) is
  'Completes one follow-up only after locking the task and authorizing work through its parent lead.';
comment on function public.snooze_followup_task(uuid, timestamptz) is
  'Reschedules one open follow-up only after locking the task and authorizing work through its parent lead.';
