-- Correction (21 Nov 2026): Instagram's link scanner opened every course link
-- ~2 s after it was sent, with a desktop browser signature from the US. Those
-- were counted as the lead opening the link, and 5 leads were marked as being
-- in the United States from it. The /go route now ignores such opens; this
-- fixes what was already recorded.

-- 1) Scanner "opens": within 30 s of sending, not from the Instagram/Facebook app.
update public.dm_tracked_link_visits v
set kind = 'preview_or_bot'
from public.dm_tracked_links l
where v.link_id = l.id
  and v.kind = 'open'
  and l.sent_at is not null
  and coalesce(v.agent, '') not in ('instagram_inapp', 'facebook_inapp')
  and v.visited_at >= l.sent_at - interval '5 seconds'
  and v.visited_at < l.sent_at + interval '30 seconds';

-- 2) Recount each link from real opens only.
with real as (
  select link_id, min(visited_at) first_at, max(visited_at) last_at, count(*) n,
         (array_agg(country order by visited_at) filter (where country is not null))[1] first_country,
         (array_agg(region order by visited_at) filter (where country is not null))[1] first_region
  from public.dm_tracked_link_visits where kind = 'open' group by link_id
)
update public.dm_tracked_links l
set first_opened_at = r.first_at, last_opened_at = r.last_at, open_count = coalesce(r.n, 0),
    visit_country = r.first_country, visit_region = r.first_region
from public.dm_tracked_links l2
left join real r on r.link_id = l2.id
where l.id = l2.id
  and (l.first_opened_at is distinct from r.first_at or l.visit_country is distinct from r.first_country or l.open_count is distinct from coalesce(r.n, 0));

-- 3) Leads whose location came only from a scanner open: let the location scan work it out again.
update public.leads ld
set metadata = (coalesce(ld.metadata, '{}'::jsonb) - 'location') - 'location_scanned_at'
where ld.metadata->'location'->>'source' = 'link_visit'
  and not exists (
    select 1 from public.dm_tracked_links l
    where l.lead_id = ld.id and l.visit_country is not null
  );

-- 4) Leads whose links did get real opens later (all from India) still showed
--    the scanner's "United States": clear it so the scan uses the real open.
update public.leads ld
set metadata = (coalesce(ld.metadata, '{}'::jsonb) - 'location') - 'location_scanned_at'
where ld.metadata->'location'->>'source' = 'link_visit'
  and ld.metadata->'location'->>'country' = 'United States'
  and not exists (select 1 from public.dm_tracked_links l where l.lead_id = ld.id and l.visit_country = 'US');
