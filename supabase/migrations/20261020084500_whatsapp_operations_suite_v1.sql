-- WhatsApp Operations Suite V1
-- Adds tenant-scoped audiences, broadcast campaigns, recipient snapshots,
-- quick replies and campaign performance. No provider-send capability is
-- enabled by this migration; existing messaging policy/provider gates remain authoritative.

create table if not exists public.whatsapp_audience_segments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  filters jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint whatsapp_audience_segments_name_nonempty check (length(trim(name)) between 1 and 120),
  constraint whatsapp_audience_segments_filters_object check (jsonb_typeof(filters) = 'object')
);

create unique index if not exists whatsapp_audience_segments_org_name_uidx
  on public.whatsapp_audience_segments (organization_id, lower(name));
create index if not exists whatsapp_audience_segments_org_active_idx
  on public.whatsapp_audience_segments (organization_id, active, updated_at desc);

create table if not exists public.whatsapp_broadcast_campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  status text not null default 'draft',
  whatsapp_template_id uuid not null references public.automation_whatsapp_templates(id) on delete restrict,
  audience_segment_id uuid references public.whatsapp_audience_segments(id) on delete set null,
  audience_filters jsonb not null default '{}'::jsonb,
  scheduled_at timestamptz,
  created_by uuid,
  approved_by uuid,
  approved_at timestamptz,
  paused_at timestamptz,
  cancelled_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  audience_count integer not null default 0,
  eligible_count integer not null default 0,
  excluded_count integer not null default 0,
  queued_count integer not null default 0,
  sent_count integer not null default 0,
  delivered_count integer not null default 0,
  read_count integer not null default 0,
  replied_count integer not null default 0,
  failed_count integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint whatsapp_broadcast_campaigns_name_nonempty check (length(trim(name)) between 1 and 160),
  constraint whatsapp_broadcast_campaigns_status_check check (
    status in ('draft','ready','approved','scheduled','running','paused','completed','cancelled','failed')
  ),
  constraint whatsapp_broadcast_campaigns_filters_object check (jsonb_typeof(audience_filters) = 'object'),
  constraint whatsapp_broadcast_campaigns_metadata_object check (jsonb_typeof(metadata) = 'object'),
  constraint whatsapp_broadcast_campaigns_counts_nonnegative check (
    audience_count >= 0 and eligible_count >= 0 and excluded_count >= 0 and queued_count >= 0 and
    sent_count >= 0 and delivered_count >= 0 and read_count >= 0 and replied_count >= 0 and failed_count >= 0
  )
);

create index if not exists whatsapp_broadcast_campaigns_org_status_idx
  on public.whatsapp_broadcast_campaigns (organization_id, status, created_at desc);
create index if not exists whatsapp_broadcast_campaigns_schedule_idx
  on public.whatsapp_broadcast_campaigns (organization_id, scheduled_at)
  where status in ('approved','scheduled');

create table if not exists public.whatsapp_broadcast_recipients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid not null references public.whatsapp_broadcast_campaigns(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  lead_contact_id uuid references public.lead_contacts(id) on delete set null,
  status text not null default 'eligible',
  exclusion_reason text,
  provider_send_audit_id uuid references public.automation_provider_send_audits(id) on delete set null,
  provider_message_id text,
  queued_at timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  replied_at timestamptz,
  failed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint whatsapp_broadcast_recipients_status_check check (
    status in ('eligible','excluded','queued','sent','delivered','read','replied','failed','suppressed','cancelled')
  ),
  constraint whatsapp_broadcast_recipients_metadata_object check (jsonb_typeof(metadata) = 'object'),
  unique (organization_id, campaign_id, lead_id)
);

create index if not exists whatsapp_broadcast_recipients_campaign_status_idx
  on public.whatsapp_broadcast_recipients (organization_id, campaign_id, status);
create index if not exists whatsapp_broadcast_recipients_lead_idx
  on public.whatsapp_broadcast_recipients (organization_id, lead_id, created_at desc);

create table if not exists public.whatsapp_quick_replies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null,
  shortcut text not null,
  body text not null,
  category text,
  active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint whatsapp_quick_replies_title_nonempty check (length(trim(title)) between 1 and 120),
  constraint whatsapp_quick_replies_shortcut_check check (shortcut ~ '^/[a-z0-9_-]{1,40}$'),
  constraint whatsapp_quick_replies_body_nonempty check (length(trim(body)) between 1 and 4096)
);

create unique index if not exists whatsapp_quick_replies_org_shortcut_uidx
  on public.whatsapp_quick_replies (organization_id, lower(shortcut));
create index if not exists whatsapp_quick_replies_org_active_idx
  on public.whatsapp_quick_replies (organization_id, active, category, updated_at desc);

create table if not exists public.whatsapp_campaign_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid not null references public.whatsapp_broadcast_campaigns(id) on delete cascade,
  event_type text not null,
  actor_user_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint whatsapp_campaign_events_event_type_nonempty check (length(trim(event_type)) between 1 and 80),
  constraint whatsapp_campaign_events_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create index if not exists whatsapp_campaign_events_campaign_idx
  on public.whatsapp_campaign_events (organization_id, campaign_id, created_at desc);

