begin;

-- =============================================================================
-- 007_tenant_schema_foundation.sql
--
-- Version-captures the tenant/schema prerequisites required by Phase 1
-- Identity Resolution.
--
-- IMPORTANT
-- - Does not rewrite migrations 001-006.
-- - Does not use CASCADE.
-- - Backfills the existing single-tenant Yogakulam data before NOT NULL.
-- - Replaces global idempotency/identity uniqueness with tenant-scoped keys.
-- - Broader role-authority cleanup remains a later dedicated migration.
-- =============================================================================


-- =============================================================================
-- 1. ORGANIZATION SPINE
-- =============================================================================

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organizations_status_check
    check (status in ('active', 'suspended', 'archived'))
);

create unique index if not exists organizations_slug_unique
  on public.organizations(slug);


create table if not exists public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  user_id uuid not null,
  role text not null default 'admissions',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_members_role_check
    check (role in ('owner', 'admin', 'manager', 'admissions', 'viewer'))
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.organization_members'::regclass
      and conname = 'organization_members_organization_id_fkey'
  ) then
    alter table public.organization_members
      add constraint organization_members_organization_id_fkey
      foreign key (organization_id)
      references public.organizations(id)
      on delete cascade;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.organization_members'::regclass
      and conname = 'organization_members_user_id_fkey'
  ) then
    alter table public.organization_members
      add constraint organization_members_user_id_fkey
      foreign key (user_id)
      references public.profiles(id)
      on delete cascade;
  end if;
end
$$;

create unique index if not exists organization_members_org_user_unique
  on public.organization_members(organization_id, user_id);

create index if not exists idx_organization_members_org
  on public.organization_members(organization_id);

create index if not exists idx_organization_members_user
  on public.organization_members(user_id);


drop trigger if exists organizations_set_updated_at
  on public.organizations;

create trigger organizations_set_updated_at
before update on public.organizations
for each row
execute function public.set_updated_at();


drop trigger if exists organization_members_set_updated_at
  on public.organization_members;

create trigger organization_members_set_updated_at
before update on public.organization_members
for each row
execute function public.set_updated_at();


-- Existing customer/workspace for the pre-SaaS database.
insert into public.organizations (
  name,
  slug,
  status
)
values (
  'Yogakulam Academy',
  'yogakulam-academy',
  'active'
)
on conflict (slug)
do update set
  name = excluded.name;


-- Preserve current CRM users as Yogakulam organization members.
insert into public.organization_members (
  organization_id,
  user_id,
  role,
  active
)
select
  o.id,
  p.id,
  case
    when p.role::text in ('admin', 'manager', 'admissions', 'viewer')
      then p.role::text
    else 'viewer'
  end,
  p.active
from public.profiles p
cross join public.organizations o
where o.slug = 'yogakulam-academy'
on conflict (organization_id, user_id)
do nothing;


-- =============================================================================
-- 2. ORGANIZATION SECURITY HELPERS
-- =============================================================================

