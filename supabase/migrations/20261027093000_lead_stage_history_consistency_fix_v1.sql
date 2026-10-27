-- Fix two same-transaction stage/history edge cases discovered while replaying
-- failed Instagram events:
-- 1. now() is transaction-stable, so multiple history rows can share a timestamp.
--    Stage transitions now use clock_timestamp() to preserve real ordering.
-- 2. The deferred constraint trigger must compare against the lead's current row
--    at commit time, not the stale NEW snapshot from the statement that queued it.

create or replace function public.set_lead_stage(
  p_lead_id uuid,
  p_new_stage public.lead_stage,
  p_changed_by_type public.actor_type default 'system'::public.actor_type,
  p_changed_by_id text default null,
  p_reason text default null
)
returns public.leads
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $function$
declare
  v_old public.lead_stage;
  v_row public.leads;
  v_actor_type public.actor_type;
  v_actor_id text;
begin
  if not public.can_work_lead(p_lead_id) then
    raise exception 'Not authorized to update this lead';
  end if;

  if auth.role() = 'service_role' then
    v_actor_type := p_changed_by_type;
    v_actor_id := p_changed_by_id;
  else
    v_actor_type := 'human'::public.actor_type;
    v_actor_id := auth.uid()::text;
  end if;

  select current_stage into v_old
  from public.leads
  where id = p_lead_id
  for update;

  if not found then
    raise exception 'Lead not found';
  end if;

  if v_old is distinct from p_new_stage then
    update public.leads
    set
      current_stage = p_new_stage,
      status = case
        when p_new_stage in ('closed_won'::public.lead_stage, 'enrolled'::public.lead_stage)
          then 'won'::public.lead_status
        when p_new_stage in ('lost'::public.lead_stage, 'unqualified'::public.lead_stage, 'duplicate'::public.lead_stage)
          then 'lost'::public.lead_status
        else 'open'::public.lead_status
      end
    where id = p_lead_id
    returning * into v_row;

    insert into public.lead_stage_history (
      lead_id, from_stage, to_stage, changed_by_type, changed_by_id, reason, changed_at
    ) values (
      p_lead_id, v_old, p_new_stage, v_actor_type, v_actor_id, p_reason, clock_timestamp()
    );
  else
    select * into v_row from public.leads where id = p_lead_id;
  end if;

  return v_row;
end;
$function$;

create or replace function public.enforce_lead_stage_history_consistency_v1()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $function$
declare
  v_current_stage public.lead_stage;
  v_latest_stage public.lead_stage;
begin
  select l.current_stage into v_current_stage
  from public.leads l
  where l.id = new.id;

  if not found then
    return new;
  end if;

  select h.to_stage into v_latest_stage
  from public.lead_stage_history h
  where h.lead_id = new.id
  order by h.changed_at desc, h.id desc
  limit 1;

  if v_latest_stage is distinct from v_current_stage then
    raise exception
      'Lead stage/history integrity violation for lead %: current stage %, latest history %',
      new.id, v_current_stage, v_latest_stage;
  end if;

  return new;
end;
$function$;
