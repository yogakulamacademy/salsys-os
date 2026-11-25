-- Which ad started each Instagram chat (25 Nov 2026).
--
-- Instagram includes a `referral` block (source ADS, ad_id, ad title) on the
-- first message a person sends after tapping a click-to-message ad. Those
-- messages are already kept in raw_events but the ad was never attached to
-- the lead. This links them, one row per lead and ad.
--
-- Read-only from raw_events and conversations; writes only this table.
-- Idempotent: running it again over the same events changes nothing except
-- widening first/last seen. Nothing is sent to anyone.

create table if not exists public.lead_ad_referrals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  channel text not null default 'instagram',
  ad_id text not null check (ad_id ~ '^[0-9]{4,40}$'),
  ad_title text,
  post_id text,
  referral_type text,
  first_seen_at timestamptz not null,
  last_seen_at timestamptz not null,
  first_raw_event_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lead_id, ad_id)
);

create index if not exists lead_ad_referrals_org_ad_idx on public.lead_ad_referrals (organization_id, ad_id);
create index if not exists lead_ad_referrals_lead_idx on public.lead_ad_referrals (lead_id);

alter table public.lead_ad_referrals enable row level security;

-- Same visibility as the lead itself.
drop policy if exists lead_ad_referrals_read on public.lead_ad_referrals;
create policy lead_ad_referrals_read on public.lead_ad_referrals
  for select to authenticated
  using (lead_id in (select visible_lead.id from public.leads visible_lead));

revoke all on public.lead_ad_referrals from anon;
grant select on public.lead_ad_referrals to authenticated;

create or replace function public.project_instagram_ad_referrals_v1(p_since timestamptz default now() - interval '30 minutes')
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rows integer;
begin
  with refs as (
    select
      e.id as raw_event_id,
      e.organization_id,
      e.source_account_id,
      e.source_subject_id,
      coalesce(e.occurred_at, e.created_at) as seen_at,
      jsonb_path_query_first(e.payload, 'strict $.**.referral') as ref
    from public.raw_events e
    where e.source_system = 'instagram'
      and e.created_at >= p_since
      and e.organization_id is not null
      and e.source_account_id ~ '^[0-9]{4,30}$'
      and e.source_subject_id ~ '^[0-9]{4,40}$'
      and jsonb_path_exists(e.payload, 'strict $.**.referral ? (@.source == "ADS")')
  ),
  matched as (
    select
      r.organization_id,
      c.lead_id,
      r.ref ->> 'ad_id' as ad_id,
      left(nullif(r.ref -> 'ads_context_data' ->> 'ad_title', ''), 300) as ad_title,
      left(nullif(r.ref -> 'ads_context_data' ->> 'post_id', ''), 64) as post_id,
      left(nullif(r.ref ->> 'type', ''), 40) as referral_type,
      r.seen_at,
      r.raw_event_id
    from refs r
    join public.conversations c
      on c.organization_id = r.organization_id
     and c.channel = 'instagram'
     and c.external_account_id = r.source_account_id
     and c.external_conversation_id = r.source_account_id || ':' || r.source_subject_id
    join public.leads l on l.id = c.lead_id and l.organization_id = r.organization_id
    where (r.ref ->> 'ad_id') ~ '^[0-9]{4,40}$'
  ),
  grouped as (
    select
      organization_id, lead_id, ad_id,
      (array_agg(ad_title order by seen_at) filter (where ad_title is not null))[1] as ad_title,
      (array_agg(post_id order by seen_at) filter (where post_id is not null))[1] as post_id,
      (array_agg(referral_type order by seen_at))[1] as referral_type,
      min(seen_at) as first_seen_at,
      max(seen_at) as last_seen_at,
      (array_agg(raw_event_id order by seen_at))[1] as first_raw_event_id
    from matched
    group by organization_id, lead_id, ad_id
  )
  insert into public.lead_ad_referrals as t
    (organization_id, lead_id, ad_id, ad_title, post_id, referral_type, first_seen_at, last_seen_at, first_raw_event_id)
  select organization_id, lead_id, ad_id, ad_title, post_id, referral_type, first_seen_at, last_seen_at, first_raw_event_id
  from grouped
  on conflict (lead_id, ad_id) do update set
    ad_title = coalesce(t.ad_title, excluded.ad_title),
    post_id = coalesce(t.post_id, excluded.post_id),
    first_seen_at = least(t.first_seen_at, excluded.first_seen_at),
    first_raw_event_id = case when excluded.first_seen_at < t.first_seen_at then excluded.first_raw_event_id else t.first_raw_event_id end,
    last_seen_at = greatest(t.last_seen_at, excluded.last_seen_at),
    updated_at = now()
  where excluded.first_seen_at < t.first_seen_at or excluded.last_seen_at > t.last_seen_at;

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

revoke all on function public.project_instagram_ad_referrals_v1(timestamptz) from public, anon, authenticated;
grant execute on function public.project_instagram_ad_referrals_v1(timestamptz) to service_role;

comment on function public.project_instagram_ad_referrals_v1(timestamptz) is
  'Links the click-to-message ad (Instagram referral.source = ADS) in raw_events to the lead whose conversation it started. Idempotent; writes only lead_ad_referrals.';

-- Every 5 minutes, look back 30 minutes (overlap keeps it safe if a run is skipped).
do $$
begin
  if not exists (select 1 from cron.job where jobname = 'salsys-instagram-ad-referrals-v1') then
    perform cron.schedule(
      'salsys-instagram-ad-referrals-v1',
      '*/5 * * * *',
      $cron$select public.project_instagram_ad_referrals_v1(now() - interval '30 minutes');$cron$
    );
  end if;
end;
$$;

-- One-time backfill of everything already received.
select public.project_instagram_ad_referrals_v1('-infinity'::timestamptz);