create or replace function public.is_organization_member(
  p_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'auth', 'pg_temp'
as $function$
  select
    auth.role() = 'service_role'
    or exists (
      select 1
      from public.organization_members om
      where om.organization_id = p_organization_id
        and om.user_id = auth.uid()
        and om.active = true
    );
$function$;


create or replace function public.organization_role(
  p_organization_id uuid
)
returns text
language sql
stable
security definer
set search_path to 'public', 'auth', 'pg_temp'
as $function$
  select om.role
  from public.organization_members om
  where om.organization_id = p_organization_id
    and om.user_id = auth.uid()
    and om.active = true
  limit 1;
$function$;


create or replace function public.can_manage_organization(
  p_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'auth', 'pg_temp'
as $function$
  select
    auth.role() = 'service_role'
    or exists (
      select 1
      from public.organization_members om
      where om.organization_id = p_organization_id
        and om.user_id = auth.uid()
        and om.active = true
        and om.role in ('owner', 'admin')
    );
$function$;


revoke all on function public.is_organization_member(uuid)
  from public, anon;
revoke all on function public.organization_role(uuid)
  from public, anon;
revoke all on function public.can_manage_organization(uuid)
  from public, anon;

grant execute on function public.is_organization_member(uuid)
  to authenticated, service_role;
grant execute on function public.organization_role(uuid)
  to authenticated, service_role;
grant execute on function public.can_manage_organization(uuid)
  to authenticated, service_role;


alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;

drop policy if exists organizations_member_read
  on public.organizations;
create policy organizations_member_read
on public.organizations
for select
to authenticated
using (
  public.is_organization_member(id)
);

drop policy if exists organizations_admin_update
  on public.organizations;
create policy organizations_admin_update
on public.organizations
for update
to authenticated
using (
  public.can_manage_organization(id)
)
with check (
  public.can_manage_organization(id)
);

drop policy if exists organization_members_member_read
  on public.organization_members;
create policy organization_members_member_read
on public.organization_members
for select
to authenticated
using (
  public.is_organization_member(organization_id)
);

drop policy if exists organization_members_admin_insert
  on public.organization_members;
create policy organization_members_admin_insert
on public.organization_members
for insert
to authenticated
with check (
  public.can_manage_organization(organization_id)
);

drop policy if exists organization_members_admin_update
  on public.organization_members;
create policy organization_members_admin_update
on public.organization_members
for update
to authenticated
using (
  public.can_manage_organization(organization_id)
)
with check (
  public.can_manage_organization(organization_id)
);

drop policy if exists organization_members_admin_delete
  on public.organization_members;
create policy organization_members_admin_delete
on public.organization_members
for delete
to authenticated
using (
  public.can_manage_organization(organization_id)
);


-- =============================================================================
-- 3. WEBSITE -> ORGANIZATION MAP
-- =============================================================================

create table if not exists public.organization_sites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  hostname text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  constraint organization_sites_status_check
    check (status in ('active', 'inactive'))
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.organization_sites'::regclass
      and conname = 'organization_sites_organization_id_fkey'
  ) then
    alter table public.organization_sites
      add constraint organization_sites_organization_id_fkey
      foreign key (organization_id)
      references public.organizations(id)
      on delete restrict;
  end if;
end
$$;

create unique index if not exists organization_sites_hostname_key
  on public.organization_sites(hostname);

create index if not exists idx_organization_sites_organization
  on public.organization_sites(organization_id);

insert into public.organization_sites (
  organization_id,
  hostname,
  status
)
select
  o.id,
  x.hostname,
  'active'
from public.organizations o
cross join (
  values
    ('yogakulam.com'::text),
    ('www.yogakulam.com'::text)
) as x(hostname)
where o.slug = 'yogakulam-academy'
on conflict (hostname)
do update set
  organization_id = excluded.organization_id,
  status = 'active';

alter table public.organization_sites enable row level security;


-- =============================================================================
-- 4. ADD TENANT OWNERSHIP TO IDENTITY-DEPENDENT CORE TABLES
-- =============================================================================

alter table public.leads
  add column if not exists organization_id uuid;

alter table public.courses
  add column if not exists organization_id uuid;

alter table public.course_batches
  add column if not exists organization_id uuid;

alter table public.lead_contacts
  add column if not exists organization_id uuid;

alter table public.web_sessions
  add column if not exists organization_id uuid;

alter table public.touchpoints
  add column if not exists organization_id uuid;

alter table public.conversations
  add column if not exists organization_id uuid;

alter table public.messages
  add column if not exists organization_id uuid;

alter table public.lead_ingest_events
  add column if not exists organization_id uuid;

alter table public.visitor_identity_links
  add column if not exists organization_id uuid;


-- =============================================================================
-- 5. BACKFILL LEGACY SINGLE-TENANT DATA
-- =============================================================================

-- Authoritative workspace for pre-tenant rows.
update public.leads
set organization_id = (
  select id
  from public.organizations
  where slug = 'yogakulam-academy'
  limit 1
)
where organization_id is null;

update public.courses
set organization_id = (
  select id
  from public.organizations
  where slug = 'yogakulam-academy'
  limit 1
)
where organization_id is null;

update public.course_batches
set organization_id = coalesce(
  (
    select c.organization_id
    from public.courses c
    where c.id = public.course_batches.course_id
  ),
  (
    select id
    from public.organizations
    where slug = 'yogakulam-academy'
    limit 1
  )
)
where organization_id is null;

update public.lead_contacts lc
set organization_id = l.organization_id
from public.leads l
where lc.lead_id = l.id
  and lc.organization_id is null;

update public.conversations c
set organization_id = l.organization_id
from public.leads l
where c.lead_id = l.id
  and c.organization_id is null;

update public.messages m
set organization_id = coalesce(
  (
    select l.organization_id
    from public.leads l
    where l.id = m.lead_id
  ),
  (
    select c.organization_id
    from public.conversations c
    where c.id = m.conversation_id
  )
)
where m.organization_id is null;

update public.lead_ingest_events lie
set organization_id = l.organization_id
from public.leads l
where lie.lead_id = l.id
  and lie.organization_id is null;

update public.visitor_identity_links vil
set organization_id = l.organization_id
from public.leads l
where vil.lead_id = l.id
  and vil.organization_id is null;

update public.web_sessions ws
set organization_id = coalesce(
  (
    select l.organization_id
    from public.leads l
    where l.id = ws.lead_id
  ),
  (
    select id
    from public.organizations
    where slug = 'yogakulam-academy'
    limit 1
  )
)
where ws.organization_id is null;

update public.touchpoints t
set organization_id = coalesce(
  (
    select l.organization_id
    from public.leads l
    where l.id = t.lead_id
  ),
  (
    select ws.organization_id
    from public.web_sessions ws
    where ws.id = t.web_session_id
  ),
  (
    select id
    from public.organizations
    where slug = 'yogakulam-academy'
    limit 1
  )
)
where t.organization_id is null;


-- Fail before NOT NULL if any prerequisite ownership is unresolved.
do $$
begin
  if exists (select 1 from public.leads where organization_id is null) then
    raise exception '007 abort: leads contains tenantless rows';
  end if;

  if exists (select 1 from public.courses where organization_id is null) then
    raise exception '007 abort: courses contains tenantless rows';
  end if;

  if exists (select 1 from public.course_batches where organization_id is null) then
    raise exception '007 abort: course_batches contains tenantless rows';
  end if;

  if exists (select 1 from public.lead_contacts where organization_id is null) then
    raise exception '007 abort: lead_contacts contains tenantless rows';
  end if;

  if exists (select 1 from public.web_sessions where organization_id is null) then
    raise exception '007 abort: web_sessions contains tenantless rows';
  end if;

  if exists (select 1 from public.touchpoints where organization_id is null) then
    raise exception '007 abort: touchpoints contains tenantless rows';
  end if;

  if exists (select 1 from public.conversations where organization_id is null) then
    raise exception '007 abort: conversations contains tenantless rows';
  end if;

  if exists (select 1 from public.messages where organization_id is null) then
    raise exception '007 abort: messages contains tenantless rows';
  end if;

  if exists (select 1 from public.lead_ingest_events where organization_id is null) then
    raise exception '007 abort: lead_ingest_events contains tenantless rows';
  end if;

  if exists (select 1 from public.visitor_identity_links where organization_id is null) then
    raise exception '007 abort: visitor_identity_links contains tenantless rows';
  end if;
end
$$;


alter table public.leads
  alter column organization_id set not null;

alter table public.courses
  alter column organization_id set not null;

alter table public.course_batches
  alter column organization_id set not null;

alter table public.lead_contacts
  alter column organization_id set not null;

alter table public.web_sessions
  alter column organization_id set not null;

alter table public.touchpoints
  alter column organization_id set not null;

alter table public.conversations
  alter column organization_id set not null;

alter table public.messages
  alter column organization_id set not null;

alter table public.lead_ingest_events
  alter column organization_id set not null;

alter table public.visitor_identity_links
  alter column organization_id set not null;


-- =============================================================================
-- 6. ORGANIZATION FOREIGN KEYS
-- =============================================================================

do $$
declare
  r record;
begin
  for r in
    select *
    from (
      values
        ('leads', 'leads_organization_id_fkey'),
        ('courses', 'courses_organization_id_fkey'),
        ('course_batches', 'course_batches_organization_id_fkey'),
        ('lead_contacts', 'lead_contacts_organization_id_fkey'),
        ('web_sessions', 'web_sessions_organization_id_fkey'),
        ('touchpoints', 'touchpoints_organization_id_fkey'),
        ('conversations', 'conversations_organization_id_fkey'),
        ('messages', 'messages_organization_id_fkey'),
        ('lead_ingest_events', 'lead_ingest_events_organization_id_fkey'),
        ('visitor_identity_links', 'visitor_identity_links_organization_id_fkey')
    ) as x(table_name, constraint_name)
  loop
    if not exists (
      select 1
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
      where n.nspname = 'public'
        and t.relname = r.table_name
        and c.conname = r.constraint_name
    ) then
      execute format(
        'alter table public.%I add constraint %I foreign key (organization_id) references public.organizations(id) on delete restrict',
        r.table_name,
        r.constraint_name
      );
    end if;
  end loop;
end
$$;


-- =============================================================================
-- 7. TENANT-SCOPED UNIQUENESS / LOOKUP INDEXES
-- =============================================================================

create index if not exists idx_leads_organization
  on public.leads(organization_id);

create unique index if not exists uq_leads_org_id_identity
  on public.leads(organization_id, id);


create index if not exists idx_courses_organization
  on public.courses(organization_id);

create unique index if not exists uq_courses_org_code
  on public.courses(organization_id, code);

create unique index if not exists uq_courses_org_source_external
  on public.courses(organization_id, source_system, external_course_id)
  where external_course_id is not null;


create index if not exists idx_course_batches_organization
  on public.course_batches(organization_id);

create unique index if not exists uq_course_batches_org_batch_code
  on public.course_batches(organization_id, batch_code);

create unique index if not exists uq_course_batches_org_source_external
  on public.course_batches(organization_id, source_system, external_batch_id)
  where external_batch_id is not null;


create index if not exists idx_lead_contacts_organization
  on public.lead_contacts(organization_id);

create unique index if not exists uq_lead_contacts_org_contact
  on public.lead_contacts(
    organization_id,
    contact_type,
    normalized_value
  );


create index if not exists idx_web_sessions_organization
  on public.web_sessions(organization_id);

create index if not exists idx_web_sessions_org_visitor
  on public.web_sessions(organization_id, anonymous_visitor_id);

create unique index if not exists uq_web_sessions_org_session_key
  on public.web_sessions(organization_id, session_key);

create unique index if not exists uq_web_sessions_org_id_identity
  on public.web_sessions(organization_id, id);


create index if not exists idx_touchpoints_organization
  on public.touchpoints(organization_id);

create index if not exists idx_touchpoints_org_visitor
  on public.touchpoints(organization_id, anonymous_visitor_id);

create index if not exists idx_touchpoints_org_session
  on public.touchpoints(organization_id, web_session_id);

create index if not exists idx_touchpoints_org_lead
  on public.touchpoints(organization_id, lead_id)
  where lead_id is not null;

create unique index if not exists uq_touchpoints_org_event_id
  on public.touchpoints(organization_id, event_id);


create index if not exists idx_conversations_organization_id
  on public.conversations(organization_id);

create unique index if not exists conversations_whatsapp_org_external_uidx
  on public.conversations(
    organization_id,
    external_account_id,
    external_conversation_id
  )
  where channel = 'whatsapp'::public.contact_channel
    and external_account_id is not null
    and external_conversation_id is not null;

create unique index if not exists uq_conversation_org_external_non_whatsapp
  on public.conversations(
    organization_id,
    channel,
    external_conversation_id
  )
  where external_conversation_id is not null
    and channel <> 'whatsapp'::public.contact_channel;


create index if not exists idx_messages_organization_id
  on public.messages(organization_id);

create unique index if not exists uq_messages_org_external
  on public.messages(organization_id, external_message_id)
  where external_message_id is not null;


create index if not exists idx_lead_ingest_events_organization
  on public.lead_ingest_events(organization_id);

create unique index if not exists uq_lead_ingest_events_org_source_event
  on public.lead_ingest_events(
    organization_id,
    source_system,
    external_event_id
  );


create index if not exists idx_visitor_identity_links_org_lead
  on public.visitor_identity_links(organization_id, lead_id);


-- =============================================================================
-- 8. REMOVE LEGACY GLOBAL UNIQUENESS
--
-- Replacements above exist before any old global key is removed.
-- No CASCADE.
-- =============================================================================

alter table public.lead_contacts
  drop constraint if exists lead_contacts_contact_type_normalized_value_key;

alter table public.lead_ingest_events
  drop constraint if exists lead_ingest_events_source_system_external_event_id_key;

alter table public.web_sessions
  drop constraint if exists web_sessions_session_key_key;

drop index if exists public.uq_touchpoints_event_id;

alter table public.courses
  drop constraint if exists courses_code_key;

drop index if exists public.idx_courses_source_external;

alter table public.course_batches
  drop constraint if exists course_batches_batch_code_key;

drop index if exists public.idx_course_batches_source_external;

alter table public.messages
  drop constraint if exists messages_external_message_id_key;

alter table public.conversations
  drop constraint if exists conversations_channel_external_conversation_id_key;


-- =============================================================================
-- 9. VISITOR IDENTITY COMPOSITE PRIMARY KEY + TENANT PROPAGATION
-- =============================================================================

create or replace function public.set_visitor_identity_organization()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_organization_id uuid;
begin
  select l.organization_id
  into v_organization_id
  from public.leads l
  where l.id = new.lead_id;

  if not found or v_organization_id is null then
    raise exception
      'Visitor identity lead organization could not be resolved';
  end if;

  if new.organization_id is null then
    new.organization_id := v_organization_id;
  elsif new.organization_id <> v_organization_id then
    raise exception
      'Visitor identity organization does not match lead organization';
  end if;

  return new;
end;
$function$;

revoke all on function public.set_visitor_identity_organization()
  from public, anon, authenticated;
grant execute on function public.set_visitor_identity_organization()
  to service_role;


drop trigger if exists visitor_identity_links_set_organization
  on public.visitor_identity_links;

create trigger visitor_identity_links_set_organization
before insert or update of lead_id, organization_id
on public.visitor_identity_links
for each row
execute function public.set_visitor_identity_organization();


do $$
declare
  v_pk text;
begin
  select pg_get_constraintdef(c.oid)
  into v_pk
  from pg_constraint c
  where c.conrelid = 'public.visitor_identity_links'::regclass
    and c.conname = 'visitor_identity_links_pkey'
    and c.contype = 'p';

  if v_pk is distinct from
     'PRIMARY KEY (organization_id, anonymous_visitor_id)' then

    if v_pk is not null then
      alter table public.visitor_identity_links
        drop constraint visitor_identity_links_pkey;
    end if;

    alter table public.visitor_identity_links
      add constraint visitor_identity_links_pkey
      primary key (organization_id, anonymous_visitor_id);
  end if;
end
$$;


-- =============================================================================
-- 10. WHATSAPP TENANT FOUNDATION
-- =============================================================================

create table if not exists public.whatsapp_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  phone_number_id text not null,
  display_phone_number text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.whatsapp_accounts'::regclass
      and conname = 'whatsapp_accounts_organization_id_fkey'
  ) then
    alter table public.whatsapp_accounts
      add constraint whatsapp_accounts_organization_id_fkey
      foreign key (organization_id)
      references public.organizations(id)
      on delete restrict;
  end if;
