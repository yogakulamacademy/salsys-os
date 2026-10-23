create table if not exists public.conversation_sla_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  warning_minutes integer not null default 60 check (warning_minutes between 5 and 1440),
  breach_minutes integer not null default 240 check (breach_minutes between 10 and 10080 and breach_minutes > warning_minutes),
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.conversation_sla_settings enable row level security;
revoke all on table public.conversation_sla_settings from public, anon;
grant select, insert, update on table public.conversation_sla_settings to authenticated;
grant all on table public.conversation_sla_settings to service_role;

create policy "Organization members can read conversation SLA settings"
  on public.conversation_sla_settings
  for select
  to authenticated
  using (public.is_organization_member(organization_id));

create policy "Sales managers can create conversation SLA settings"
  on public.conversation_sla_settings
  for insert
  to authenticated
  with check (
    public.can_manage_sales_workspace(organization_id)
    and updated_by = (select auth.uid())
  );

create policy "Sales managers can update conversation SLA settings"
  on public.conversation_sla_settings
  for update
  to authenticated
  using (public.can_manage_sales_workspace(organization_id))
  with check (
    public.can_manage_sales_workspace(organization_id)
    and updated_by = (select auth.uid())
  );

create table if not exists public.conversation_presence (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  surface text not null default 'conversations' check (surface in ('conversations')),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (organization_id, lead_id, user_id)
);

alter table public.conversation_presence enable row level security;
revoke all on table public.conversation_presence from public, anon;
grant select, insert, update, delete on table public.conversation_presence to authenticated;
grant all on table public.conversation_presence to service_role;

create index if not exists conversation_presence_lead_seen_idx
  on public.conversation_presence (organization_id, lead_id, last_seen_at desc);

create policy "Organization members can read accessible conversation presence"
  on public.conversation_presence
  for select
  to authenticated
  using (
    public.is_organization_member(organization_id)
    and public.can_access_lead(lead_id)
  );

create policy "Users can create own conversation presence"
  on public.conversation_presence
  for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and public.is_organization_member(organization_id)
    and public.can_access_lead(lead_id)
  );

create policy "Users can update own conversation presence"
  on public.conversation_presence
  for update
  to authenticated
  using (
    user_id = (select auth.uid())
    and public.is_organization_member(organization_id)
    and public.can_access_lead(lead_id)
  )
  with check (
    user_id = (select auth.uid())
    and public.is_organization_member(organization_id)
    and public.can_access_lead(lead_id)
  );

create policy "Users can delete own conversation presence"
  on public.conversation_presence
  for delete
  to authenticated
  using (
    user_id = (select auth.uid())
    and public.is_organization_member(organization_id)
    and public.can_access_lead(lead_id)
  );

create table if not exists public.conversation_mentions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  activity_id uuid not null references public.activities(id) on delete cascade,
  mentioned_user_id uuid not null references auth.users(id) on delete cascade,
  mentioned_by_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  unique (activity_id, mentioned_user_id)
);

alter table public.conversation_mentions enable row level security;
revoke all on table public.conversation_mentions from public, anon;
grant select, update on table public.conversation_mentions to authenticated;
grant all on table public.conversation_mentions to service_role;

create index if not exists conversation_mentions_user_unread_idx
  on public.conversation_mentions (mentioned_user_id, read_at, created_at desc);
create index if not exists conversation_mentions_lead_idx
  on public.conversation_mentions (organization_id, lead_id, created_at desc);

create policy "Users can read own conversation mentions"
  on public.conversation_mentions
  for select
  to authenticated
  using (
    mentioned_user_id = (select auth.uid())
    and public.is_organization_member(organization_id)
    and public.can_access_lead(lead_id)
  );

create policy "Users can mark own conversation mentions read"
  on public.conversation_mentions
  for update
  to authenticated
  using (
    mentioned_user_id = (select auth.uid())
    and public.is_organization_member(organization_id)
    and public.can_access_lead(lead_id)
  )
  with check (
    mentioned_user_id = (select auth.uid())
    and public.is_organization_member(organization_id)
    and public.can_access_lead(lead_id)
  );