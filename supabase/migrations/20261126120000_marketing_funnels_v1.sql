-- Funnel advisor (owner-approved prototype "Funnel advisor", 26 Nov 2026; new
-- write path approved by the owner the same day). Funnels the team defines
-- (including SEO funnels: search terms + landing pages), and the changes they
-- try on a step, compared before and after. Writes only through the RPCs below
-- for managers and admins; members can read their own organisation's rows.

create table if not exists public.marketing_funnels (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null default 'general' check (kind in ('general', 'seo')),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  course_id uuid references public.courses(id) on delete set null,
  goal text check (goal is null or char_length(goal) <= 160),
  steps jsonb not null default '[]'::jsonb check (jsonb_typeof(steps) = 'array'),
  pages jsonb not null default '[]'::jsonb check (jsonb_typeof(pages) = 'array'),
  terms jsonb not null default '[]'::jsonb check (jsonb_typeof(terms) = 'array'),
  status text not null default 'live' check (status in ('draft', 'live', 'archived')),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists marketing_funnels_org_idx on public.marketing_funnels (organization_id, status);

create table if not exists public.marketing_funnel_changes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  funnel_id uuid not null references public.marketing_funnels(id) on delete cascade,
  step text not null check (char_length(step) <= 40),
  title text not null check (char_length(btrim(title)) between 1 and 160),
  details text check (details is null or char_length(details) <= 2000),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists marketing_funnel_changes_funnel_idx on public.marketing_funnel_changes (funnel_id, started_at desc);

alter table public.marketing_funnels enable row level security;
alter table public.marketing_funnel_changes enable row level security;

drop policy if exists marketing_funnels_select on public.marketing_funnels;
create policy marketing_funnels_select on public.marketing_funnels
  for select to authenticated using (public.is_organization_member(organization_id));
drop policy if exists marketing_funnel_changes_select on public.marketing_funnel_changes;
create policy marketing_funnel_changes_select on public.marketing_funnel_changes
  for select to authenticated using (public.is_organization_member(organization_id));

revoke all on table public.marketing_funnels from anon, authenticated;
revoke all on table public.marketing_funnel_changes from anon, authenticated;
grant select on table public.marketing_funnels to authenticated;
grant select on table public.marketing_funnel_changes to authenticated;
grant all on table public.marketing_funnels to service_role;
grant all on table public.marketing_funnel_changes to service_role;

create or replace function app_private.assert_can_manage_marketing_funnels_v1(p_organization_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_organization_id is null
     or not (coalesce(public.can_manage_organization(p_organization_id), false)
             or coalesce(public.can_administer_organization_crm(p_organization_id), false))
     or not coalesce(public.can_mutate_organization(p_organization_id), false) then
    raise exception 'Not authorized for selected workspace';
  end if;
end;
$$;
revoke all on function app_private.assert_can_manage_marketing_funnels_v1(uuid) from public, anon, authenticated;

create or replace function public.save_marketing_funnel_v1(
  p_organization_id uuid,
  p_funnel_id uuid,
  p_kind text,
  p_name text,
  p_course_id uuid,
  p_goal text,
  p_steps jsonb,
  p_pages jsonb,
  p_terms jsonb,
  p_status text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_allowed text[] := array['search_views', 'search_clicks', 'page_visits', 'form_fills', 'link_clicks',
    'enq_any', 'enq_instagram', 'enq_whatsapp', 'enq_website', 'enq_google', 'enq_ai', 'replied', 'qualified', 'paid'];
begin
  perform app_private.assert_can_manage_marketing_funnels_v1(p_organization_id);
  if coalesce(p_kind, 'general') not in ('general', 'seo') then raise exception 'Unknown funnel type'; end if;
  if coalesce(p_status, 'live') not in ('draft', 'live', 'archived') then raise exception 'Unknown funnel status'; end if;
  if p_steps is null or jsonb_typeof(p_steps) <> 'array' or jsonb_array_length(p_steps) < 2 or jsonb_array_length(p_steps) > 12 then
    raise exception 'A funnel needs between 2 and 12 steps';
  end if;
  if exists (select 1 from jsonb_array_elements(p_steps) s where jsonb_typeof(s) <> 'string' or not (s #>> '{}') = any(v_allowed)) then
    raise exception 'Unknown funnel step';
  end if;
  if coalesce(jsonb_typeof(p_pages), 'array') <> 'array' or jsonb_array_length(coalesce(p_pages, '[]')) > 40
     or exists (select 1 from jsonb_array_elements(coalesce(p_pages, '[]')) s where jsonb_typeof(s) <> 'string' or char_length(s #>> '{}') > 300) then
    raise exception 'Pages must be a list of up to 40 paths';
  end if;
  if coalesce(jsonb_typeof(p_terms), 'array') <> 'array' or jsonb_array_length(coalesce(p_terms, '[]')) > 40
     or exists (select 1 from jsonb_array_elements(coalesce(p_terms, '[]')) s where jsonb_typeof(s) <> 'string' or char_length(s #>> '{}') > 120) then
    raise exception 'Search terms must be a list of up to 40 terms';
  end if;
  if p_course_id is not null and not exists (
    select 1 from public.courses c where c.id = p_course_id and c.organization_id = p_organization_id) then
    raise exception 'Course not found in selected workspace';
  end if;

  if p_funnel_id is null then
    insert into public.marketing_funnels (organization_id, kind, name, course_id, goal, steps, pages, terms, status, created_by)
    values (p_organization_id, coalesce(p_kind, 'general'), btrim(p_name), p_course_id, nullif(btrim(coalesce(p_goal, '')), ''),
            p_steps, coalesce(p_pages, '[]'), coalesce(p_terms, '[]'), coalesce(p_status, 'live'), auth.uid())
    returning id into v_id;
  else
    update public.marketing_funnels
    set kind = coalesce(p_kind, kind), name = btrim(p_name), course_id = p_course_id,
        goal = nullif(btrim(coalesce(p_goal, '')), ''), steps = p_steps, pages = coalesce(p_pages, '[]'),
        terms = coalesce(p_terms, '[]'), status = coalesce(p_status, status), updated_at = now()
    where id = p_funnel_id and organization_id = p_organization_id
    returning id into v_id;
    if v_id is null then raise exception 'Funnel not found in selected workspace'; end if;
  end if;
  return v_id;
end;
$$;

create or replace function public.add_marketing_funnel_change_v1(
  p_organization_id uuid,
  p_funnel_id uuid,
  p_step text,
  p_title text,
  p_details text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform app_private.assert_can_manage_marketing_funnels_v1(p_organization_id);
  if not exists (select 1 from public.marketing_funnels f where f.id = p_funnel_id and f.organization_id = p_organization_id) then
    raise exception 'Funnel not found in selected workspace';
  end if;
  insert into public.marketing_funnel_changes (organization_id, funnel_id, step, title, details, created_by)
  values (p_organization_id, p_funnel_id, btrim(p_step), btrim(p_title), nullif(btrim(coalesce(p_details, '')), ''), auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.end_marketing_funnel_change_v1(p_organization_id uuid, p_change_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app_private.assert_can_manage_marketing_funnels_v1(p_organization_id);
  update public.marketing_funnel_changes set ended_at = coalesce(ended_at, now())
  where id = p_change_id and organization_id = p_organization_id;
  if not found then raise exception 'Change not found in selected workspace'; end if;
end;
$$;

revoke all on function public.save_marketing_funnel_v1(uuid, uuid, text, text, uuid, text, jsonb, jsonb, jsonb, text) from public, anon;
revoke all on function public.add_marketing_funnel_change_v1(uuid, uuid, text, text, text) from public, anon;
revoke all on function public.end_marketing_funnel_change_v1(uuid, uuid) from public, anon;
grant execute on function public.save_marketing_funnel_v1(uuid, uuid, text, text, uuid, text, jsonb, jsonb, jsonb, text) to authenticated, service_role;
grant execute on function public.add_marketing_funnel_change_v1(uuid, uuid, text, text, text) to authenticated, service_role;
grant execute on function public.end_marketing_funnel_change_v1(uuid, uuid) to authenticated, service_role;

-- Everything a funnel can be measured with, for one period. Read-only, service role only.
create or replace function public.marketing_funnel_measure_v1(p_organization_id uuid, p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_from timestamptz := greatest(coalesce(p_from, now() - interval '90 days'), now() - interval '400 days');
  v_to timestamptz := least(coalesce(p_to, now()), now());
  v_out jsonb;
begin
  with
  leads_in as (
    select l.id,
           case
             when l.lead_creation_channel::text = 'instagram' then 'instagram'
             when l.lead_creation_channel::text = 'whatsapp' then 'whatsapp'
             when l.lead_creation_channel::text = 'website' and lower(coalesce(l.first_touch_source, '')) ~ '(^|\.)google\.|googlequicksearchbox|^google$|bing' then 'website_search'
             when l.lead_creation_channel::text = 'website' and lower(coalesce(l.first_touch_source, '')) ~ 'chatgpt|openai|perplexity|gemini|claude\.ai' then 'website_ai'
             when l.lead_creation_channel::text = 'website' then 'website_other'
             else 'other'
           end as cls,
           (l.current_stage::text <> 'new'
             or exists (select 1 from public.messages m where m.lead_id = l.id and m.direction = 'outbound')) as replied,
           l.current_stage::text in ('qualified', 'high_intent', 'payment_pending', 'closed_won', 'enrolled') as qualified
    from public.leads l
    where l.organization_id = p_organization_id
      and l.created_at >= v_from and l.created_at < v_to
      and not coalesce((l.metadata ->> 'test_lead')::boolean, false)
      and l.current_stage::text <> 'duplicate'
  ),
  enr as (
    select e.lead_id, e.course_id from public.enrollments e
    where e.organization_id = p_organization_id and e.status::text <> 'cancelled'
  ),
  lead_course as (
    select i.lead_id, i.course_id from public.lead_course_interests i join leads_in li on li.id = i.lead_id
    where i.organization_id = p_organization_id
    union
    select e.lead_id, e.course_id from enr e join leads_in li on li.id = e.lead_id
  ),
  people as (
    select null::uuid as course_id, li.cls, li.replied, li.qualified or exists (select 1 from enr where enr.lead_id = li.id) as qualified,
           exists (select 1 from enr where enr.lead_id = li.id) as paid
    from leads_in li
    union all
    select lc.course_id, li.cls, li.replied,
           li.qualified or exists (select 1 from enr where enr.lead_id = li.id and enr.course_id = lc.course_id),
           exists (select 1 from enr where enr.lead_id = li.id and enr.course_id = lc.course_id)
    from lead_course lc join leads_in li on li.id = lc.lead_id
  )
  select jsonb_build_object(
    'from', v_from, 'to', v_to,
    'people', coalesce((select jsonb_agg(jsonb_build_object('course', course_id, 'cls', cls, 'replied', replied, 'qualified', qualified, 'paid', paid, 'n', n)) from (
        select course_id, cls, replied, qualified, paid, count(*) as n from people group by 1, 2, 3, 4, 5) p), '[]'::jsonb),
    'pages', coalesce((select jsonb_agg(jsonb_build_object('path', path, 'visits', visits, 'leads', coalesce(leads, 0))) from (
        select lp.path, lp.visits, ld.leads from (
          select regexp_replace(split_part(landing_page, '?', 1), '/$', '') as path, sum(sessions) as visits
          from public.ga4_landing_page_daily
          where organization_id = p_organization_id and analytics_date >= v_from::date and analytics_date < v_to::date + 1
          group by 1 order by 2 desc limit 300) lp
        left join (
          select regexp_replace(split_part(regexp_replace(ws.landing_page, '^https?://[^/]+', ''), '?', 1), '/$', '') as path, count(distinct ws.lead_id) as leads
          from public.web_sessions ws
          where ws.organization_id = p_organization_id and ws.lead_id is not null and ws.started_at >= v_from and ws.started_at < v_to
          group by 1) ld on ld.path = lp.path) x), '[]'::jsonb),
    'searchPages', coalesce((select jsonb_agg(jsonb_build_object('path', path, 'views', views, 'clicks', clicks, 'position', position)) from (
        select regexp_replace(split_part(regexp_replace(page, '^https?://[^/]+', ''), '?', 1), '/$', '') as path,
               sum(impressions) as views, sum(clicks) as clicks,
               round((sum(avg_position * impressions) / nullif(sum(impressions), 0))::numeric, 1) as position
        from public.gsc_page_daily
        where organization_id = p_organization_id and date >= v_from::date and date < v_to::date + 1
        group by 1 order by 2 desc limit 300) g), '[]'::jsonb),
    'searchTerms', coalesce((select jsonb_agg(jsonb_build_object('query', query, 'views', views, 'clicks', clicks, 'position', position)) from (
        select lower(query) as query, sum(impressions) as views, sum(clicks) as clicks,
               round((sum(avg_position * impressions) / nullif(sum(impressions), 0))::numeric, 1) as position
        from public.gsc_query_daily
        where organization_id = p_organization_id and date >= v_from::date and date < v_to::date + 1
        group by 1 order by 2 desc limit 500) q), '[]'::jsonb),
    'mediums', coalesce((select jsonb_agg(jsonb_build_object('source', source, 'medium', medium, 'visits', visits)) from (
        select lower(coalesce(source, '(not set)')) as source, lower(coalesce(medium, '(not set)')) as medium, sum(sessions) as visits
        from public.ga4_source_medium_daily
        where organization_id = p_organization_id and analytics_date >= v_from::date and analytics_date < v_to::date + 1
        group by 1, 2 order by 3 desc limit 60) m), '[]'::jsonb),
    'courses', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name,
        'next', (select min(b.start_date) from public.course_batches b where b.course_id = c.id and b.organization_id = p_organization_id and b.active and b.start_date >= current_date),
        'places', (select coalesce(jsonb_agg(distinct b.location), '[]'::jsonb) from public.course_batches b where b.course_id = c.id and b.organization_id = p_organization_id and b.active and b.start_date >= current_date and b.location is not null)))
        from public.courses c where c.organization_id = p_organization_id and c.active), '[]'::jsonb),
    'switches', coalesce((select jsonb_agg(jsonb_build_object('asked', asked, 'bought', bought, 'n', n)) from (
        select ci.name as asked, ce.name as bought, count(distinct e.lead_id) as n
        from public.enrollments e
        join public.courses ce on ce.id = e.course_id
        join public.lead_course_interests i on i.lead_id = e.lead_id and i.course_id <> e.course_id
        join public.courses ci on ci.id = i.course_id
        where e.organization_id = p_organization_id and e.status::text <> 'cancelled'
          and not exists (select 1 from public.lead_course_interests i2 where i2.lead_id = e.lead_id and i2.course_id = e.course_id)
        group by 1, 2) s), '[]'::jsonb),
    'generatedAt', now()
  ) into v_out;
  return v_out;
end;
$$;

revoke all on function public.marketing_funnel_measure_v1(uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.marketing_funnel_measure_v1(uuid, timestamptz, timestamptz) to service_role;