end
$$;

create unique index if not exists whatsapp_accounts_phone_number_id_key
  on public.whatsapp_accounts(phone_number_id);

create index if not exists idx_whatsapp_accounts_organization_id
  on public.whatsapp_accounts(organization_id);

drop trigger if exists whatsapp_accounts_set_updated_at
  on public.whatsapp_accounts;

create trigger whatsapp_accounts_set_updated_at
before update on public.whatsapp_accounts
for each row
execute function public.set_updated_at();


create table if not exists public.whatsapp_webhook_events (
  id uuid primary key default gen_random_uuid(),
  event_key text not null,
  object_type text,
  entry_id text,
  field_name text,
  phone_number_id text,
  display_phone_number text,
  event_type text not null default 'unknown',
  external_message_id text,
  contact_wa_id text,
  signature_valid boolean not null default true,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  processing_status text not null default 'received',
  processing_error text,
  organization_id uuid,
  constraint whatsapp_webhook_events_processing_status_check
    check (
      processing_status in (
        'received',
        'processed',
        'ignored',
        'failed'
      )
    )
);

alter table public.whatsapp_webhook_events
  add column if not exists organization_id uuid;

-- Legacy webhook rows, if any, belong to the original Yogakulam tenant.
update public.whatsapp_webhook_events
set organization_id = (
  select id
  from public.organizations
  where slug = 'yogakulam-academy'
  limit 1
)
where organization_id is null;

