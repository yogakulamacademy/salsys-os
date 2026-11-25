-- Inbox "What people are asking": an "Interested" topic, shown first
-- (owner request, 25 Nov 2026). Read-only changes.
--
-- A message lands in Interested only when no specific question matched
-- (fees, dates, ...) and it says they are interested or asks for details,
-- and it is not a "no / not interested" reply.

create or replace function app_private.inbox_topic_v1(p_body text)
returns text
language sql
immutable
parallel safe
set search_path = pg_catalog
as $topic$
  select case
    when p_body is null or btrim(p_body) = '' then null
    when p_body ~* '\m(fees?|cost|price|prices|charges?|how much|kitna|discount|installments?|payment plan|emi)\M' then 'fee'
    when p_body ~* '\m(register|registration|enrol+|enroll|apply|application|admission|book|booking)\M' then 'register'
    when p_body ~* '\m(duration|dates?|batch|batches|schedule|timings?|when|next month)\M' then 'dates'
    when p_body ~* '\m(accommodation|accomodation|stay|room|rooms|twin|sharing|food|meals?)\M' then 'accommodation'
    when p_body ~* '\m(online|offline|recorded|recordings?|zoom|live)\M' then 'online_offline'
    when p_body ~* '\m(location|where|address|located|bangalore|bengaluru)\M' then 'location'
    when p_body ~* '\m(certificate|certification|certified|alliance|rys|eligib\w*)\M' then 'certification'
    when p_body ~* '\m(interested|intrested|interest|want to join|wanna join|would like to join|want to do|details|more info|information|tell me more|know more)\M'
      and p_body !~* '\m(no|not|nt|dont|don''t|never)\s+(really\s+)?(interest|interested|intrested)\M'
      and p_body !~* '\m(won''?t|wont|will not|can''?t|cannot|not)\s+(be\s+)?(able|join|come|coming)\M'
      then 'interested'
    else 'other'
  end;
$topic$;

revoke all on function app_private.inbox_topic_v1(text) from public, anon;
grant execute on function app_private.inbox_topic_v1(text) to authenticated;

-- Let the Inbox list filter by the new topic.
do $patch$
declare
  v_def text;
  v_old text := $$p_topic in ('fee', 'dates', 'register', 'accommodation', 'online_offline', 'location', 'certification', 'other')$$;
  v_new text := $$p_topic in ('interested', 'fee', 'dates', 'register', 'accommodation', 'online_offline', 'location', 'certification', 'other')$$;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'app_private' and p.proname = 'get_current_conversations_page_engine_v2';
  if v_def is null then
    raise notice 'conversations page engine not present; skipping topic whitelist patch';
    return;
  end if;
  if position(v_new in v_def) > 0 then return; end if;
  if position(v_old in v_def) = 0 then
    raise exception 'conversations page engine topic list not found; patch by hand';
  end if;
  execute replace(v_def, v_old, v_new);
end;
$patch$;
