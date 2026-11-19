-- Per-business settings for Sales AI and tracked links (multi-tenant).
--
-- Every business (organization) gets its own switches instead of one global
-- switch for the whole CRM:
--   * plan: 'standard' or 'premium'. Premium allows a branded link domain.
--   * autopilot_enabled / dm_links_enabled: switched on per business.
--   * website_hosts: the business's own website(s); links may only point there.
--   * link_domain: optional branded short-link domain (premium only), e.g.
--     go.yogakulamacademy.com. Without one, links use salsysos.com/go/<code>.
--
-- Only the platform (service role) changes these for now; business admins can
-- read their own settings.

create table if not exists public.organization_sales_ai_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  plan text not null default 'standard' check (plan in ('standard', 'premium')),
  autopilot_enabled boolean not null default false,
  autopilot_daily_new_leads integer not null default 20 check (autopilot_daily_new_leads between 0 and 200),
  autopilot_pilot_start timestamptz,
  dm_links_enabled boolean not null default false,
  website_hosts text[] not null default '{}'
    check (array_position(website_hosts, null) is null),
  link_domain text unique
    check (link_domain is null or link_domain ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'),
  link_domain_verified_at timestamptz,
  updated_at timestamptz not null default now(),
  -- A branded link domain is a premium feature.
  constraint org_sales_ai_link_domain_premium check (link_domain is null or plan = 'premium')
);

alter table public.organization_sales_ai_settings enable row level security;
drop policy if exists organization_sales_ai_settings_select on public.organization_sales_ai_settings;
create policy organization_sales_ai_settings_select on public.organization_sales_ai_settings
  for select to authenticated using (public.is_organization_member(organization_id));
revoke insert, update, delete on public.organization_sales_ai_settings from anon, authenticated;
revoke all on public.organization_sales_ai_settings from anon;
grant select on public.organization_sales_ai_settings to authenticated;

-- Links may point to any HTTPS page; the server checks it is the business's own website.
alter table public.dm_tracked_links drop constraint if exists dm_tracked_links_destination_url_check;
alter table public.dm_tracked_links add constraint dm_tracked_links_destination_url_check
  check (destination_url ~ '^https://[^/\s]+/');

-- Mark a link as sent when an outbound message contains it, on any link domain
-- (salsysos.com/go/<code> or a business's branded domain). Codes are random and
-- matched only for the same lead, so other URLs in a message never match.
create or replace function public.mark_dm_link_sent_v1()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $function$
declare
  v_code text;
begin
  if new.direction <> 'outbound' or new.body is null or new.lead_id is null then
    return new;
  end if;
  for v_code in
    select distinct (regexp_matches(new.body, 'https?://[A-Za-z0-9.-]+/(?:go/)?([A-Za-z0-9]{8,16})(?![A-Za-z0-9])', 'g'))[1]
  loop
    update public.dm_tracked_links
    set sent_at = coalesce(sent_at, coalesce(new.sent_at, new.created_at, now())),
        sent_message_id = coalesce(sent_message_id, new.id)
    where code = v_code and lead_id = new.lead_id and sent_at is null;
  end loop;
  return new;
end;
$function$;

-- Yogakulam Academy: the first business. Premium, branded link domain (verified
-- once its DNS points here), its website, and Autopilot as it is today.
insert into public.organization_sales_ai_settings
  (organization_id, plan, autopilot_enabled, autopilot_pilot_start, dm_links_enabled, website_hosts, link_domain)
select o.id, 'premium', true, '2026-11-18T15:53:00Z', false,
       array['yogakulamacademy.com', 'www.yogakulamacademy.com'], 'go.yogakulamacademy.com'
from public.organizations o
where o.id = '3d9ef175-1624-4d89-a0bd-73d3f82c23c0'
on conflict (organization_id) do nothing;

comment on table public.organization_sales_ai_settings is
  'Per-business Sales AI switches, plan and tracked-link domain. Standard plan links use salsysos.com/go/<code>; premium may use a verified branded domain.';
