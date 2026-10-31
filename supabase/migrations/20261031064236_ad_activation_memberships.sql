begin;

create table public.ad_audience_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  audience_id uuid not null references public.ad_audience_definitions(id) on delete cascade,
  person_id uuid not null references public.persons(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  status text not null default 'active',
  qualified_at timestamptz not null default now(),
  removed_at timestamptz,
  qualification_reason text,
  safe_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ad_audience_memberships_status_check check (status in ('active','removed')),
  constraint ad_audience_memberships_safe_snapshot_object check (jsonb_typeof(safe_snapshot) = 'object'),
  constraint ad_audience_memberships_removed_consistency check (
    (status = 'active' and removed_at is null)
    or (status = 'removed' and removed_at is not null)
  ),
  constraint ad_audience_memberships_audience_person_unique unique (audience_id, person_id)
);

commit;
