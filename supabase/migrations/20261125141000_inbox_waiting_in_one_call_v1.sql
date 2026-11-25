-- Inbox load: one database call per Inbox view (owner report, 25 Nov 2026).
-- The app used to read up to three extra 100-row pages of "needs a reply" on
-- every view just to count who wrote in the last 7 days. The engine now:
--   * accepts p_filter 'waiting' (needs a reply, waiting under 7 days) and
--     'older' (needs a reply, waiting longer), and
--   * returns waitingWeek counts per channel for the current scope.
-- Read-only; every other filter and count is unchanged.

do $patch$
declare
  v_def text;
  v_scope text := '(v_scope = ''team'' or (v_scope = ''mine'' and owner_user_id = auth.uid()) or (v_scope = ''unassigned'' and owner_user_id is null) or (v_scope like ''owner:%'' and owner_user_id = substring(v_scope from 7)::uuid))';
  v_filter_old text := 'v_filter text := case when p_filter in (''reply'', ''unread'', ''snoozed'') then p_filter else ''all'' end;';
  v_filter_new text := 'v_filter text := case when p_filter in (''reply'', ''unread'', ''snoozed'', ''waiting'', ''older'') then p_filter else ''all'' end;';
  v_matched_old text := 'or v_filter = ''unread'' and s.snoozed_until is null and coalesce(s.unread, false))';
  v_matched_new text := 'or v_filter = ''unread'' and s.snoozed_until is null and coalesce(s.unread, false)'
    || ' or v_filter = ''waiting'' and s.snoozed_until is null and (coalesce(s.needs_reply, false) or s.needs_first_contact) and s.waiting_since >= now() - interval ''7 days'''
    || ' or v_filter = ''older'' and s.snoozed_until is null and (coalesce(s.needs_reply, false) or s.needs_first_contact) and (s.waiting_since is null or s.waiting_since < now() - interval ''7 days''))';
  v_channels_old text := 'or v_filter = ''unread'' and snoozed_until is null and coalesce(unread, false))),';
  v_channels_new text := 'or v_filter = ''unread'' and snoozed_until is null and coalesce(unread, false)'
    || ' or v_filter = ''waiting'' and snoozed_until is null and (coalesce(needs_reply, false) or needs_first_contact) and waiting_since >= now() - interval ''7 days'''
    || ' or v_filter = ''older'' and snoozed_until is null and (coalesce(needs_reply, false) or needs_first_contact) and (waiting_since is null or waiting_since < now() - interval ''7 days''))),';
  v_tail_old text := '''topic'', v_topic' || chr(10) || '  )';
  v_tail_new text;
begin
  v_tail_new := '''waitingWeek'', (select jsonb_build_object('
    || '''all'', count(*), '
    || '''whatsapp'', count(*) filter (where channel = ''whatsapp''), '
    || '''instagram'', count(*) filter (where channel = ''instagram''), '
    || '''website'', count(*) filter (where channel = ''website'')) '
    || 'from scored where snoozed_until is null and ' || v_scope
    || ' and (coalesce(needs_reply, false) or needs_first_contact) and waiting_since >= now() - interval ''7 days''),' || chr(10)
    || '    ' || v_tail_old;

  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'app_private' and p.proname = 'get_current_conversations_page_engine_v2';
  if v_def is null then raise notice 'engine v2 not present; skipping'; return; end if;
  if position('waitingWeek' in v_def) > 0 then return; end if;
  if position(v_filter_old in v_def) = 0 or position(v_matched_old in v_def) = 0
     or position(v_channels_old in v_def) = 0 or position(v_tail_old in v_def) = 0 then
    raise exception 'engine v2 does not have the expected shape; patch by hand';
  end if;
  v_def := replace(v_def, v_filter_old, v_filter_new);
  v_def := replace(v_def, v_matched_old, v_matched_new);
  v_def := replace(v_def, v_channels_old, v_channels_new);
  v_def := replace(v_def, v_tail_old, v_tail_new);
  execute v_def;
end;
$patch$;
