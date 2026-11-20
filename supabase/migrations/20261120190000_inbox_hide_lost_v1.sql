-- Inbox: Lost leads leave the list (owner request and approval, 20 Nov 2026).
-- A Lost lead comes back only when they send a new message after being marked
-- Lost, so a returning person is never missed. Applies to every tab and count,
-- because the change is in the shared row source (lead_base) of the v2 engine.
-- Patches the live definition in place: the rest of the function is unchanged.
do $migration$
declare
  d text;
begin
  d := pg_get_functiondef('app_private.get_current_conversations_page_engine_v2'::regproc);
  if position('lost_hidden_v1' in d) > 0 then
    return; -- already applied
  end if;

  d := replace(d,
$a$    left join public.lead_inbox_resolutions_v1 resolution$a$,
$b$    left join lateral (
      -- lost_hidden_v1: when the lead was last marked Lost (only looked up for Lost leads)
      select max(h.changed_at) as lost_at
      from public.lead_stage_history h
      where o.current_stage::text = 'lost'
        and h.lead_id = o.id and h.to_stage::text = 'lost'
    ) lost_mark on true
    left join public.lead_inbox_resolutions_v1 resolution$b$);

  d := replace(d,
$a$      and public.can_access_lead(o.id)
  ),
  inbox_state as ($a$,
$b$      and public.can_access_lead(o.id)
      and (o.current_stage::text <> 'lost'
        or (inbound.occurred_at is not null and lost_mark.lost_at is not null
            and inbound.occurred_at > lost_mark.lost_at))
  ),
  inbox_state as ($b$);

  if position('lost_mark on true' in d) = 0 or position('lost_mark.lost_at is not null' in d) = 0 then
    raise exception 'inbox_hide_lost_v1: function text did not match; nothing changed';
  end if;

  execute d;
end
$migration$;