alter table public.whatsapp_webhook_events
  alter column organization_id set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.whatsapp_webhook_events'::regclass
      and conname = 'whatsapp_webhook_events_organization_id_fkey'
  ) then
    alter table public.whatsapp_webhook_events
      add constraint whatsapp_webhook_events_organization_id_fkey
      foreign key (organization_id)
      references public.organizations(id)
      on delete restrict;
  end if;
end
$$;

create unique index if not exists uq_whatsapp_webhook_events_org_event_key
  on public.whatsapp_webhook_events(organization_id, event_key);

alter table public.whatsapp_webhook_events
  drop constraint if exists whatsapp_webhook_events_event_key_key;

create index if not exists idx_whatsapp_webhook_events_organization
  on public.whatsapp_webhook_events(organization_id);

create index if not exists idx_whatsapp_webhook_events_received_at
  on public.whatsapp_webhook_events(received_at desc);

create index if not exists idx_whatsapp_webhook_events_status
  on public.whatsapp_webhook_events(processing_status, received_at desc);

create index if not exists idx_whatsapp_webhook_events_contact
  on public.whatsapp_webhook_events(contact_wa_id)
  where contact_wa_id is not null;

create index if not exists idx_whatsapp_webhook_events_message_id
  on public.whatsapp_webhook_events(external_message_id)
  where external_message_id is not null;


