-- Tracked course links for Instagram DMs (DM-LINK, owner-approved 19 Nov 2026).
--
-- Each lead gets a short link (go.yogakulamacademy.com/<code>) to a course page.
-- When the lead opens it, we record the approximate country of the network they
-- opened it from ("visit country"). This is shown to the team only: it is NOT
-- nationality, residence or pricing eligibility, and never changes leads.country.
-- Previews and bots (e.g. Instagram's link preview fetcher) are stored as such
-- and never count as an open.
--
-- Writes happen only through the server (service role); staff can read links for
-- leads they can access.

create table if not exists public.dm_tracked_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  course_id uuid references public.courses(id) on delete set null,
  code text not null unique check (code ~ '^[A-Za-z0-9]{8,16}$'),
  destination_url text not null check (destination_url ~ '^https://(www\.)?yogakulamacademy\.com/'),
  created_by text not null default 'ai' check (created_by in ('ai', 'staff')),
  sent_message_id uuid references public.messages(id) on delete set null,
  sent_at timestamptz,
  first_opened_at timestamptz,
  last_opened_at timestamptz,
  open_count integer not null default 0,
  visit_country text check (visit_country is null or visit_country ~ '^[A-Z]{2}$'),
  visit_region text,
  attention_task_id uuid references public.tasks(id) on delete set null,
  expires_at timestamptz not null default (now() + interval '60 days'),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists dm_tracked_links_lead_idx on public.dm_tracked_links (lead_id, created_at desc);
create index if not exists dm_tracked_links_unopened_idx on public.dm_tracked_links (sent_at)
  where first_opened_at is null and attention_task_id is null and revoked_at is null;
-- At most one live link per lead and course, so repeated replies reuse it.
create unique index if not exists dm_tracked_links_one_live_per_course
  on public.dm_tracked_links (lead_id, coalesce(course_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where revoked_at is null;

create table if not exists public.dm_tracked_link_visits (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  link_id uuid not null references public.dm_tracked_links(id) on delete cascade,
  visited_at timestamptz not null default now(),
  kind text not null check (kind in ('open', 'preview_or_bot')),
  country text check (country is null or country ~ '^[A-Z]{2}$'),
  region text,
  agent text  -- short browser family only (e.g. 'instagram_inapp'), not the full user agent
);
create index if not exists dm_tracked_link_visits_link_idx on public.dm_tracked_link_visits (link_id, visited_at desc);

alter table public.dm_tracked_links enable row level security;
alter table public.dm_tracked_link_visits enable row level security;

drop policy if exists dm_tracked_links_select on public.dm_tracked_links;
create policy dm_tracked_links_select on public.dm_tracked_links
  for select to authenticated using (public.can_access_lead(lead_id));

drop policy if exists dm_tracked_link_visits_select on public.dm_tracked_link_visits;
create policy dm_tracked_link_visits_select on public.dm_tracked_link_visits
  for select to authenticated using (
    exists (select 1 from public.dm_tracked_links l where l.id = link_id and public.can_access_lead(l.lead_id))
  );

revoke insert, update, delete on public.dm_tracked_links from anon, authenticated;
revoke insert, update, delete on public.dm_tracked_link_visits from anon, authenticated;
revoke all on public.dm_tracked_links, public.dm_tracked_link_visits from anon;
grant select on public.dm_tracked_links, public.dm_tracked_link_visits to authenticated;

-- Record one visit; returns the destination to redirect to (null if unknown/expired).
create or replace function public.record_dm_link_visit_v1(p_code text, p_kind text, p_country text, p_region text, p_agent text)
returns text language plpgsql security definer set search_path = public, pg_temp
as $function$
declare
  v_link public.dm_tracked_links%rowtype;
  v_country text := case when p_country ~ '^[A-Z]{2}$' then p_country else null end;
begin
  if auth.role() is distinct from 'service_role' and session_user not in ('postgres', 'supabase_admin') then
    raise exception 'Link visits are recorded by the system only';
  end if;
  select * into v_link from public.dm_tracked_links where code = p_code for update;
  if not found then return null; end if;
  if v_link.revoked_at is not null or v_link.expires_at < now() then
    return v_link.destination_url; -- still send them to the page, but record nothing
  end if;

  insert into public.dm_tracked_link_visits (organization_id, link_id, kind, country, region, agent)
  values (v_link.organization_id, v_link.id, case when p_kind = 'open' then 'open' else 'preview_or_bot' end,
          v_country, left(p_region, 60), left(p_agent, 40));

  if p_kind = 'open' then
    update public.dm_tracked_links
    set open_count = open_count + 1,
        first_opened_at = coalesce(first_opened_at, now()),
        last_opened_at = now(),
        -- Keep the country of the first open; a forwarded link opened elsewhere later does not overwrite it.
        visit_country = coalesce(visit_country, v_country),
        visit_region = case when visit_country is null then left(p_region, 60) else visit_region end
    where id = v_link.id;
  end if;
  return v_link.destination_url;
end;
$function$;

-- When an outbound message containing a link's code is stored (sent from the CRM,
-- by Autopilot, or echoed from the Instagram app), mark the link as sent.
create or replace function public.mark_dm_link_sent_v1()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $function$
declare
  v_code text;
begin
  if new.direction <> 'outbound' or new.body is null or position('go.yogakulamacademy.com/' in new.body) = 0 then
    return new;
  end if;
  for v_code in select (regexp_matches(new.body, 'go\.yogakulamacademy\.com/([A-Za-z0-9]{8,16})', 'g'))[1] loop
    update public.dm_tracked_links
    set sent_at = coalesce(sent_at, coalesce(new.sent_at, new.created_at, now())),
        sent_message_id = coalesce(sent_message_id, new.id)
    where code = v_code and lead_id = new.lead_id and sent_at is null;
  end loop;
  return new;
end;
$function$;

drop trigger if exists messages_mark_dm_link_sent on public.messages;
create trigger messages_mark_dm_link_sent
  after insert or update of body on public.messages
  for each row execute function public.mark_dm_link_sent_v1();

revoke all on function public.record_dm_link_visit_v1(text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.record_dm_link_visit_v1(text, text, text, text, text) to service_role;
revoke all on function public.mark_dm_link_sent_v1() from public, anon, authenticated;

comment on table public.dm_tracked_links is
  'Per-lead tracked course links sent in DMs. visit_country is the approximate network country of the first genuine open: shown to staff only, never nationality, residence or pricing eligibility.';
