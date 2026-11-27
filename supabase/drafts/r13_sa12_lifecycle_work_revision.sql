-- DESIGN REHEARSAL ONLY. Requires private lifecycle authority and transitions.
-- No existing queue is backfilled, changed, approved, sent, or deleted.
create table saas_lifecycle.work_revision_bindings (
  organization_id uuid not null references public.organizations(id) on delete restrict,
  channel text not null check(channel in ('instagram','whatsapp')),
  work_id uuid not null,
  lifecycle_revision bigint not null check(lifecycle_revision>=0),
  recorded_at timestamptz not null default clock_timestamp(),
  primary key(organization_id,channel,work_id)
);
alter table saas_lifecycle.work_revision_bindings enable row level security;
revoke all on saas_lifecycle.work_revision_bindings from public,anon,authenticated,service_role;
create trigger work_binding_no_update_delete before update or delete on saas_lifecycle.work_revision_bindings
for each row execute function saas_lifecycle.reject_event_mutation();
create trigger work_binding_no_truncate before truncate on saas_lifecycle.work_revision_bindings
for each statement execute function saas_lifecycle.reject_event_mutation();

-- A shared target-row lock serializes this decision with lifecycle transitions
-- for the current database transaction only. It cannot fence a later HTTP send.
create function saas_lifecycle.active_work_revision(p_org uuid)
returns bigint language plpgsql security invoker set search_path=pg_catalog as $fn$
declare v_status text; v_slug text; v_revision bigint; v_last_status text;
begin
  select status,slug into v_status,v_slug from public.organizations where id=p_org for share;
  if not found or v_status is distinct from 'active' or v_slug='salsysos' then return null; end if;
  select revision,new_status into v_revision,v_last_status
    from saas_lifecycle.events where organization_id=p_org order by revision desc limit 1;
  if not found then return 0; end if;
  if v_last_status is distinct from v_status then return null; end if;
  return v_revision;
end;
$fn$;
revoke all on function saas_lifecycle.active_work_revision(uuid) from public,anon,authenticated,service_role;

-- Only a future trusted work-approval/creation transaction may register a
-- newly approved immutable work ID; this function does NOT itself prove consent
-- or approval. Never call it when retrying or encountering an old queue row.
create function saas_lifecycle.bind_new_work(p_org uuid,p_channel text,p_work uuid,p_expected_revision bigint)
returns boolean language plpgsql security invoker set search_path=pg_catalog as $fn$
declare v_revision bigint;
begin
  if p_work is null or p_channel is null or p_channel not in ('instagram','whatsapp')
    or p_expected_revision is null or p_expected_revision<0 then return false; end if;
  v_revision:=saas_lifecycle.active_work_revision(p_org);
  if v_revision is null or v_revision<>p_expected_revision then return false; end if;
  insert into saas_lifecycle.work_revision_bindings(organization_id,channel,work_id,lifecycle_revision)
    values(p_org,p_channel,p_work,v_revision) on conflict do nothing;
  return found;
end;
$fn$;
revoke all on function saas_lifecycle.bind_new_work(uuid,text,uuid,bigint) from public,anon,authenticated,service_role;

-- Missing bindings and prior revisions deny, including after restoration.
-- This is an additional condition, not a substitute for existing send gates.
create function saas_lifecycle.work_revision_allowed(p_org uuid,p_channel text,p_work uuid)
returns boolean language plpgsql security invoker set search_path=pg_catalog as $fn$
declare v_revision bigint;
begin
  if p_work is null or p_channel is null or p_channel not in ('instagram','whatsapp') then return false; end if;
  v_revision:=saas_lifecycle.active_work_revision(p_org);
  if v_revision is null then return false; end if;
  return exists(select 1 from saas_lifecycle.work_revision_bindings
    where organization_id=p_org and channel=p_channel and work_id=p_work and lifecycle_revision=v_revision);
end;
$fn$;
revoke all on function saas_lifecycle.work_revision_allowed(uuid,text,uuid) from public,anon,authenticated,service_role;
