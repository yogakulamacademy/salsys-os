-- Inbox: a lead marked Lost 4 or more times (more than 3) stays out of the Inbox for good,
-- even if they write again (owner request, 20 Nov 2026). Builds on
-- inbox_hide_lost_v1 (Lost leads come back only when they write again).
do $migration$
declare
  d text;
begin
  d := pg_get_functiondef('app_private.get_current_conversations_page_engine_v2'::regproc);
  if position('lost_four_times_v1' in d) > 0 then
    return; -- already applied
  end if;
  if position('lost_hidden_v1' in d) = 0 then
    raise exception 'inbox_lost_four_times_v1 needs inbox_hide_lost_v1 first';
  end if;

  d := replace(d,
$a$      select max(h.changed_at) as lost_at
      from public.lead_stage_history h$a$,
$b$      -- lost_four_times_v1: how many times the lead has been marked Lost
      select max(h.changed_at) as lost_at, count(*) as lost_times
      from public.lead_stage_history h$b$);

  d := replace(d,
$a$        or (inbound.occurred_at is not null and lost_mark.lost_at is not null
            and inbound.occurred_at > lost_mark.lost_at))$a$,
$b$        or (inbound.occurred_at is not null and lost_mark.lost_at is not null
            and inbound.occurred_at > lost_mark.lost_at
            and lost_mark.lost_times < 4))$b$);

  if position('lost_mark.lost_times < 4' in d) = 0 or position('count(*) as lost_times' in d) = 0 then
    raise exception 'inbox_lost_four_times_v1: function text did not match; nothing changed';
  end if;

  execute d;
end
$migration$;