create table if not exists public.whatsapp_crm_message_links (
  external_message_id text not null,
  webhook_event_id uuid not null,
  lead_id uuid not null,
  conversation_id uuid not null,
  created_at timestamptz not null default now(),
  organization_id uuid
);

alter table public.whatsapp_crm_message_links
  add column if not exists organization_id uuid;

update public.whatsapp_crm_message_links w
set organization_id = l.organization_id
from public.leads l
where w.lead_id = l.id
  and w.organization_id is null;

alter table public.whatsapp_crm_message_links
  alter column organization_id set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.whatsapp_crm_message_links'::regclass
      and conname = 'whatsapp_crm_message_links_organization_id_fkey'
  ) then
    alter table public.whatsapp_crm_message_links
      add constraint whatsapp_crm_message_links_organization_id_fkey
      foreign key (organization_id)
      references public.organizations(id)
      on delete restrict;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.whatsapp_crm_message_links'::regclass
      and conname = 'whatsapp_crm_message_links_webhook_event_id_fkey'
  ) then
    alter table public.whatsapp_crm_message_links
      add constraint whatsapp_crm_message_links_webhook_event_id_fkey
      foreign key (webhook_event_id)
      references public.whatsapp_webhook_events(id)
      on delete cascade;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.whatsapp_crm_message_links'::regclass
      and conname = 'whatsapp_crm_message_links_lead_id_fkey'
  ) then
    alter table public.whatsapp_crm_message_links
      add constraint whatsapp_crm_message_links_lead_id_fkey
      foreign key (lead_id)
      references public.leads(id)
      on delete cascade;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.whatsapp_crm_message_links'::regclass
      and conname = 'whatsapp_crm_message_links_conversation_id_fkey'
  ) then
    alter table public.whatsapp_crm_message_links
      add constraint whatsapp_crm_message_links_conversation_id_fkey
      foreign key (conversation_id)
      references public.conversations(id)
      on delete cascade;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.whatsapp_crm_message_links'::regclass
      and conname = 'whatsapp_crm_message_links_webhook_event_id_key'
  ) then
    alter table public.whatsapp_crm_message_links
      add constraint whatsapp_crm_message_links_webhook_event_id_key
      unique (webhook_event_id);
  end if;
