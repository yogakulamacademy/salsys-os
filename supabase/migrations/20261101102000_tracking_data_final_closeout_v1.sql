-- Tracking & Data final closeout v1
--
-- Preserve raw touchpoint RLS. Anonymous pre-CRM touchpoints remain unreadable
-- as rows to ordinary authenticated clients. The tenant-authorized aggregate
-- RPC is the only place that may include them in health/funnel counts.

begin;

create or replace function public.get_tracking_workspace_v2(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'auth', 'pg_temp'
as $function$
begin
  if p_organization_id is null then
    raise exception 'Organization ID is required';
  end if;

  if not public.is_organization_member(p_organization_id) then
    raise exception 'Not authorized for organization %', p_organization_id;
  end if;

  return (
    with visible_touchpoints as materialized (
      select t.*
      from public.touchpoints t
      where t.organization_id = p_organization_id
        and (
          t.lead_id is null
          or exists (
            select 1
            from public.leads l
            where l.id = t.lead_id
              and l.organization_id = p_organization_id
              and public.can_access_lead(l.id)
          )
        )
    ),
    health as (
      select
        count(*) filter (where t.occurred_at >= now() - interval '24 hours') as events_24h,
        count(distinct t.anonymous_visitor_id) filter (where t.occurred_at >= now() - interval '24 hours') as visitors_24h,
        count(*) filter (where t.lead_id is not null and t.occurred_at >= now() - interval '24 hours') as identified_events_24h,
        count(*) filter (where t.gclid is not null and t.occurred_at >= now() - interval '7 days') as gclid_events_7d,
        count(*) filter (where t.fbclid is not null and t.occurred_at >= now() - interval '7 days') as fbclid_events_7d,
        max(t.occurred_at) as last_event_at
      from visible_touchpoints t
    ),
    capture as (
      select
        count(*) filter (where e.received_at >= now() - interval '24 hours') as submissions_24h,
        count(*) filter (where e.received_at >= now() - interval '24 hours' and e.matched_existing = false) as new_leads_24h,
        count(*) filter (where e.received_at >= now() - interval '24 hours' and e.matched_existing = true) as matched_existing_24h,
        count(*) filter (where e.received_at >= now() - interval '7 days') as submissions_7d,
        max(e.received_at) as last_submission_at
      from public.lead_ingest_events e
      where e.organization_id = p_organization_id
        and public.is_crm_user()
    ),
    funnel as (
      select
        count(*) filter (where t.event_type = 'page_view' and t.occurred_at >= now() - interval '7 days') as page_views,
        count(distinct t.anonymous_visitor_id) filter (where t.event_type = 'page_view' and t.occurred_at >= now() - interval '7 days') as visitors,
        count(*) filter (where t.event_type = 'form_start' and t.occurred_at >= now() - interval '7 days') as form_starts,
        count(*) filter (where t.event_type = 'lead_form_submit' and t.occurred_at >= now() - interval '7 days') as browser_form_submits,
        count(*) filter (
          where t.event_type = any(array[
            'whatsapp_click','instagram_click','email_click','phone_click','enrollment_cta_click'
          ])
          and t.occurred_at >= now() - interval '7 days'
        ) as contact_cta_clicks,
        count(*) filter (where t.lead_id is not null and t.occurred_at >= now() - interval '7 days') as identified_touchpoints
      from visible_touchpoints t
    )
    select jsonb_build_object(
      'health', to_jsonb(h),
      'capture', to_jsonb(c),
      'funnel', to_jsonb(f)
    )
    from health h, capture c, funnel f
  );
end;
$function$;

comment on function public.get_tracking_workspace_v2(uuid) is
  'Tenant-authorized aggregate tracking workspace. Includes tenant-owned anonymous pre-CRM touchpoints in aggregate health/funnel counts without exposing raw anonymous rows; linked touchpoints additionally require lead access.';

revoke all on function public.get_tracking_workspace_v2(uuid) from public, anon;
grant execute on function public.get_tracking_workspace_v2(uuid) to authenticated, service_role;

commit;