-- Keep timestamps consistent with the rest of the application.
drop trigger if exists whatsapp_audience_segments_set_updated_at on public.whatsapp_audience_segments;
create trigger whatsapp_audience_segments_set_updated_at
before update on public.whatsapp_audience_segments
for each row execute function public.set_updated_at();

drop trigger if exists whatsapp_broadcast_campaigns_set_updated_at on public.whatsapp_broadcast_campaigns;
create trigger whatsapp_broadcast_campaigns_set_updated_at
before update on public.whatsapp_broadcast_campaigns
for each row execute function public.set_updated_at();

drop trigger if exists whatsapp_broadcast_recipients_set_updated_at on public.whatsapp_broadcast_recipients;
create trigger whatsapp_broadcast_recipients_set_updated_at
before update on public.whatsapp_broadcast_recipients
for each row execute function public.set_updated_at();

drop trigger if exists whatsapp_quick_replies_set_updated_at on public.whatsapp_quick_replies;
create trigger whatsapp_quick_replies_set_updated_at
before update on public.whatsapp_quick_replies
for each row execute function public.set_updated_at();

-- Tenant safety: users can only see records for organizations they belong to.
-- Mutations are admin-only. Server workers continue to use service_role.
alter table public.whatsapp_audience_segments enable row level security;
alter table public.whatsapp_broadcast_campaigns enable row level security;
alter table public.whatsapp_broadcast_recipients enable row level security;
alter table public.whatsapp_quick_replies enable row level security;
alter table public.whatsapp_campaign_events enable row level security;

create policy whatsapp_audience_segments_select_members
  on public.whatsapp_audience_segments for select
  using (public.is_organization_member(organization_id));
create policy whatsapp_audience_segments_manage_admins
  on public.whatsapp_audience_segments for all
  using (public.can_manage_organization(organization_id))
  with check (public.can_manage_organization(organization_id));

create policy whatsapp_broadcast_campaigns_select_members
  on public.whatsapp_broadcast_campaigns for select
  using (public.is_organization_member(organization_id));
create policy whatsapp_broadcast_campaigns_manage_admins
  on public.whatsapp_broadcast_campaigns for all
  using (public.can_manage_organization(organization_id))
  with check (public.can_manage_organization(organization_id));

create policy whatsapp_broadcast_recipients_select_members
  on public.whatsapp_broadcast_recipients for select
  using (public.is_organization_member(organization_id));
create policy whatsapp_broadcast_recipients_manage_admins
  on public.whatsapp_broadcast_recipients for all
  using (public.can_manage_organization(organization_id))
  with check (public.can_manage_organization(organization_id));

create policy whatsapp_quick_replies_select_members
  on public.whatsapp_quick_replies for select
  using (public.is_organization_member(organization_id));
create policy whatsapp_quick_replies_manage_admins
  on public.whatsapp_quick_replies for all
  using (public.can_manage_organization(organization_id))
  with check (public.can_manage_organization(organization_id));

create policy whatsapp_campaign_events_select_members
  on public.whatsapp_campaign_events for select
  using (public.is_organization_member(organization_id));
create policy whatsapp_campaign_events_insert_admins
  on public.whatsapp_campaign_events for insert
  with check (public.can_manage_organization(organization_id));

-- Read model for WATI/AiSensy-style campaign analytics.
create or replace view public.v_whatsapp_campaign_performance_v1
with (security_invoker = true)
as
select
  c.organization_id,
  c.id as campaign_id,
  c.name,
  c.status,
  c.whatsapp_template_id,
  c.audience_segment_id,
  c.scheduled_at,
  c.approved_at,
  c.started_at,
  c.completed_at,
  c.audience_count,
  c.eligible_count,
  c.excluded_count,
  c.queued_count,
  c.sent_count,
  c.delivered_count,
  c.read_count,
  c.replied_count,
  c.failed_count,
  case when c.sent_count > 0 then round((c.delivered_count::numeric / c.sent_count::numeric) * 100, 2) else 0 end as delivery_rate_pct,
  case when c.delivered_count > 0 then round((c.read_count::numeric / c.delivered_count::numeric) * 100, 2) else 0 end as read_rate_pct,
  case when c.sent_count > 0 then round((c.replied_count::numeric / c.sent_count::numeric) * 100, 2) else 0 end as reply_rate_pct,
  c.created_at,
  c.updated_at
from public.whatsapp_broadcast_campaigns c;

grant select, insert, update, delete on public.whatsapp_audience_segments to authenticated, service_role;
grant select, insert, update, delete on public.whatsapp_broadcast_campaigns to authenticated, service_role;
grant select, insert, update, delete on public.whatsapp_broadcast_recipients to authenticated, service_role;
grant select, insert, update, delete on public.whatsapp_quick_replies to authenticated, service_role;
grant select, insert on public.whatsapp_campaign_events to authenticated, service_role;
grant select on public.v_whatsapp_campaign_performance_v1 to authenticated, service_role;