end
$$;

create unique index if not exists uq_whatsapp_crm_message_links_org_message
  on public.whatsapp_crm_message_links(
    organization_id,
    external_message_id
  );

do $$
declare
  v_pk text;
begin
  select pg_get_constraintdef(c.oid)
  into v_pk
  from pg_constraint c
  where c.conrelid = 'public.whatsapp_crm_message_links'::regclass
    and c.conname = 'whatsapp_crm_message_links_pkey'
    and c.contype = 'p';

  if v_pk is distinct from
     'PRIMARY KEY (organization_id, external_message_id)' then

    if v_pk is not null then
      alter table public.whatsapp_crm_message_links
        drop constraint whatsapp_crm_message_links_pkey;
    end if;

    alter table public.whatsapp_crm_message_links
      add constraint whatsapp_crm_message_links_pkey
      primary key (organization_id, external_message_id);
  end if;
end
$$;

create index if not exists idx_whatsapp_crm_message_links_organization_id
  on public.whatsapp_crm_message_links(organization_id);

create index if not exists whatsapp_crm_message_links_lead_idx
  on public.whatsapp_crm_message_links(lead_id, created_at desc);

create index if not exists whatsapp_crm_message_links_conversation_idx
  on public.whatsapp_crm_message_links(conversation_id, created_at desc);


-- Seed WhatsApp account mapping from historical events where possible.
insert into public.whatsapp_accounts (
  organization_id,
  phone_number_id,
  display_phone_number,
  active
)
select distinct on (e.phone_number_id)
  e.organization_id,
  e.phone_number_id,
  e.display_phone_number,
  true
from public.whatsapp_webhook_events e
where nullif(btrim(e.phone_number_id), '') is not null
order by
  e.phone_number_id,
  e.received_at desc
on conflict (phone_number_id)
do update set
  organization_id = excluded.organization_id,
  display_phone_number = coalesce(
    excluded.display_phone_number,
    public.whatsapp_accounts.display_phone_number
  ),
  active = true,
  updated_at = now();


-- =============================================================================
-- 11. TENANT-SCOPED RLS FOR IDENTITY-DEPENDENT FOUNDATION TABLES
--
-- These reproduce the current production policies used by the identity paths.
-- A later role-authority migration will replace remaining legacy global helpers.
-- =============================================================================

alter table public.lead_contacts enable row level security;
alter table public.web_sessions enable row level security;
alter table public.touchpoints enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.lead_ingest_events enable row level security;
alter table public.visitor_identity_links enable row level security;
alter table public.whatsapp_accounts enable row level security;
alter table public.whatsapp_webhook_events enable row level security;
alter table public.whatsapp_crm_message_links enable row level security;


drop policy if exists lead_contacts_read on public.lead_contacts;
create policy lead_contacts_read
on public.lead_contacts
for select
to authenticated
using (
  public.can_view_lead_pii()
  and public.is_organization_member(organization_id)
  and exists (
    select 1
    from public.leads l
    where l.id = lead_contacts.lead_id
      and l.organization_id = lead_contacts.organization_id
  )
);

drop policy if exists lead_contacts_insert on public.lead_contacts;
create policy lead_contacts_insert
on public.lead_contacts
for insert
to authenticated
with check (
  public.is_crm_admin()
  and public.is_organization_member(organization_id)
  and exists (
    select 1
    from public.leads l
    where l.id = lead_contacts.lead_id
      and l.organization_id = lead_contacts.organization_id
  )
);

drop policy if exists lead_contacts_update on public.lead_contacts;
create policy lead_contacts_update
on public.lead_contacts
for update
to authenticated
using (
  public.is_crm_admin()
  and public.is_organization_member(organization_id)
  and exists (
    select 1
    from public.leads l
    where l.id = lead_contacts.lead_id
      and l.organization_id = lead_contacts.organization_id
  )
)
with check (
  public.is_crm_admin()
  and public.is_organization_member(organization_id)
  and exists (
    select 1
    from public.leads l
    where l.id = lead_contacts.lead_id
      and l.organization_id = lead_contacts.organization_id
  )
);

drop policy if exists lead_contacts_delete on public.lead_contacts;
create policy lead_contacts_delete
on public.lead_contacts
for delete
to authenticated
using (
  public.is_crm_admin()
  and public.is_organization_member(organization_id)
  and exists (
    select 1
    from public.leads l
    where l.id = lead_contacts.lead_id
      and l.organization_id = lead_contacts.organization_id
  )
);


