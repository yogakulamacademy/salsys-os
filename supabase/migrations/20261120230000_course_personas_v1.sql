-- Ideal persona per course (lead intelligence plan, 20 Nov 2026).
-- One row per business and course. The system refreshes draft_traits from
-- the people who reached a good outcome; a manager approves, which copies the
-- draft into approved_traits. Fit scores use approved traits only, so a
-- refresh never changes scoring until someone approves it.

create table if not exists public.course_personas (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  name text,
  draft_traits jsonb not null default '{}'::jsonb,
  draft_sample_size integer not null default 0 check (draft_sample_size >= 0),
  draft_outcome text,                   -- which outcome the draft was learned from
  draft_computed_at timestamptz,
  approved_traits jsonb,
  approved_sample_size integer check (approved_sample_size is null or approved_sample_size >= 0),
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, course_id)
);

create index if not exists course_personas_org_idx on public.course_personas (organization_id);

alter table public.course_personas enable row level security;

drop policy if exists course_personas_select on public.course_personas;
create policy course_personas_select on public.course_personas
  for select to authenticated using (public.is_organization_member(organization_id));

drop policy if exists course_personas_manage on public.course_personas;
create policy course_personas_manage on public.course_personas
  for all to authenticated
  using (public.can_manage_organization(organization_id))
  with check (public.can_manage_organization(organization_id));

revoke all on public.course_personas from anon;
grant select, insert, update, delete on public.course_personas to authenticated;
