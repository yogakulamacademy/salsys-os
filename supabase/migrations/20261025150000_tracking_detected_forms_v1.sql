create table if not exists public.tracking_forms (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  organization_site_id uuid not null references public.organization_sites(id) on delete cascade,
  tracking_source_id uuid references public.tracking_sources(id) on delete set null,
  form_key text not null,
  form_name text,
  page_path text not null,
  form_action text,
  method text not null default 'post',
  status text not null default 'detected',
  lead_capture_enabled boolean not null default false,
  field_inventory jsonb not null default '[]'::jsonb,
  field_mapping jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tracking_forms_status_check check (status in ('detected', 'enabled', 'ignored')),
  constraint tracking_forms_method_check check (method in ('get', 'post', 'put', 'patch', 'delete')),
  constraint tracking_forms_inventory_array_check check (jsonb_typeof(field_inventory) = 'array'),
  constraint tracking_forms_mapping_object_check check (jsonb_typeof(field_mapping) = 'object'),
  constraint tracking_forms_metadata_object_check check (jsonb_typeof(metadata) = 'object'),
  constraint tracking_forms_unique_form unique (organization_id, organization_site_id, form_key)
);

create index if not exists tracking_forms_org_last_seen_idx
  on public.tracking_forms (organization_id, last_seen_at desc);

create index if not exists tracking_forms_site_status_idx
  on public.tracking_forms (organization_site_id, status, last_seen_at desc);

create index if not exists tracking_forms_source_idx
  on public.tracking_forms (tracking_source_id)
  where tracking_source_id is not null;

alter table public.tracking_forms enable row level security;
alter table public.tracking_forms force row level security;

revoke all on table public.tracking_forms from public;
revoke all on table public.tracking_forms from anon;
revoke all on table public.tracking_forms from authenticated;
grant select, insert, update, delete on table public.tracking_forms to service_role;

comment on table public.tracking_forms is
  'Tenant-scoped registry of website forms detected by the Universal Tracking SDK. Stores form/field metadata and explicit lead-capture configuration; never stores submitted field values.';

comment on column public.tracking_forms.field_inventory is
  'Safe field metadata only (selector/name/type/label/required). No user-entered values.';

comment on column public.tracking_forms.field_mapping is
  'Explicit canonical lead-field to CSS-selector mapping configured by a workspace owner/admin.';