drop policy if exists web_sessions_read on public.web_sessions;
create policy web_sessions_read
on public.web_sessions
for select
to authenticated
using (
  public.is_crm_user()
  and public.is_organization_member(organization_id)
  and (
    lead_id is null
    or exists (
      select 1
      from public.leads l
      where l.id = web_sessions.lead_id
        and l.organization_id = web_sessions.organization_id
    )
  )
);

drop policy if exists web_sessions_insert on public.web_sessions;
create policy web_sessions_insert
on public.web_sessions
for insert
to authenticated
with check (
  public.can_write_crm()
  and public.is_organization_member(organization_id)
  and (
    lead_id is null
    or exists (
      select 1
      from public.leads l
      where l.id = web_sessions.lead_id
        and l.organization_id = web_sessions.organization_id
    )
  )
);

drop policy if exists web_sessions_update on public.web_sessions;
create policy web_sessions_update
on public.web_sessions
for update
to authenticated
using (
  public.can_write_crm()
  and public.is_organization_member(organization_id)
  and (
    lead_id is null
    or exists (
      select 1
      from public.leads l
      where l.id = web_sessions.lead_id
        and l.organization_id = web_sessions.organization_id
    )
  )
)
with check (
  public.can_write_crm()
  and public.is_organization_member(organization_id)
  and (
    lead_id is null
    or exists (
      select 1
      from public.leads l
      where l.id = web_sessions.lead_id
        and l.organization_id = web_sessions.organization_id
    )
  )
);

drop policy if exists web_sessions_delete on public.web_sessions;
create policy web_sessions_delete
on public.web_sessions
for delete
to authenticated
using (
  public.can_write_crm()
  and public.is_organization_member(organization_id)
  and (
    lead_id is null
    or exists (
      select 1
      from public.leads l
      where l.id = web_sessions.lead_id
        and l.organization_id = web_sessions.organization_id
    )
  )
);


drop policy if exists touchpoints_read on public.touchpoints;
create policy touchpoints_read
on public.touchpoints
for select
to authenticated
using (
  lead_id is not null
  and public.is_organization_member(organization_id)
  and public.can_access_lead(lead_id)
  and exists (
    select 1
    from public.leads l
    where l.id = touchpoints.lead_id
      and l.organization_id = touchpoints.organization_id
  )
);

drop policy if exists touchpoints_insert on public.touchpoints;
create policy touchpoints_insert
on public.touchpoints
for insert
to authenticated
with check (
  lead_id is not null
  and public.is_organization_member(organization_id)
  and public.can_access_lead(lead_id)
  and exists (
    select 1
    from public.leads l
    where l.id = touchpoints.lead_id
      and l.organization_id = touchpoints.organization_id
  )
);

drop policy if exists touchpoints_update on public.touchpoints;
create policy touchpoints_update
on public.touchpoints
for update
to authenticated
using (
  lead_id is not null
  and public.is_organization_member(organization_id)
  and public.can_access_lead(lead_id)
  and exists (
    select 1
    from public.leads l
    where l.id = touchpoints.lead_id
      and l.organization_id = touchpoints.organization_id
  )
)
with check (
  lead_id is not null
  and public.is_organization_member(organization_id)
  and public.can_access_lead(lead_id)
  and exists (
    select 1
    from public.leads l
    where l.id = touchpoints.lead_id
      and l.organization_id = touchpoints.organization_id
  )
);

drop policy if exists touchpoints_delete on public.touchpoints;
create policy touchpoints_delete
on public.touchpoints
for delete
to authenticated
using (
  public.is_crm_admin()
  and public.is_organization_member(organization_id)
  and (
    lead_id is null
    or exists (
      select 1
      from public.leads l
      where l.id = touchpoints.lead_id
        and l.organization_id = touchpoints.organization_id
    )
  )
);


drop policy if exists conversations_read on public.conversations;
create policy conversations_read
on public.conversations
for select
to authenticated
using (
  public.is_organization_member(organization_id)
  and public.can_access_lead(lead_id)
  and exists (
    select 1
    from public.leads l
    where l.id = conversations.lead_id
      and l.organization_id = conversations.organization_id
  )
);

drop policy if exists conversations_insert on public.conversations;
create policy conversations_insert
on public.conversations
for insert
to authenticated
with check (
  public.is_organization_member(organization_id)
  and public.can_access_lead(lead_id)
  and exists (
    select 1
    from public.leads l
    where l.id = conversations.lead_id
      and l.organization_id = conversations.organization_id
  )
);

drop policy if exists conversations_update on public.conversations;
create policy conversations_update
on public.conversations
for update
to authenticated
using (
  public.is_organization_member(organization_id)
  and public.can_access_lead(lead_id)
  and exists (
    select 1
    from public.leads l
    where l.id = conversations.lead_id
      and l.organization_id = conversations.organization_id
  )
)
with check (
  public.is_organization_member(organization_id)
  and public.can_access_lead(lead_id)
  and exists (
    select 1
    from public.leads l
    where l.id = conversations.lead_id
      and l.organization_id = conversations.organization_id
  )
);

