begin;

-- An explicit, per-workspace inbox triage decision. It does not alter stages,
-- send messages, or silently complete independent CRM follow-up tasks.
-- A new inbound message after resolved_at automatically reopens the queue.
create table if not exists public.lead_inbox_resolutions_v1 (
  lead_id uuid primary key references public.leads(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  resolved_by uuid not null references auth.users(id),
  resolved_at timestamptz not null default now(),
  constraint inbox_resolution_resolved_at_valid check (resolved_at <= now() + interval '1 minute')
);

create index if not exists lead_inbox_resolutions_v1_org_idx
  on public.lead_inbox_resolutions_v1(organization_id, resolved_at desc);

alter table public.lead_inbox_resolutions_v1 enable row level security;
revoke all on public.lead_inbox_resolutions_v1 from public, anon;
grant select, insert, update, delete on public.lead_inbox_resolutions_v1 to authenticated;

create policy "inbox resolutions readable by authorized lead workers"
  on public.lead_inbox_resolutions_v1 for select to authenticated
  using (
    organization_id = (select public.current_tenant_organization_id())
    and public.can_work_lead(lead_id)
    and exists (
      select 1 from public.leads l
      where l.id = lead_id and l.organization_id = lead_inbox_resolutions_v1.organization_id
    )
  );

create policy "inbox resolution insert limited to authorized lead workers"
  on public.lead_inbox_resolutions_v1 for insert to authenticated
  with check (
    resolved_by = (select auth.uid())
    and organization_id = (select public.current_tenant_organization_id())
    and public.can_work_lead(lead_id)
    and exists (
      select 1 from public.leads l
      where l.id = lead_id and l.organization_id = lead_inbox_resolutions_v1.organization_id
    )
  );

create policy "inbox resolution update limited to authorized lead workers"
  on public.lead_inbox_resolutions_v1 for update to authenticated
  using (
    organization_id = (select public.current_tenant_organization_id())
    and public.can_work_lead(lead_id)
  )
  with check (
    resolved_by = (select auth.uid())
    and organization_id = (select public.current_tenant_organization_id())
    and public.can_work_lead(lead_id)
    and exists (
      select 1 from public.leads l
      where l.id = lead_id and l.organization_id = lead_inbox_resolutions_v1.organization_id
    )
  );

create policy "inbox resolutions reopenable by authorized lead workers"
  on public.lead_inbox_resolutions_v1 for delete to authenticated
  using (
    organization_id = (select public.current_tenant_organization_id())
    and public.can_work_lead(lead_id)
  );

comment on table public.lead_inbox_resolutions_v1 is
  'Inbox triage only. Does not change canonical CRM follow-up completion, lead stage, provider conversation state or user messages.';

commit;