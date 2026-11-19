-- Lead course interests and a structured price list (per business).
--
-- 1. course_prices: each business's prices per course, location and market
--    (India in INR / international in USD), regular and offer price, optional
--    room type. One place for prices; used to estimate a lead's value. Never
--    shown to leads by this table alone (the AI still quotes approved knowledge).
-- 2. lead_course_interests: every course a lead has shown interest in, with
--    where the interest came from (form, page, message, link, staff), how strong
--    it is and when it was last seen. One interest is the lead's main course; its
--    offer price becomes the lead's estimated value (leads.potential_value).
--
-- Staff read both for leads they can access; the server writes them. Business
-- admins manage prices.

create table if not exists public.course_prices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  location text,                        -- e.g. 'mysore', 'kerala', 'bengaluru', 'online'; null = any
  market text not null check (market in ('india', 'international')),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  room_type text check (room_type is null or room_type in ('private', 'shared')),
  regular_price numeric(12,2) check (regular_price is null or regular_price >= 0),
  offer_price numeric(12,2) check (offer_price is null or offer_price >= 0),
  valid_until date,                     -- offer end, if any
  source text not null default 'approved_knowledge',
  notes text,
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check (regular_price is not null or offer_price is not null)
);
create unique index if not exists course_prices_one_active
  on public.course_prices (organization_id, course_id, coalesce(location, ''), market, coalesce(room_type, ''))
  where active;

alter table public.course_prices enable row level security;
drop policy if exists course_prices_select on public.course_prices;
create policy course_prices_select on public.course_prices
  for select to authenticated using (public.is_organization_member(organization_id));
drop policy if exists course_prices_manage on public.course_prices;
create policy course_prices_manage on public.course_prices
  for all to authenticated
  using (public.can_manage_organization(organization_id))
  with check (public.can_manage_organization(organization_id));
revoke all on public.course_prices from anon;
grant select, insert, update, delete on public.course_prices to authenticated;

create table if not exists public.lead_course_interests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  location text,
  strength integer not null default 50 check (strength between 0 and 100),
  sources text[] not null default '{}',  -- e.g. {form, form_page, message, tracked_link, ad, page_views, staff}
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  status text not null default 'active' check (status in ('active', 'dropped', 'enrolled')),
  is_primary boolean not null default false,
  estimated_value numeric(12,2),
  value_currency text check (value_currency is null or value_currency ~ '^[A-Z]{3}$'),
  set_by text not null default 'system' check (set_by in ('system', 'ai', 'staff')),
  updated_at timestamptz not null default now(),
  unique (lead_id, course_id)
);
create index if not exists lead_course_interests_org_course on public.lead_course_interests (organization_id, course_id, status);
create unique index if not exists lead_course_interests_one_primary
  on public.lead_course_interests (lead_id) where is_primary;

alter table public.lead_course_interests enable row level security;
drop policy if exists lead_course_interests_select on public.lead_course_interests;
create policy lead_course_interests_select on public.lead_course_interests
  for select to authenticated using (public.can_access_lead(lead_id));
revoke insert, update, delete on public.lead_course_interests from anon, authenticated;
revoke all on public.lead_course_interests from anon;
grant select on public.lead_course_interests to authenticated;

comment on table public.course_prices is
  'Per-business course prices (regular/offer, INR for India, USD international). Used to estimate lead value.';
comment on table public.lead_course_interests is
  'Every course a lead showed interest in, with sources and strength; the primary interest sets leads.interested_course_id and potential_value.';