drop policy if exists conversations_delete on public.conversations;
create policy conversations_delete
on public.conversations
for delete
to authenticated
using (
  public.is_crm_admin()
  and public.is_organization_member(organization_id)
  and exists (
    select 1
    from public.leads l
    where l.id = conversations.lead_id
      and l.organization_id = conversations.organization_id
  )
);


drop policy if exists messages_read on public.messages;
create policy messages_read
on public.messages
for select
to authenticated
using (
  public.is_organization_member(organization_id)
  and public.can_access_lead(lead_id)
  and exists (
    select 1
    from public.leads l
    where l.id = messages.lead_id
      and l.organization_id = messages.organization_id
  )
  and exists (
    select 1
    from public.conversations c
    where c.id = messages.conversation_id
      and c.lead_id = messages.lead_id
      and c.organization_id = messages.organization_id
  )
);

drop policy if exists messages_insert on public.messages;
create policy messages_insert
on public.messages
for insert
to authenticated
with check (
  public.is_organization_member(organization_id)
  and public.can_access_lead(lead_id)
  and exists (
    select 1
    from public.leads l
    where l.id = messages.lead_id
      and l.organization_id = messages.organization_id
  )
  and exists (
    select 1
    from public.conversations c
    where c.id = messages.conversation_id
      and c.lead_id = messages.lead_id
      and c.organization_id = messages.organization_id
  )
);

drop policy if exists messages_update on public.messages;
create policy messages_update
on public.messages
for update
to authenticated
using (
  public.is_organization_member(organization_id)
  and public.can_access_lead(lead_id)
  and exists (
    select 1
    from public.leads l
    where l.id = messages.lead_id
      and l.organization_id = messages.organization_id
  )
  and exists (
    select 1
    from public.conversations c
    where c.id = messages.conversation_id
      and c.lead_id = messages.lead_id
      and c.organization_id = messages.organization_id
  )
)
with check (
  public.is_organization_member(organization_id)
  and public.can_access_lead(lead_id)
  and exists (
    select 1
    from public.leads l
    where l.id = messages.lead_id
      and l.organization_id = messages.organization_id
  )
  and exists (
    select 1
    from public.conversations c
    where c.id = messages.conversation_id
      and c.lead_id = messages.lead_id
      and c.organization_id = messages.organization_id
  )
);

drop policy if exists messages_delete on public.messages;
create policy messages_delete
on public.messages
for delete
to authenticated
using (
  public.is_crm_admin()
  and public.is_organization_member(organization_id)
  and exists (
    select 1
    from public.leads l
    where l.id = messages.lead_id
      and l.organization_id = messages.organization_id
  )
  and exists (
    select 1
    from public.conversations c
    where c.id = messages.conversation_id
      and c.lead_id = messages.lead_id
      and c.organization_id = messages.organization_id
  )
);


drop policy if exists visitor_identity_links_read
  on public.visitor_identity_links;
create policy visitor_identity_links_read
on public.visitor_identity_links
for select
to authenticated
using (
  public.is_crm_user()
  and public.is_organization_member(organization_id)
);


drop policy if exists lead_ingest_events_read
  on public.lead_ingest_events;
create policy lead_ingest_events_read
on public.lead_ingest_events
for select
to authenticated
using (
  public.is_crm_user()
);


-- Backend/service-role owned tables intentionally have no authenticated policies.
-- RLS remains enabled on:
--   organization_sites
--   whatsapp_accounts
--   whatsapp_webhook_events
--   whatsapp_crm_message_links


-- =============================================================================
-- 12. FINAL FOUNDATION CONSISTENCY ASSERTIONS
-- =============================================================================

do $$
begin
  if exists (
    select 1
    from public.lead_contacts lc
    join public.leads l on l.id = lc.lead_id
    where lc.organization_id <> l.organization_id
  ) then
    raise exception '007 abort: lead_contacts organization mismatch';
  end if;

  if exists (
    select 1
    from public.conversations c
    join public.leads l on l.id = c.lead_id
    where c.organization_id <> l.organization_id
  ) then
    raise exception '007 abort: conversations organization mismatch';
  end if;

  if exists (
    select 1
    from public.messages m
    join public.leads l on l.id = m.lead_id
    where m.organization_id <> l.organization_id
  ) then
    raise exception '007 abort: messages organization mismatch';
  end if;

  if exists (
    select 1
    from public.lead_ingest_events lie
    join public.leads l on l.id = lie.lead_id
    where lie.organization_id <> l.organization_id
  ) then
    raise exception '007 abort: lead_ingest_events organization mismatch';
  end if;

  if exists (
    select 1
    from public.visitor_identity_links vil
    join public.leads l on l.id = vil.lead_id
    where vil.organization_id <> l.organization_id
  ) then
    raise exception '007 abort: visitor_identity_links organization mismatch';
  end if;
end
$$;

commit;
