-- DESIGN REHEARSAL ONLY. Install on disposable fixture tables, never live queues.
-- Bind only genuinely inserted rows, not existing rows or conflict retries.
-- Binding establishes creation provenance, not human approval or consent.
create unique index work_revision_global_channel_id
on saas_lifecycle.work_revision_bindings(channel,work_id);

create function saas_lifecycle.bind_inserted_queue_work()
returns trigger language plpgsql security invoker set search_path=pg_catalog as $fn$
declare v_channel text; v_revision bigint;
begin
  if tg_table_schema<>'public' or tg_op<>'INSERT' then
    raise exception 'Unexpected lifecycle queue binding context' using errcode='42501';
  end if;
  case tg_table_name
    when 'instagram_automation_runs' then
      v_channel:='instagram';
      if new.status not in ('pending_approval','queued') then
        raise exception 'Invalid initial Instagram work status' using errcode='22023';
      end if;
    when 'whatsapp_broadcast_campaigns' then
      v_channel:='whatsapp';
      if new.status<>'draft' then
        raise exception 'Invalid initial WhatsApp work status' using errcode='22023';
      end if;
    else raise exception 'Unexpected lifecycle queue binding context' using errcode='42501';
  end case;
  v_revision:=saas_lifecycle.active_work_revision(new.organization_id);
  if v_revision is null or not saas_lifecycle.bind_new_work(new.organization_id,v_channel,new.id,v_revision) then
    raise exception 'New work lifecycle binding denied' using errcode='42501';
  end if;
  return new;
end;
$fn$;
revoke all on function saas_lifecycle.bind_inserted_queue_work() from public,anon,authenticated,service_role;

-- Existing approval/claim policy remains independent. An unbound or stale
-- record cannot move into executable status; do not rebind it on approval.
-- Completion, cancellation, provider receipts and policy/suppression evidence
-- must still be persistable; never indiscriminately block every update.
create function saas_lifecycle.guard_queue_activation()
returns trigger language plpgsql security invoker set search_path=pg_catalog as $fn$
declare v_channel text; v_executable boolean;
begin
  if tg_table_schema<>'public' or tg_op<>'UPDATE' then
    raise exception 'Unexpected lifecycle queue activation context' using errcode='42501';
  end if;
  if new.id is distinct from old.id or new.organization_id is distinct from old.organization_id then
    raise exception 'Lifecycle queue identity is immutable' using errcode='42501';
  end if;
  case tg_table_name
    when 'instagram_automation_runs' then
      v_channel:='instagram';
      v_executable:=new.status in ('approved','queued','running');
    when 'whatsapp_broadcast_campaigns' then
      v_channel:='whatsapp';
      v_executable:=new.status in ('approved','scheduled','running');
    else raise exception 'Unexpected lifecycle queue activation context' using errcode='42501';
  end case;
  if v_executable and (new.status is distinct from old.status
      or new.approved_by is distinct from old.approved_by
      or new.approved_at is distinct from old.approved_at)
    and not saas_lifecycle.work_revision_allowed(new.organization_id,v_channel,new.id) then
    raise exception 'Lifecycle queue activation denied' using errcode='42501';
  end if;
  return new;
end;
$fn$;
revoke all on function saas_lifecycle.guard_queue_activation() from public,anon,authenticated,service_role;

create trigger sa12_bind_instagram_work after insert on public.instagram_automation_runs
for each row execute function saas_lifecycle.bind_inserted_queue_work();
create trigger sa12_guard_instagram_activation before update on public.instagram_automation_runs
for each row execute function saas_lifecycle.guard_queue_activation();
create trigger sa12_bind_whatsapp_work after insert on public.whatsapp_broadcast_campaigns
for each row execute function saas_lifecycle.bind_inserted_queue_work();
create trigger sa12_guard_whatsapp_activation before update on public.whatsapp_broadcast_campaigns
for each row execute function saas_lifecycle.guard_queue_activation();
